import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateReply } from "@/lib/assistant/engine";
import { db } from "@/lib/db";
import { setLlmProviderForTests, type LlmProvider, type LlmRequest, type LlmResponse } from "@/lib/llm";
import { whatsappConversation } from "@/lib/whatsapp/outbound";
import { createSalon, ensureTestDb, nextWeekday, resetDb, type Fixture } from "./helpers";

/** A fake model that follows a script and records what it was sent. */
class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";
  calls: LlmRequest[] = [];
  constructor(private readonly steps: ((req: LlmRequest) => LlmResponse)[]) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(structuredClone(req));
    const step = this.steps[this.calls.length - 1];
    if (!step) throw new Error("script exhausted");
    return step(req);
  }
}

const usage = { inputTokens: 1200, outputTokens: 40 };
const lastToolResult = (req: LlmRequest) => {
  const m = req.messages[req.messages.length - 1];
  if (m.role !== "tool") throw new Error("expected tool results");
  return JSON.parse(m.results[0].content);
};

describe("chat engine with an LLM (scripted)", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("llm-salon");
  });
  afterEach(() => setLlmProviderForTests(undefined));

  it("checks availability, books with the trusted WhatsApp number, and replies", async () => {
    const day = nextWeekday(3);
    let offered = "";
    const provider = new ScriptedProvider([
      () => ({ text: "", toolCalls: [{ id: "t1", name: "check_availability", input: { service: "silk press", date: day } }], stopReason: "tool_use", usage }),
      (req) => {
        offered = lastToolResult(req).options[0].start;
        return {
          text: "",
          // The model tries to use a different phone number; WhatsApp sender must win.
          toolCalls: [{ id: "t2", name: "book_appointment", input: { service: "Silk Press", start: offered, customer_name: "Shanice Brown" } }],
          stopReason: "tool_use",
          usage,
        };
      },
      (req) => {
        const r = lastToolResult(req);
        return { text: `You're booked! Ref ${r.reference}.`, toolCalls: [], stopReason: "end", usage };
      },
    ]);
    setLlmProviderForTests(provider);
    const conv = await whatsappConversation(f.business.id, "+18765550142");
    const out = await generateReply({
      businessId: f.business.id,
      channel: "WHATSAPP",
      conversationId: conv.id,
      text: "mi waan book a silk press",
      trustedPhone: "+18765550142",
    });
    expect(out.engine).toBe("llm");
    const booking = await db.booking.findFirstOrThrow({ where: { businessId: f.business.id } });
    expect(out.reply).toBe(`You're booked! Ref ${booking.reference}.`);
    expect(booking.customerPhone).toBe("+18765550142");
    expect(out.events.map((e) => e.type)).toContain("booking_created");

    // Same knowledge as voice: the prompt carries the knowledge base, Patois guide and Jamaica time.
    const sys = provider.calls[0].system;
    expect(sys.staticPart).toContain("Silk Press: J$6,500");
    expect(sys.staticPart).toContain("unnu");
    expect(sys.staticPart).toContain("AI assistant");
    expect(sys.dynamicPart).toContain("Jamaica time");
    expect(provider.calls[0].tools.map((t) => t.name)).toContain("book_appointment");
    // Tokens are metered per business.
    const tokens = await db.usageEvent.aggregate({ where: { businessId: f.business.id, kind: "LLM_INPUT_TOKENS" }, _sum: { quantity: true } });
    expect(tokens._sum.quantity).toBe(3600);
  });

  it("never sends 'talk to a person' to the model", async () => {
    const provider = new ScriptedProvider([]);
    setLlmProviderForTests(provider);
    const conv = await whatsappConversation(f.business.id, "+18765550142");
    const out = await generateReply({ businessId: f.business.id, channel: "WHATSAPP", conversationId: conv.id, text: "talk to a person", trustedPhone: "+18765550142" });
    expect(provider.calls).toHaveLength(0);
    expect(out.handoff).toBe(true);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).status).toBe("HUMAN");
  });

  it("falls back to the rules engine when the model errors", async () => {
    setLlmProviderForTests(new ScriptedProvider([() => { throw new Error("upstream 529"); }]));
    const conv = await whatsappConversation(f.business.id, "+18765550142");
    const out = await generateReply({ businessId: f.business.id, channel: "WHATSAPP", conversationId: conv.id, text: "how much fi a silk press?", trustedPhone: "+18765550142" });
    expect(out.engine).toBe("rules");
    expect(out.reply).toContain("J$6,500");
  });

  it("hands off when the model refuses", async () => {
    setLlmProviderForTests(new ScriptedProvider([() => ({ text: "", toolCalls: [], stopReason: "refusal", usage })]));
    const conv = await whatsappConversation(f.business.id, "+18765550142");
    const out = await generateReply({ businessId: f.business.id, channel: "WHATSAPP", conversationId: conv.id, text: "something odd", trustedPhone: "+18765550142" });
    expect(out.handoff).toBe(true);
  });
});
