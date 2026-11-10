import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as functionPOST } from "@/app/api/retell/functions/[name]/route";
import { POST as inboundPOST } from "@/app/api/retell/inbound/route";
import { POST as webhookPOST } from "@/app/api/retell/webhook/route";
import { decryptOptional } from "@/lib/crypto";
import { db } from "@/lib/db";
import { signRetellBody } from "@/lib/retell/verify";
import { createSalon, ensureTestDb, nextWeekday, resetDb, type Fixture } from "./helpers";

const KEY = "test-retell-api-key";

function signed(url: string, body: unknown, opts: { key?: string; secret?: string | null } = {}) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json", "x-retell-signature": signRetellBody(raw, opts.key ?? KEY) };
  if (opts.secret !== null) headers["x-conroy-function-secret"] = opts.secret ?? "test-function-secret";
  return new Request(url, { method: "POST", headers, body: raw });
}

const fn = (name: string, args: Record<string, unknown>, call: Record<string, unknown>, opts?: { key?: string; secret?: string | null }) =>
  functionPOST(signed(`http://localhost/api/retell/functions/${name}`, { name, args, call }, opts), { params: Promise.resolve({ name }) });

describe("Retell voice integration", () => {
  let f: Fixture;
  const call = { call_id: "call_123", agent_id: "agent-voice-salon", from_number: "+18765550142", to_number: "+18765550123", start_timestamp: Date.now() };

  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("voice-salon", { voiceNumber: "+18765550123", retellAgentId: "agent-voice-salon" });
  });

  it("rejects requests with a bad or missing signature", async () => {
    const bad = await webhookPOST(signed("http://localhost/api/retell/webhook", { event: "call_started", call }, { key: "wrong-key" }));
    expect(bad.status).toBe(401);
    const unsigned = await webhookPOST(new Request("http://localhost/api/retell/webhook", { method: "POST", body: JSON.stringify({ event: "call_started", call }) }));
    expect(unsigned.status).toBe(401);
    const noSecret = await fn("check_availability", { service: "silk press" }, call, { secret: null });
    expect(noSecret.status).toBe(401);
  });

  it("inbound webhook returns the agent and per-call variables with the AI + recording disclosure", async () => {
    const res = await inboundPOST(
      signed("http://localhost/api/retell/inbound", { event: "call_inbound", call_inbound: { from_number: "+18765550142", to_number: "+18765550123" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.call_inbound.override_agent_id).toBe("agent-voice-salon");
    const vars = body.call_inbound.dynamic_variables;
    expect(vars.greeting_line).toMatch(/^Good (morning|afternoon|evening), you've reached Salon voice-salon\. I'm Conroy, the salon's AI assistant\. This call may be recorded/);
    expect(vars.assistant_instructions).toContain("Silk Press: J$6,500");
    expect(vars.caller_number).toBe("(876) 555-0142");
    expect(vars.handoff_number).toBe("+18765550101");
  });

  it("books an appointment through custom functions and links it to the call", async () => {
    const day = nextWeekday(3);
    const avail = await fn("check_availability", { service: "silk press", date: day, preferred_time: "14:00" }, call);
    expect(avail.status).toBe(200);
    const a = await avail.json();
    expect(a.ok).toBe(true);
    expect(a.requested_time.available).toBe(true);
    expect(a.options.length).toBeGreaterThan(0);

    const booked = await (await fn("book_appointment", { service: "Silk Press", start: `${day}T14:00`, customer_name: "Shanice Brown" }, call)).json();
    expect(booked.booked).toBe(true);
    const booking = await db.booking.findFirstOrThrow({ where: { businessId: f.business.id } });
    expect(booking.customerPhone).toBe("+18765550142"); // caller ID, not something the model said
    expect(booking.channel).toBe("VOICE");

    const log = await db.callLog.findUniqueOrThrow({ where: { retellCallId: "call_123" } });
    expect(log.outcome).toBe("BOOKED");
    expect(log.bookingId).toBe(booking.id);
  });

  it("only lets the caller change bookings made with their own number", async () => {
    const day = nextWeekday(4);
    await fn("book_appointment", { service: "Silk Press", start: `${day}T10:00`, customer_name: "Shanice" }, call);
    const ref = (await db.booking.findFirstOrThrow({})).reference;
    const stranger = { ...call, call_id: "call_999", from_number: "+18765550777" };
    const res = await (await fn("cancel_booking", { reference: ref }, stranger)).json();
    expect(res.cancelled).toBe(false);
    const own = await (await fn("cancel_booking", { reference: ref }, call)).json();
    expect(own.cancelled).toBe(true);
  });

  it("records the call, meters minutes once, and sends the owner a WhatsApp summary", async () => {
    const started = { ...call, start_timestamp: Date.now() - 125_000 };
    await webhookPOST(signed("http://localhost/api/retell/webhook", { event: "call_started", call: started }));
    const ended = {
      ...started,
      end_timestamp: Date.now(),
      duration_ms: 125_000,
      transcript: "Agent: Good morning...\nUser: How much fi a silk press?",
      recording_url: "https://recordings.example/call_123.wav",
      disconnection_reason: "user_hangup",
    };
    const r1 = await webhookPOST(signed("http://localhost/api/retell/webhook", { event: "call_ended", call: ended }));
    expect(r1.status).toBe(204);
    // Retell retries: the duplicate is ignored.
    await webhookPOST(signed("http://localhost/api/retell/webhook", { event: "call_ended", call: ended }));
    const usage = await db.usageEvent.findMany({ where: { businessId: f.business.id, kind: "VOICE_SECONDS" } });
    expect(usage).toHaveLength(1);
    expect(usage[0].quantity).toBe(125);

    await webhookPOST(
      signed("http://localhost/api/retell/webhook", {
        event: "call_analyzed",
        call: { ...ended, call_analysis: { call_summary: "Caller asked the price of a silk press.", user_sentiment: "Positive", custom_analysis_data: { call_reason: "Price of silk press", caller_name: "Shanice", outcome: "INFO_GIVEN" } } },
      }),
    );
    const log = await db.callLog.findUniqueOrThrow({ where: { retellCallId: "call_123" } });
    expect(log.durationSec).toBe(125);
    expect(log.outcome).toBe("INFO_GIVEN");
    expect(log.reason).toBe("Price of silk press");
    expect(decryptOptional(log.transcriptEnc)).toContain("silk press");
    expect(log.transcriptEnc).not.toContain("silk press"); // encrypted at rest
    expect(log.ownerNotifiedAt).not.toBeNull();
    const contact = await db.contact.findFirstOrThrow({ where: { phone: "+18765550142" } });
    expect(contact.name).toBe("Shanice");
  });
});
