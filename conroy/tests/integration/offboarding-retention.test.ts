import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as webhookPOST } from "@/app/api/retell/webhook/route";
import { generateReply } from "@/lib/assistant/engine";
import { usageForPeriod, periodOf } from "@/lib/billing";
import { decryptOptional, encryptOptional } from "@/lib/crypto";
import { db } from "@/lib/db";
import { runJob } from "@/lib/jobs/handlers";
import { JOB } from "@/lib/jobs/queue";
import { setLlmProviderForTests, type LlmProvider, type LlmResponse } from "@/lib/llm";
import { openAiUsage } from "@/lib/llm/openai";
import { deleteBusiness, exportBusinessData, manualOffboardingSteps, OffboardingError, recentDeletions } from "@/lib/offboarding";
import { customerCutoff, erasePersonData, expireCustomerRecords, purgeExpiredData, stalePhones } from "@/lib/privacy/retention";
import { runRetellCleanup, type RetellCleanup, type RetellCleanupClient } from "@/lib/retell/cleanup";
import { signRetellBody } from "@/lib/retell/verify";
import { whatsappConversation } from "@/lib/whatsapp/outbound";
import { createSalon, ensureTestDb, resetDb, type Fixture } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-10T15:00:00Z");
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 31 * DAY);

/** One customer with a bit of everything, at a given time. */
async function customerWithHistory(f: Fixture, phone: string, at: Date, name = "Shanice Brown") {
  const businessId = f.business.id;
  const contact = await db.contact.create({ data: { businessId, phone, name, email: `${phone.slice(-4)}@example.com`, createdAt: at } });
  const booking = await db.booking.create({
    data: {
      businessId,
      reference: `TB-${phone.slice(-4)}`,
      contactId: contact.id,
      serviceId: f.serviceId,
      staffId: f.staff.tasha,
      startAt: at,
      endAt: new Date(at.getTime() + 90 * 60 * 1000),
      channel: "WHATSAPP",
      customerName: name,
      customerPhone: phone,
      notes: "Allergic to some products",
      createdAt: at,
    },
  });
  const lead = await db.lead.create({ data: { businessId, contactId: contact.id, name, phone, request: "Wedding hair quote", channel: "VOICE", createdAt: at } });
  const conv = await db.conversation.create({
    data: { businessId, contactId: contact.id, channel: "WHATSAPP", externalId: phone, lastMessageAt: at, createdAt: at },
  });
  await db.message.create({
    data: { businessId, conversationId: conv.id, direction: "INBOUND", sender: "CUSTOMER", bodyEnc: encryptOptional("Wah gwaan, mi waan book"), status: "RECEIVED", createdAt: at },
  });
  const web = await db.conversation.create({
    data: { businessId, contactId: contact.id, channel: "WEB", externalId: `web-${phone.slice(-4)}`, lastMessageAt: at, createdAt: at },
  });
  const call = await db.callLog.create({
    data: {
      businessId,
      retellCallId: `call-${phone.slice(-4)}`,
      contactId: contact.id,
      fromNumber: phone,
      startedAt: at,
      createdAt: at,
      status: "ended",
      durationSec: 95,
      reason: "Asked about braids",
      transcriptEnc: encryptOptional("Caller: mi waan braids"),
      summaryEnc: encryptOptional("Wants braids on Saturday"),
      costUsdCents: 17.25,
    },
  });
  const template = await db.paymentLinkTemplate.findFirstOrThrow({ where: { businessId } });
  const pending = await db.paymentRequest.create({
    data: {
      businessId,
      contactId: contact.id,
      bookingId: booking.id,
      templateId: template.id,
      customerName: name,
      customerPhone: phone,
      amountCents: 500000,
      reference: `P-${phone.slice(-4)}`,
      url: `https://fygaro.com/en/pb/test/?amount=5000&client_note=${encodeURIComponent(name)}`,
      createdAt: at,
    },
  });
  const paid = await db.paymentRequest.create({
    data: {
      businessId,
      contactId: contact.id,
      templateId: template.id,
      customerName: name,
      customerPhone: phone,
      amountCents: 650000,
      reference: `Q-${phone.slice(-4)}`,
      url: "https://fygaro.com/en/pb/test/?amount=6500",
      status: "PAID",
      paidAt: at,
      createdAt: at,
    },
  });
  return { contact, booking, lead, conv, web, call, pending, paid };
}

function fakeRetell(behaviour: { failCalls?: Set<string>; missing?: Set<string> } = {}) {
  const deleted: string[] = [];
  const op = (kind: string) => ({
    delete: async (id: string) => {
      if (behaviour.missing?.has(id)) throw Object.assign(new Error("not found"), { status: 404 });
      if (behaviour.failCalls?.has(id)) throw Object.assign(new Error("server error"), { status: 500 });
      deleted.push(`${kind}:${id}`);
    },
  });
  const client: RetellCleanupClient = { call: op("call"), agent: op("agent"), llm: op("llm"), phoneNumber: op("number") };
  return { client, deleted };
}

describe("whole-business export and delete", () => {
  let f: Fixture;
  let other: Fixture;
  let admin: { id: string };
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("leaving-salon", { voiceNumber: "+18765550123" });
    await db.business.update({ where: { id: f.business.id }, data: { retellLlmId: "llm-leaving", calendarProvider: "GOOGLE", whatsappProvider: "META" } });
    other = await createSalon("staying-salon");
    admin = await db.user.create({ data: { email: "steven@example.com", name: "Steven", passwordHash: "x", role: "SUPER_ADMIN" } });
    await db.user.create({ data: { email: "owner@leaving.example", name: "Owner", passwordHash: "secret-hash", role: "OWNER", businessId: f.business.id } });
    await customerWithHistory(f, "+18765550142", monthsAgo(1));
    await customerWithHistory(other, "+18765550199", monthsAgo(1), "Other Customer");
  });

  it("exports every record for one business, decrypted, without secrets or other businesses' data", async () => {
    await db.business.update({ where: { id: f.business.id }, data: { waCredentialsEnc: encryptOptional('{"token":"EAAG-secret"}') } });
    const data = await exportBusinessData(f.business.id);
    expect(data.format).toBe("conroy-business-export");
    expect(data.business.slug).toBe("leaving-salon");
    expect(data.services.map((s) => s.name).sort()).toEqual(["Box Braids", "Silk Press"]);
    expect(data.staff).toHaveLength(2);
    expect(data.contacts).toHaveLength(1);
    expect(data.bookings[0]).toMatchObject({ customerName: "Shanice Brown", notes: "Allergic to some products" });
    expect(data.conversations.flatMap((c) => c.messages).map((m) => m.text)).toContain("Wah gwaan, mi waan book");
    expect(data.calls[0]).toMatchObject({ transcript: "Caller: mi waan braids", summary: "Wants braids on Saturday", providerCostUsdCents: 17.25 });
    expect(data.users).toEqual([expect.objectContaining({ email: "owner@leaving.example", role: "OWNER" })]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("secret-hash");
    expect(text).not.toContain("EAAG-secret");
    expect(text).not.toContain("waCredentialsEnc");
    expect(text).not.toContain("Other Customer");
    expect(text).not.toContain("+18765550199");
  });

  it("refuses to delete a business that isn't disabled, or without the exact slug", async () => {
    await expect(deleteBusiness(f.business.id, "leaving-salon", admin.id)).rejects.toThrow(/Disable the business first/);
    await db.business.update({ where: { id: f.business.id }, data: { status: "DISABLED" } });
    await expect(deleteBusiness(f.business.id, "leaving", admin.id)).rejects.toBeInstanceOf(OffboardingError);
    expect(await db.business.count({ where: { id: f.business.id } })).toBe(1);
  });

  it("deletes every row of the business, keeps the other business, and queues Retell clean-up", async () => {
    await db.business.update({ where: { id: f.business.id }, data: { status: "DISABLED" } });
    const queued: RetellCleanup[] = [];
    const result = await deleteBusiness(f.business.id, " Leaving-Salon ", admin.id, { scheduleRetellCleanup: async (job) => void queued.push(job), now: NOW });

    expect(result.deleted).toMatchObject({ contacts: 1, bookings: 1, calls: 1, leads: 1, paymentRequests: 2, users: 1, conversations: 2 });
    expect(await db.business.count({ where: { id: f.business.id } })).toBe(0);
    const id = f.business.id;
    const leftovers = await Promise.all([
      db.contact.count({ where: { businessId: id } }),
      db.booking.count({ where: { businessId: id } }),
      db.message.count({ where: { businessId: id } }),
      db.callLog.count({ where: { businessId: id } }),
      db.service.count({ where: { businessId: id } }),
      db.user.count({ where: { businessId: id } }),
      db.usageEvent.count({ where: { businessId: id } }),
      db.auditLog.count({ where: { businessId: id } }),
    ]);
    expect(leftovers).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // The other business is untouched; the super admin still exists.
    expect(await db.booking.count({ where: { businessId: other.business.id } })).toBe(1);
    expect(await db.user.count({ where: { id: admin.id } })).toBe(1);

    expect(queued).toEqual([
      { reason: "business_deleted", businessSlug: "leaving-salon", callIds: ["call-0142"], agentId: "agent-leaving-salon", llmId: "llm-leaving", phoneNumber: "+18765550123" },
    ]);
    // One audit record without personal data remains, with the follow-ups.
    const record = await db.auditLog.findFirstOrThrow({ where: { action: "business.delete" } });
    expect(record.businessId).toBeNull();
    expect(JSON.stringify(record.details)).not.toContain("Shanice");
    const recent = await recentDeletions(NOW);
    expect(recent[0].name).toBe("Salon leaving-salon");
    expect(recent[0].manualSteps.join(" ")).toMatch(/##002#.*Meta WhatsApp.*Google Calendar.*widget.*backups/s);
  });

  it("drops queued jobs for a business that no longer exists instead of retrying them", async () => {
    await expect(runJob(JOB.OWNER_CALL_SUMMARY, { businessId: "gone", callLogId: "x" })).resolves.toBeUndefined();
  });

  it("lists only the manual steps that apply", () => {
    const steps = manualOffboardingSteps({ voiceNumber: null, phoneMain: null, whatsappProvider: "CONSOLE", calendarProvider: "INTERNAL", websiteUrl: null });
    expect(steps.join(" ")).not.toMatch(/##002#|Meta|Google|Cal\.com/);
    expect(steps.join(" ")).toMatch(/widget/);
  });
});

describe("Retell clean-up job", () => {
  const job: RetellCleanup = { reason: "business_deleted", businessSlug: "x", callIds: ["c1", "c2", "c3", "c1"], agentId: "a1", llmId: "l1", phoneNumber: "+18765550123" };

  it("deletes the number, agent, LLM and each call once; 404 counts as already gone", async () => {
    const { client, deleted } = fakeRetell({ missing: new Set(["c2"]) });
    const res = await runRetellCleanup(job, client, 2);
    expect(res).toEqual({ callsDeleted: 2, callsMissing: 1, failed: [] });
    expect(deleted.slice(0, 3)).toEqual(["number:+18765550123", "agent:a1", "llm:l1"]);
    expect(deleted.filter((d) => d.startsWith("call:")).sort()).toEqual(["call:c1", "call:c3"]);
  });

  it("throws so the job is retried when Retell fails for real", async () => {
    const { client } = fakeRetell({ failCalls: new Set(["c3"]) });
    await expect(runRetellCleanup(job, client)).rejects.toThrow(/1 call\(s\).*will retry/);
  });

  it("does nothing without work or without an API key", async () => {
    const { client, deleted } = fakeRetell();
    expect(await runRetellCleanup({ reason: "person_erased", businessSlug: "x", callIds: [] }, client)).toEqual({ callsDeleted: 0, callsMissing: 0, failed: [] });
    expect(await runRetellCleanup(job, null)).toEqual({ callsDeleted: 0, callsMissing: 0, failed: [] });
    expect(deleted).toEqual([]);
  });
});

describe("customer record expiry and erasure", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("retention-salon");
  });

  it("removes people with no contact for the retention period and leaves recent customers alone", async () => {
    const old = await customerWithHistory(f, "+18765550111", monthsAgo(30), "Old Customer");
    const recent = await customerWithHistory(f, "+18765550122", monthsAgo(3), "Recent Customer");
    // Old first contact, but a booking still coming up: counts as current.
    const regular = await customerWithHistory(f, "+18765550133", monthsAgo(40), "Regular Customer");
    await db.booking.create({
      data: {
        businessId: f.business.id,
        reference: "TB-NEXT",
        serviceId: f.serviceId,
        startAt: new Date(NOW.getTime() + 7 * DAY),
        endAt: new Date(NOW.getTime() + 7 * DAY + 90 * 60 * 1000),
        channel: "VOICE",
        customerName: "Regular Customer",
        customerPhone: "+18765550133",
      },
    });

    const cutoff = customerCutoff(24, NOW);
    expect(await stalePhones(f.business.id, cutoff)).toEqual(["+18765550111"]);
    const res = await expireCustomerRecords(f.business.id, 24, NOW);
    expect(res.people).toBe(1);

    expect(await db.contact.count({ where: { id: old.contact.id } })).toBe(0);
    expect(await db.lead.count({ where: { id: old.lead.id } })).toBe(0);
    expect(await db.conversation.count({ where: { id: { in: [old.conv.id, old.web.id] } } })).toBe(0);
    const booking = await db.booking.findUniqueOrThrow({ where: { id: old.booking.id } });
    expect(booking).toMatchObject({ customerName: "Past customer", customerPhone: null, notes: null, contactId: null, serviceId: f.serviceId });
    const call = await db.callLog.findUniqueOrThrow({ where: { id: old.call.id } });
    expect(call).toMatchObject({ fromNumber: null, reason: null, transcriptEnc: null, durationSec: 95 });
    const pending = await db.paymentRequest.findUniqueOrThrow({ where: { id: old.pending.id } });
    expect(pending).toMatchObject({ status: "CANCELLED", customerName: null, customerPhone: "deleted", url: "" });
    const paid = await db.paymentRequest.findUniqueOrThrow({ where: { id: old.paid.id } });
    expect(paid).toMatchObject({ status: "PAID", amountCents: 650000, customerName: null });

    for (const kept of [recent, regular]) {
      expect(await db.contact.count({ where: { id: kept.contact.id } })).toBe(1);
      expect((await db.booking.findUniqueOrThrow({ where: { id: kept.booking.id } })).customerPhone).not.toBeNull();
    }
    // Nothing left to do on the next run.
    expect(await stalePhones(f.business.id, cutoff)).toEqual([]);
    expect(await db.auditLog.count({ where: { businessId: f.business.id, action: "privacy.expire" } })).toBe(1);
  });

  it("keeps an opted-out number (without name or email) so STOP still works", async () => {
    const old = await customerWithHistory(f, "+18765550144", monthsAgo(30), "Opted Out");
    await db.contact.update({ where: { id: old.contact.id }, data: { whatsappOptOut: true, whatsappOptOutAt: monthsAgo(30) } });
    await expireCustomerRecords(f.business.id, 24, NOW);
    const contact = await db.contact.findUniqueOrThrow({ where: { id: old.contact.id } });
    expect(contact).toMatchObject({ phone: "+18765550144", whatsappOptOut: true, name: null, email: null });
    expect(await stalePhones(f.business.id, customerCutoff(24, NOW))).toEqual([]);
  });

  it("expires anonymous web chats, phone-less leads and old call reasons", async () => {
    const businessId = f.business.id;
    await db.conversation.create({ data: { businessId, channel: "WEB", externalId: "anon-1", lastMessageAt: monthsAgo(30) } });
    await db.conversation.create({ data: { businessId, channel: "WEB", externalId: "anon-2", lastMessageAt: monthsAgo(2) } });
    await db.lead.create({ data: { businessId, name: "No Phone", request: "Call me", channel: "WEB", createdAt: monthsAgo(30) } });
    await db.callLog.create({ data: { businessId, retellCallId: "hidden-1", reason: "Asked for Tasha", createdAt: monthsAgo(30) } });
    const res = await expireCustomerRecords(businessId, 24, NOW);
    expect(res).toMatchObject({ anonymousChats: 1, anonymousLeads: 1, callReasons: 1 });
    expect(await db.conversation.count({ where: { businessId } })).toBe(1);
  });

  it("runs from the nightly purge with each business's own setting", async () => {
    await customerWithHistory(f, "+18765550155", monthsAgo(8), "Eight Months");
    await db.business.update({ where: { id: f.business.id }, data: { customerRetentionMonths: 6 } });
    const res = await purgeExpiredData(NOW);
    expect(res.people).toBe(1);
  });

  it("erasure on request covers web chats via the contact, keeps paid records, and queues Retell deletion", async () => {
    const p = await customerWithHistory(f, "+18765550166", monthsAgo(1), "Asks To Be Forgotten");
    const queued: RetellCleanup[] = [];
    const res = await erasePersonData(f.business.id, "+18765550166", null, { scheduleRetellCleanup: async (j) => void queued.push(j) });
    expect(res).toMatchObject({ contacts: 1, conversations: 2, leads: 1, calls: 1, bookings: 1, payments: 2, retellCalls: 1 });
    expect(queued).toEqual([{ reason: "person_erased", businessSlug: "retention-salon", callIds: ["call-0166"] }]);
    expect((await db.booking.findUniqueOrThrow({ where: { id: p.booking.id } })).customerName).toBe("Deleted on request");
    expect((await db.paymentRequest.findUniqueOrThrow({ where: { id: p.paid.id } })).status).toBe("PAID");
    expect(await db.contact.count({ where: { businessId: f.business.id } })).toBe(0);
  });
});

describe("cost metering", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("cost-salon", { voiceNumber: "+18765550123", retellAgentId: "agent-cost-salon" });
  });
  afterEach(() => setLlmProviderForTests(undefined));

  const post = (body: unknown) => {
    const raw = JSON.stringify(body);
    return webhookPOST(
      new Request("http://localhost/api/retell/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-retell-signature": signRetellBody(raw, "test-retell-api-key") },
        body: raw,
      }),
    );
  };

  it("stores Retell's cost per call and totals it for the month", async () => {
    const start = Date.now() - 5 * 60 * 1000;
    const call = { call_id: "call_cost_1", agent_id: "agent-cost-salon", from_number: "+18765550142", to_number: "+18765550123", start_timestamp: start };
    expect((await post({ event: "call_started", call })).status).toBe(204);
    const ended = { ...call, end_timestamp: start + 125_000, duration_ms: 125_000, transcript: "Agent: Hello", call_cost: { combined_cost: 21.5, product_costs: [] } };
    expect((await post({ event: "call_ended", call: ended })).status).toBe(204);
    let log = await db.callLog.findUniqueOrThrow({ where: { retellCallId: "call_cost_1" } });
    expect(Number(log.costUsdCents)).toBe(21.5);
    // call_analyzed has the final figure.
    await post({ event: "call_analyzed", call: { ...ended, call_cost: { combined_cost: 23.125 }, call_analysis: { call_summary: "Asked about prices" } } });
    log = await db.callLog.findUniqueOrThrow({ where: { retellCallId: "call_cost_1" } });
    expect(Number(log.costUsdCents)).toBe(23.125);
    expect(decryptOptional(log.summaryEnc)).toBe("Asked about prices");

    // A second call whose cost hasn't arrived yet.
    const second = { ...call, call_id: "call_cost_2", end_timestamp: start + 30_000, duration_ms: 30_000 };
    await post({ event: "call_ended", call: second });
    const u = await usageForPeriod(f.business.id, periodOf());
    expect(u.voiceCostUsdCents).toBe(23.13);
    expect(u.callsWithoutCost).toBe(1);
    expect(u.calls).toBe(2);
  });

  it("records cached prompt tokens separately from full-price input tokens", async () => {
    const reply: LlmResponse = {
      text: "Silk press is J$6,500.",
      toolCalls: [],
      stopReason: "end",
      usage: { inputTokens: 150, outputTokens: 20, cacheReadTokens: 3000, cacheWriteTokens: 0 },
    };
    const provider: LlmProvider = { name: "scripted", complete: async () => reply };
    setLlmProviderForTests(provider);
    const conv = await whatsappConversation(f.business.id, "+18765550142");
    const out = await generateReply({ businessId: f.business.id, channel: "WHATSAPP", conversationId: conv.id, text: "how much fi silk press", trustedPhone: "+18765550142" });
    expect(out.engine).toBe("llm");
    const u = await usageForPeriod(f.business.id, periodOf());
    expect(u).toMatchObject({ llmInputTokens: 150, llmOutputTokens: 20, llmCacheReadTokens: 3000, llmCacheWriteTokens: 0 });
  });

  it("splits OpenAI's cached tokens out of prompt_tokens", () => {
    expect(openAiUsage({ prompt_tokens: 2000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1536 } })).toEqual({
      inputTokens: 464,
      outputTokens: 50,
      cacheReadTokens: 1536,
      cacheWriteTokens: 0,
    });
    expect(openAiUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});
