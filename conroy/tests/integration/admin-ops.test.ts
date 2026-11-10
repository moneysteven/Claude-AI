import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as functionPOST } from "@/app/api/retell/functions/[name]/route";
import { GET as configGET } from "@/app/api/public/[slug]/config/route";
import { setBusinessStatus } from "@/lib/admin";
import { billForBusiness, checkUsageAlerts, computeBill, DEFAULT_PLANS, getPlans, periodBounds, periodOf, shiftPeriod, usageForPeriod } from "@/lib/billing";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { connectionSummary, saveCalendarSettings, saveWhatsAppSettings } from "@/lib/connections";
import { db } from "@/lib/db";
import { runReminderScan } from "@/lib/jobs/handlers";
import { signRetellBody } from "@/lib/retell/verify";
import { recordUsage } from "@/lib/usage";
import { canManageRole, changeOwnPassword, createUser, resetUserPassword, setUserActive, UserError } from "@/lib/users";
import { sha256Hex } from "@/lib/crypto";
import { createSalon, ensureTestDb, resetDb, type Fixture } from "./helpers";

describe("plans, usage and overage", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("billing-salon");
  });

  it("uses Jamaica calendar months", () => {
    const { from, to } = periodBounds("2026-11");
    expect(from.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(periodOf(new Date("2026-12-01T03:00:00Z"))).toBe("2026-11"); // still 30 Nov, 10 PM in Kingston
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
  });

  it("seeds default plans once and computes overage", async () => {
    const plans = await getPlans();
    expect(plans.STARTER.includedVoiceMinutes).toBe(DEFAULT_PLANS.STARTER.includedVoiceMinutes);
    const bill = computeBill(plans.LITE, { voiceMinutes: 75, whatsappOutbound: 520 });
    expect(bill.overageMinutes).toBe(15);
    expect(bill.voiceOverageCents).toBe(15 * plans.LITE.voiceOveragePerMinuteCents);
    expect(bill.overageMessages).toBe(20);
    expect(bill.totalCents).toBe(plans.LITE.monthlyPriceCents + bill.voiceOverageCents + bill.messageOverageCents);
    expect(bill.minutesPercent).toBe(125);
  });

  it("rounds each call up to the minute, like carriers", async () => {
    const period = periodOf();
    await recordUsage(f.business.id, "VOICE_SECONDS", 61, "call:a"); // 2 min
    await recordUsage(f.business.id, "VOICE_SECONDS", 30, "call:b"); // 1 min
    await recordUsage(f.business.id, "VOICE_SECONDS", 30, "call:b"); // retry: not counted twice
    await recordUsage(f.business.id, "WHATSAPP_OUTBOUND_TEMPLATE", 1, "m1");
    await recordUsage(f.business.id, "WHATSAPP_OUTBOUND_SESSION", 1, "m2");
    const u = await usageForPeriod(f.business.id, period);
    expect(u).toMatchObject({ calls: 2, voiceSeconds: 91, voiceMinutes: 3, whatsappOutbound: 2 });
  });

  it("alerts once at 80% and once at 100% of included minutes", async () => {
    await db.business.update({ where: { id: f.business.id }, data: { plan: "LITE" } });
    const business = await db.business.findUniqueOrThrow({ where: { id: f.business.id } });
    const included = (await getPlans()).LITE.includedVoiceMinutes;
    await recordUsage(business.id, "VOICE_SECONDS", Math.ceil(included * 0.85) * 60, "call:big");
    expect(await checkUsageAlerts(business)).toEqual(["VOICE_MINUTES:80"]);
    expect(await checkUsageAlerts(business)).toEqual([]); // not again
    await recordUsage(business.id, "VOICE_SECONDS", Math.ceil(included * 0.2) * 60, "call:big2");
    expect(await checkUsageAlerts(business)).toEqual(["VOICE_MINUTES:100"]);
    expect(await db.usageAlert.count({ where: { businessId: business.id } })).toBe(2);
    const { bill } = await billForBusiness(business, periodOf());
    expect(bill.overageMinutes).toBeGreaterThan(0);
  });
});

describe("user accounts", () => {
  let f: Fixture;
  let other: Fixture;
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("users-salon");
    other = await createSalon("other-salon");
  });

  it("limits who can create which role", () => {
    expect(canManageRole("OWNER", "OWNER")).toBe(true);
    expect(canManageRole("MANAGER", "STAFF")).toBe(true);
    expect(canManageRole("MANAGER", "OWNER")).toBe(false);
    expect(canManageRole("STAFF", "STAFF")).toBe(false);
    expect(canManageRole("OWNER", "SUPER_ADMIN")).toBe(false);
  });

  it("creates accounts with a one-time password that must be changed", async () => {
    const owner = await db.user.create({ data: { email: "owner@users.example", name: "Owner", role: "OWNER", businessId: f.business.id, passwordHash: await hashPassword("owner-password-1") } });
    const actor = { id: owner.id, role: owner.role };
    const { user, tempPassword } = await createUser({ businessId: f.business.id, email: "Keisha@Users.Example", name: "Keisha", role: "STAFF", actor });
    expect(user.email).toBe("keisha@users.example");
    expect(user.mustChangePassword).toBe(true);
    await expect(createUser({ businessId: f.business.id, email: "keisha@users.example", name: "Dup", role: "STAFF", actor })).rejects.toBeInstanceOf(UserError);

    // Changing the password: wrong current fails, then other sessions are signed out.
    await db.session.createMany({
      data: [
        { userId: user.id, tokenHash: sha256Hex("this-browser"), expiresAt: new Date(Date.now() + 3600_000) },
        { userId: user.id, tokenHash: sha256Hex("old-phone"), expiresAt: new Date(Date.now() + 3600_000) },
      ],
    });
    await expect(changeOwnPassword(user.id, "wrong", "a-brand-new-password")).rejects.toThrow(/current password/);
    await expect(changeOwnPassword(user.id, tempPassword, "short")).rejects.toThrow(/10 characters/);
    await changeOwnPassword(user.id, tempPassword, "Keisha-own-pass-2026", "this-browser");
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustChangePassword).toBe(false);
    expect(await verifyPassword("Keisha-own-pass-2026", updated.passwordHash)).toBe(true);
    expect((await db.session.findMany({ where: { userId: user.id } })).map((s) => s.tokenHash)).toEqual([sha256Hex("this-browser")]);
  });

  it("keeps at least one owner and blocks cross-business changes", async () => {
    const owner = await db.user.create({ data: { email: "solo@users.example", name: "Solo", role: "OWNER", businessId: f.business.id, passwordHash: "x" } });
    const manager = await db.user.create({ data: { email: "mgr@users.example", name: "Mgr", role: "MANAGER", businessId: f.business.id, passwordHash: "x" } });
    const stranger = await db.user.create({ data: { email: "boss@other.example", name: "Other boss", role: "OWNER", businessId: other.business.id, passwordHash: "x" } });
    const superAdmin = { id: "steven", role: "SUPER_ADMIN" as const };
    await expect(setUserActive(owner.id, f.business.id, false, superAdmin)).rejects.toThrow(/at least one active owner/);
    await expect(resetUserPassword(manager.id, other.business.id, { id: stranger.id, role: "OWNER" })).rejects.toThrow(/not found/);
    await expect(resetUserPassword(owner.id, f.business.id, { id: manager.id, role: "MANAGER" })).rejects.toThrow(/can't change/);
    const reset = await resetUserPassword(manager.id, f.business.id, { id: owner.id, role: "OWNER" });
    expect((await db.user.findUniqueOrThrow({ where: { id: manager.id } })).mustChangePassword).toBe(true);
    expect(reset.tempPassword).toMatch(/^Conroy-/);
  });
});

describe("connections", () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("conn-salon");
  });

  it("saves WhatsApp credentials encrypted, keeps them when left blank, and refuses a number another business owns", async () => {
    await createSalon("taken-salon", { waPhoneNumberId: "pn-taken" });
    await expect(saveWhatsAppSettings(f.business.id, { provider: "META", phoneNumberId: "pn-taken" }, "admin")).rejects.toThrow(/already belongs/);
    await saveWhatsAppSettings(f.business.id, { provider: "DIALOG360", phoneNumberId: "pn-mine", apiKey: "d360-secret-key" }, "admin");
    let b = await db.business.findUniqueOrThrow({ where: { id: f.business.id } });
    expect(b.waCredentialsEnc).not.toContain("d360-secret-key");
    await saveWhatsAppSettings(f.business.id, { provider: "DIALOG360", phoneNumberId: "pn-mine", apiKey: "" }, "admin");
    b = await db.business.findUniqueOrThrow({ where: { id: f.business.id } });
    expect(connectionSummary(b).whatsapp).toEqual({ provider: "DIALOG360", phoneNumberId: "pn-mine", hasOwnToken: false, hasApiKey: true });
  });

  it("validates calendar settings", async () => {
    await expect(saveCalendarSettings(f.business.id, { provider: "GOOGLE" }, "admin")).rejects.toThrow(/calendar ID/);
    await expect(saveCalendarSettings(f.business.id, { provider: "CALCOM", apiKey: "k", eventTypeId: "abc" }, "admin")).rejects.toThrow(/number/);
    await saveCalendarSettings(f.business.id, { provider: "GOOGLE", calendarId: "owner@gmail.com" }, "admin");
    const b = await db.business.findUniqueOrThrow({ where: { id: f.business.id } });
    expect(connectionSummary(b).calendar).toMatchObject({ provider: "GOOGLE", calendarId: "owner@gmail.com" });
  });
});

describe("disabling a business", () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("paused-salon", { voiceNumber: "+18765550123", retellAgentId: "agent-paused" });
  });

  it("pauses the widget, voice functions, reminders and business logins", async () => {
    const owner = await db.user.create({ data: { email: "o@paused.example", name: "O", role: "OWNER", businessId: f.business.id, passwordHash: "x" } });
    await db.session.create({ data: { userId: owner.id, tokenHash: "t1", expiresAt: new Date(Date.now() + 3600_000) } });
    const service = await db.service.findFirstOrThrow({ where: { businessId: f.business.id } });
    await db.booking.create({
      data: {
        businessId: f.business.id,
        reference: "PS-0001",
        serviceId: service.id,
        startAt: new Date(Date.now() + 20 * 3600_000),
        endAt: new Date(Date.now() + 22 * 3600_000),
        channel: "WEB",
        customerName: "C",
        customerPhone: "+18765550142",
        createdAt: new Date(Date.now() - 3 * 86400_000),
      },
    });

    await setBusinessStatus(f.business.id, "DISABLED", "steven");

    const cfg = await configGET(new Request("http://localhost/api/public/paused-salon/config"), { params: Promise.resolve({ slug: "paused-salon" }) });
    expect(cfg.status).toBe(404);

    const raw = JSON.stringify({ name: "check_availability", args: { service: "silk press" }, call: { call_id: "c1", agent_id: "agent-paused", from_number: "+18765550142" } });
    const res = await functionPOST(
      new Request("http://localhost/api/retell/functions/check_availability", {
        method: "POST",
        headers: { "x-retell-signature": signRetellBody(raw, "test-retell-api-key"), "x-conroy-function-secret": "test-function-secret" },
        body: raw,
      }),
      { params: Promise.resolve({ name: "check_availability" }) },
    );
    expect((await res.json()).ok).toBe(false);

    await runReminderScan();
    expect(await db.message.count({ where: { businessId: f.business.id, templateName: "appointment_reminder" } })).toBe(0);
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);

    await setBusinessStatus(f.business.id, "ACTIVE", "steven");
    expect((await configGET(new Request("http://localhost/api/public/paused-salon/config"), { params: Promise.resolve({ slug: "paused-salon" }) })).status).toBe(200);
  });
});
