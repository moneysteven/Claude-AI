import { decryptOptional } from "../crypto";
import { env } from "../env";
import { detectIntent } from "../intents";
import { loadKnowledge, buildKnowledgeText } from "../knowledge";
import { getLlmProvider, type LlmMessage } from "../llm";
import { logger } from "../logger";
import { EMERGENCY_MESSAGE } from "../safety";
import { tenantDb } from "../tenant";
import { recordUsage } from "../usage";
import { enqueue, JOB } from "../jobs/queue";
import { buildSystemPrompt } from "./prompt";
import { rulesReply } from "./rules-engine";
import { executeTool, TOOL_DEFINITIONS, type ToolContext, type ToolEvent } from "./tools";

/**
 * Chat brain for WhatsApp and the website widget. Hard safety rules run
 * first (no model involved), then the LLM with tools, with the keyword
 * rules engine as a fallback if the LLM is unavailable.
 */

export interface ChatInput {
  businessId: string;
  channel: "WHATSAPP" | "WEB";
  conversationId: string;
  text: string;
  trustedPhone?: string | null;
  visitorTimezone?: string | null;
  /** The just-stored inbound message, excluded from history. */
  currentMessageId?: string;
  now?: Date;
}

export interface ChatOutput {
  reply: string;
  handoff: boolean;
  events: ToolEvent[];
  engine: "llm" | "rules" | "safety";
}

const HISTORY_LIMIT = 20;
const FALLBACK_REPLY = "Sorry, I'm having a little trouble right now. I've passed your message to the team and someone will get back to you.";

async function loadHistory(businessId: string, conversationId: string, excludeId?: string) {
  const rows = await tenantDb(businessId).message.findMany({
    where: { conversationId, ...(excludeId ? { id: { not: excludeId } } : {}), status: { notIn: ["FAILED", "SUPPRESSED"] } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows
    .reverse()
    .map((m) => ({ sender: m.sender, text: decryptOptional(m.bodyEnc) ?? "" }))
    .filter((m) => m.text);
}

export async function generateReply(input: ChatInput): Promise<ChatOutput> {
  const now = input.now ?? new Date();
  const ctx: ToolContext = {
    businessId: input.businessId,
    channel: input.channel,
    trustedPhone: input.trustedPhone ?? null,
    conversationId: input.conversationId,
    visitorTimezone: input.visitorTimezone ?? null,
    now,
  };
  const intent = detectIntent(input.text);

  // 1. Safety first: emergencies never wait for a model.
  if (intent.matched.includes("URGENT_MEDICAL")) {
    const out = await executeTool("request_human", { reason: `Possible emergency: "${input.text.slice(0, 200)}"`, urgency: "URGENT" }, ctx);
    return { reply: EMERGENCY_MESSAGE, handoff: true, events: out.events, engine: "safety" };
  }
  // 2. "Talk to a person" always works, even if the model would argue.
  if (intent.intent === "HUMAN") {
    const out = await executeTool("request_human", { reason: `Customer asked for a person: "${input.text.slice(0, 200)}"` }, ctx);
    return {
      reply: "No problem - I've let the team know and a person will reply here as soon as possible during opening hours.",
      handoff: true,
      events: out.events,
      engine: "safety",
    };
  }

  const knowledge = await loadKnowledge(input.businessId);
  const history = await loadHistory(input.businessId, input.conversationId, input.currentMessageId);
  const lastAssistantText = [...history].reverse().find((m) => m.sender !== "CUSTOMER")?.text ?? null;

  let provider = null;
  try {
    provider = getLlmProvider();
  } catch (err) {
    logger.error({ err: (err as Error).message }, "LLM misconfigured; using rules engine");
  }

  if (!provider) {
    const r = await rulesReply({ text: input.text, knowledge, ctx, lastAssistantText, now });
    return { reply: r.reply, handoff: r.events.some((e) => e.type === "handoff"), events: r.events, engine: "rules" };
  }

  const prompt = buildSystemPrompt(knowledge.business, buildKnowledgeText(knowledge, now), input.channel, now);
  const messages: LlmMessage[] = [];
  for (const h of history) {
    const role = h.sender === "CUSTOMER" ? "user" : "assistant";
    if (messages.length === 0 && role === "assistant") continue; // must start with the customer
    messages.push(role === "user" ? { role, content: h.text } : { role, content: h.text });
  }
  messages.push({ role: "user", content: input.text });

  const events: ToolEvent[] = [];
  try {
    for (let round = 0; round < env.LLM_MAX_TOOL_ROUNDS; round++) {
      const res = await provider.complete({ system: prompt, messages, tools: TOOL_DEFINITIONS });
      await recordUsage(input.businessId, "LLM_INPUT_TOKENS", res.usage.inputTokens);
      await recordUsage(input.businessId, "LLM_OUTPUT_TOKENS", res.usage.outputTokens);
      await recordUsage(input.businessId, "LLM_CACHE_READ_TOKENS", res.usage.cacheReadTokens ?? 0);
      await recordUsage(input.businessId, "LLM_CACHE_WRITE_TOKENS", res.usage.cacheWriteTokens ?? 0);

      if (res.stopReason === "refusal") {
        const out = await executeTool("request_human", { reason: "The assistant could not help with this request." }, ctx);
        events.push(...out.events);
        return { reply: "I'm not able to help with that here, but I've let the team know so a person can follow up.", handoff: true, events, engine: "llm" };
      }
      if (res.toolCalls.length === 0) {
        const reply = res.text || FALLBACK_REPLY;
        return { reply, handoff: events.some((e) => e.type === "handoff"), events, engine: "llm" };
      }

      messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls, raw: res.raw });
      const results = [];
      for (const call of res.toolCalls) {
        const out = await executeTool(call.name, call.input, ctx);
        events.push(...out.events);
        results.push({ toolCallId: call.id, name: call.name, content: JSON.stringify(out.result), isError: !out.ok });
      }
      messages.push({ role: "tool", results });
    }
    logger.warn({ businessId: input.businessId }, "LLM tool loop limit reached");
    return { reply: FALLBACK_REPLY, handoff: false, events, engine: "llm" };
  } catch (err) {
    logger.error({ err: (err as Error).message, businessId: input.businessId }, "LLM failed; falling back to rules engine");
    void enqueue(JOB.ADMIN_ALERT, { subject: "Chat LLM failing", message: (err as Error).message, businessId: input.businessId }).catch(() => {});
    const r = await rulesReply({ text: input.text, knowledge, ctx, lastAssistantText, now });
    return { reply: r.reply, handoff: r.events.some((e) => e.type === "handoff"), events: [...events, ...r.events], engine: "rules" };
  }
}
