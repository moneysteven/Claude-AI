import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as configGET } from "@/app/api/public/[slug]/config/route";
import { executeTool } from "@/lib/assistant/tools";
import { verifyPassword } from "@/lib/auth/password";
import { decryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { knowledgeTextFor } from "@/lib/knowledge";
import { createTenantFromOnboarding, OnboardingError, slugify } from "@/lib/onboarding/create";
import { PRESET_HOURS, PRESET_POLICIES } from "@/lib/onboarding/presets";
import type { OnboardingInput } from "@/lib/onboarding/schema";
import { importRetellNumber, syncRetellAgent, type RetellClientLike } from "@/lib/retell/provision";
import { ensureTestDb, nextWeekday, resetDb } from "./helpers";

const ADMIN = { id: "admin-user", role: "SUPER_ADMIN" as const };

function payload(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    business: {
      name: "Marcus' Barber Shop",
      category: "BARBER",
      addressLine: "14 Main Street",
      area: "Mandeville",
      parish: "Manchester",
      directions: "Next to the square, opposite the bank.",
      email: "",
      websiteUrl: "https://marcus-barber.example",
      websitePlatform: "Hostinger Website Builder",
    },
    phones: { phoneMain: "876 555 0300", whatsappNumber: "5550300", ownerWhatsapp: "(876) 555-0301", handoffNumber: "876-555-0302", voiceNumber: "" },
    hours: PRESET_HOURS.BARBER.map((h) => ({ ...h })),
    holidaysOpen: ["ash_wednesday"],
    staff: [
      { name: "Marcus", title: "Owner & barber", workDays: [0, 1, 2, 3, 4, 5, 6] },
      { name: "Dwayne", title: "Barber", workDays: [4, 5, 6] },
    ],
    services: [
      { name: "Haircut", durationMin: 30, price: "1,500", priceIsFrom: false, deposit: "", staffNames: [], description: "" },
      { name: "Haircut & Beard", durationMin: 45, price: "2000", priceIsFrom: false, deposit: "", staffNames: ["Marcus"], description: "" },
      { name: "Locs Retwist", durationMin: 120, price: "", priceIsFrom: false, deposit: "", staffNames: ["Dwayne"], description: "" },
    ],
    faqs: [{ question: "Do you take walk-ins?", answer: "Yes, but appointments go first." }],
    policies: PRESET_POLICIES.map((p) => ({ ...p })),
    assistant: { assistantName: "Conroy", tone: "LIGHT_PATOIS", greeting: "", extraKnowledge: "" },
    payments: [{ provider: "WIPAY", kind: "DEPOSIT", label: "Deposit", urlTemplate: "https://jm.wipayfinancial.com/to_me/marcus?total={amount}&order_id={reference}", defaultAmount: "1000" }],
    calendar: { provider: "INTERNAL", googleCalendarId: "", calcomApiKey: "", calcomEventTypeId: "" },
    plan: "LITE",
    owner: { name: "Marcus Brown", email: "Marcus@Example.com" },
    options: { goLive: true, createVoiceAgent: false },
    ...overrides,
  };
}

async function expectFieldErrors(input: OnboardingInput, keys: string[]) {
  try {
    await createTenantFromOnboarding(input, ADMIN);
    throw new Error("expected OnboardingError");
  } catch (err) {
    expect(err).toBeInstanceOf(OnboardingError);
    for (const k of keys) expect(Object.keys((err as OnboardingError).fieldErrors)).toContain(k);
  }
}

describe("onboarding a new business", () => {
  beforeAll(ensureTestDb);
  beforeEach(resetDb);

  it("slugifies business names for the widget and URLs", () => {
    expect(slugify("Marcus' Barber Shop")).toBe("marcus-barber-shop");
    expect(slugify("Tasha’s Beauty & Nails")).toBe("tashas-beauty-and-nails");
    expect(slugify("Café Négril!!")).toBe("cafe-negril");
  });

  it("creates a complete, working tenant from the form", async () => {
    const { business, owner } = await createTenantFromOnboarding(payload(), ADMIN);
    expect(business.slug).toBe("marcus-barber-shop");
    expect(business.status).toBe("ACTIVE");
    expect(business.plan).toBe("LITE");
    expect(business.ownerWhatsapp).toBe("+18765550301");
    expect(business.whatsappNumber).toBe("+18765550300"); // 7 digits -> 876 added
    expect(business.tone).toBe("LIGHT_PATOIS");

    expect(await db.businessHours.count({ where: { businessId: business.id } })).toBe(7);
    const ash = await db.businessHolidaySetting.findFirstOrThrow({ where: { businessId: business.id, holidayKey: "ash_wednesday" } });
    expect(ash.isOpen).toBe(true);
    expect(await db.businessHolidaySetting.count({ where: { businessId: business.id, isOpen: false } })).toBe(9);

    // Marcus works every open day -> follows business hours (no rows); Dwayne Thu-Sat only.
    const marcus = await db.staff.findFirstOrThrow({ where: { businessId: business.id, name: "Marcus" }, include: { schedules: true } });
    const dwayne = await db.staff.findFirstOrThrow({ where: { businessId: business.id, name: "Dwayne" }, include: { schedules: true } });
    expect(marcus.schedules).toHaveLength(0);
    expect(dwayne.schedules.filter((s) => !s.isOff).map((s) => s.weekday).sort()).toEqual([4, 5, 6]);

    const beard = await db.service.findFirstOrThrow({ where: { businessId: business.id, name: "Haircut & Beard" }, include: { staff: true } });
    expect(beard.priceCents).toBe(200000);
    expect(beard.staff.map((l) => l.staffId)).toEqual([marcus.id]);
    const locs = await db.service.findFirstOrThrow({ where: { businessId: business.id, name: "Locs Retwist" } });
    expect(locs.priceCents).toBeNull(); // no price -> "price on consultation", never guessed

    const user = await db.user.findUniqueOrThrow({ where: { email: "marcus@example.com" } });
    expect(user.role).toBe("OWNER");
    expect(user.businessId).toBe(business.id);
    expect(user.mustChangePassword).toBe(true);
    expect(owner.tempPassword).toMatch(/^Conroy-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(await verifyPassword(owner.tempPassword, user.passwordHash)).toBe(true);

    // The knowledge base, assistant tools and widget work immediately.
    const kb = await knowledgeTextFor(business.id);
    expect(kb).toContain("Haircut: J$1,500");
    expect(kb).toContain("Locs Retwist: price on consultation");
    expect(kb).toContain("Do you take walk-ins?");
    const avail = await executeTool("check_availability", { service: "haircut", date: nextWeekday(4) }, { businessId: business.id, channel: "WEB" });
    expect(avail.ok).toBe(true);
    const cfg = await configGET(new Request("http://localhost/api/public/marcus-barber-shop/config"), { params: Promise.resolve({ slug: "marcus-barber-shop" }) });
    expect(cfg.status).toBe(200);
    expect((await cfg.json()).welcome).toMatch(/^Wah gwaan!/);
  });

  it("gives a second business with the same name its own web address", async () => {
    await createTenantFromOnboarding(payload(), ADMIN);
    const second = await createTenantFromOnboarding(payload({ owner: { name: "Other", email: "other@example.com" } }), ADMIN);
    expect(second.business.slug).toBe("marcus-barber-shop-2");
  });

  it("can create the business in onboarding status (not live)", async () => {
    const { business } = await createTenantFromOnboarding(payload({ options: { goLive: false, createVoiceAgent: false } }), ADMIN);
    expect(business.status).toBe("ONBOARDING");
    expect(business.goLiveAt).toBeNull();
  });

  it("stores calendar credentials encrypted", async () => {
    const { business } = await createTenantFromOnboarding(
      payload({ calendar: { provider: "CALCOM", googleCalendarId: "", calcomApiKey: "cal_live_secret", calcomEventTypeId: "12345" } }),
      ADMIN,
    );
    expect(business.calendarConfigEnc).not.toContain("cal_live_secret");
    expect(decryptJson<{ apiKey: string; eventTypeId: string }>(business.calendarConfigEnc)).toEqual({ apiKey: "cal_live_secret", eventTypeId: "12345" });
  });

  it("reports every problem with a field path so the wizard can point at it", async () => {
    const bad = payload();
    bad.phones.ownerWhatsapp = "call me";
    bad.phones.handoffNumber = "123";
    bad.hours[1] = { ...bad.hours[1], isClosed: false, openTime: "17:00", closeTime: "09:00" };
    bad.services[1].staffNames = ["Ghost"];
    bad.services[0].price = "fifteen hundred";
    bad.payments[0].urlTemplate = "http://insecure.example/pay?amt={amount}";
    await expectFieldErrors(bad, ["phones.ownerWhatsapp", "phones.handoffNumber", "hours.1", "services.1.staffNames", "services.0.price", "payments.0.urlTemplate"]);
    expect(await db.business.count()).toBe(0); // nothing half-created
  });

  it("rejects an owner email that already has an account, and schema errors", async () => {
    await createTenantFromOnboarding(payload(), ADMIN);
    await expectFieldErrors(payload({ owner: { name: "Again", email: "marcus@example.com" } }), ["owner.email"]);
    await expectFieldErrors(payload({ services: [] }), ["services"]);
  });

  it("only the super admin can onboard", async () => {
    await expect(createTenantFromOnboarding(payload(), { id: "x", role: "OWNER" })).rejects.toThrow(/Only Steven/);
  });

  it("creates the Retell agent from the template and connects the 876 number", async () => {
    const { business } = await createTenantFromOnboarding(payload({ phones: { ...payload().phones, handoffNumber: "876-555-0302" } }), ADMIN);
    const calls: { op: string; params: Record<string, unknown> }[] = [];
    const fake: RetellClientLike = {
      llm: {
        create: async (p: never) => (calls.push({ op: "llm.create", params: p }), { llm_id: "llm_1" }),
        update: async (_id: string, p: never) => (calls.push({ op: "llm.update", params: p }), { llm_id: "llm_1" }),
      },
      agent: {
        create: async (p: never) => (calls.push({ op: "agent.create", params: p }), { agent_id: "agent_1" }),
        update: async (_id: string, p: never) => (calls.push({ op: "agent.update", params: p }), { agent_id: "agent_1" }),
      },
      phoneNumber: {
        import: async (p: never) => (calls.push({ op: "number.import", params: p }), { phone_number: "+18765550399" }),
        update: async (n: string) => ({ phone_number: n }),
      },
    };
    await syncRetellAgent(business.id, fake);
    expect(calls.map((c) => c.op)).toEqual(["llm.create", "agent.create"]);
    const llm = calls[0].params as { begin_message: string; general_tools: { name: string; url?: string }[] };
    expect(llm.begin_message).toBe("{{greeting_line}}");
    expect(llm.general_tools.map((t) => t.name)).toEqual(expect.arrayContaining(["check_availability", "book_appointment", "transfer_to_staff", "end_call"]));
    expect(llm.general_tools.find((t) => t.name === "book_appointment")?.url).toBe("http://localhost:3000/api/retell/functions/book_appointment");
    expect((calls[1].params as { webhook_url: string }).webhook_url).toBe("http://localhost:3000/api/retell/webhook");

    await syncRetellAgent(business.id, fake); // second time: update, not duplicate
    expect(calls.slice(2).map((c) => c.op)).toEqual(["llm.update", "agent.update"]);

    await importRetellNumber(business.id, "876-555-0399", fake);
    const imported = calls.find((c) => c.op === "number.import")!.params as { phone_number: string; inbound_webhook_url: string; termination_uri: string };
    expect(imported.phone_number).toBe("+18765550399");
    expect(imported.inbound_webhook_url).toBe("http://localhost:3000/api/retell/inbound");
    expect(imported.termination_uri).toBe("conroy-test.pstn.twilio.com");
    const saved = await db.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(saved).toMatchObject({ retellAgentId: "agent_1", retellLlmId: "llm_1", voiceNumber: "+18765550399" });
  });
});
