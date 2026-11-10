import type { Business } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { knowledgeTextFor } from "../knowledge";
import { buildSystemPrompt } from "../assistant/prompt";
import { formatPhone, toE164 } from "../phone";
import { formatDateTimeSpoken, greetingFor } from "../time";

/**
 * Voice-specific helpers shared by the Retell webhooks and the agent template.
 */

const PLACE_NOUN: Record<string, string> = {
  SALON: "salon",
  BARBER: "shop",
  AUTO_SHOP: "shop",
  RESTAURANT: "restaurant",
  CLINIC: "clinic",
  GYM: "gym",
  BOUTIQUE: "boutique",
  TOUR_OPERATOR: "team",
  GUESTHOUSE: "guesthouse",
  OTHER: "team",
};

const DISCLOSURE_RE = /\b(ai|artificial intelligence|virtual assistant)\b/i;
const RECORDING_RE = /\brecord(ed|ing)?\b/i;

/**
 * Opening line. AI disclosure and the recording notice are mandatory and are
 * added even if a business writes its own greeting.
 * e.g. "Good morning, you've reached Tasha's Beauty Salon. I'm Conroy, the salon's
 * AI assistant. This call may be recorded to help us serve you. How can I help?"
 */
export function buildVoiceGreeting(
  business: Pick<Business, "name" | "assistantName" | "category" | "greeting" | "timezone">,
  now: Date = new Date(),
): string {
  const hello = greetingFor(now, business.timezone);
  const noun = PLACE_NOUN[business.category] ?? "team";
  if (business.greeting && business.greeting.trim()) {
    let custom = business.greeting
      .trim()
      .replace(/\{greeting\}/gi, hello)
      .replace(/\{business\}/gi, business.name)
      .replace(/\{assistant\}/gi, business.assistantName);
    if (!DISCLOSURE_RE.test(custom)) custom += ` I'm ${business.assistantName}, an AI assistant.`;
    if (!RECORDING_RE.test(custom)) custom += " This call may be recorded to help us serve you.";
    if (!/\?\s*$/.test(custom)) custom += " How can I help?";
    return custom;
  }
  return `${hello}, you've reached ${business.name}. I'm ${business.assistantName}, the ${noun}'s AI assistant. This call may be recorded to help us serve you. How can I help?`;
}

/** Find the business a call belongs to: by Retell agent, then by the dialled number. */
export async function businessForCall(agentId?: string | null, toNumber?: string | null) {
  if (agentId) {
    const b = await db.business.findUnique({ where: { retellAgentId: agentId } });
    if (b) return b;
  }
  const to = toE164(toNumber ?? null);
  if (to) return db.business.findUnique({ where: { voiceNumber: to } });
  return null;
}

/** Per-call variables injected into the Retell prompt (fresh knowledge on every call). */
export async function voiceDynamicVariables(business: Business, fromNumber: string | null, now: Date = new Date()) {
  const kb = await knowledgeTextFor(business.id, now);
  const prompt = buildSystemPrompt(business, kb, "VOICE", now);
  const caller = toE164(fromNumber);
  return {
    business_id: business.id,
    business_name: business.name,
    assistant_name: business.assistantName,
    greeting_line:
      business.status === "DISABLED"
        ? `Hello, you've reached ${business.name}. I'm an AI assistant. This line isn't taking calls right now; please send a WhatsApp message instead. Goodbye.`
        : buildVoiceGreeting(business, now),
    assistant_instructions: prompt.staticPart,
    call_context: prompt.dynamicPart,
    current_time: formatDateTimeSpoken(now, business.timezone),
    caller_number: caller ? formatPhone(caller) : "unknown (number withheld)",
    handoff_number: business.handoffNumber ?? "",
  };
}

// ------------------------------------------------------------ payload schemas

export const retellCallSchema = z
  .object({
    call_id: z.string(),
    agent_id: z.string().optional(),
    call_status: z.string().optional(),
    direction: z.string().optional(),
    from_number: z.string().optional().nullable(),
    to_number: z.string().optional().nullable(),
    start_timestamp: z.number().optional(),
    end_timestamp: z.number().optional(),
    duration_ms: z.number().optional(),
    transcript: z.string().optional(),
    recording_url: z.string().optional(),
    disconnection_reason: z.string().optional(),
    retell_llm_dynamic_variables: z.record(z.string(), z.string()).optional(),
    call_analysis: z
      .object({
        call_summary: z.string().optional(),
        user_sentiment: z.string().optional(),
        call_successful: z.boolean().optional(),
        in_voicemail: z.boolean().optional(),
        custom_analysis_data: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type RetellCall = z.infer<typeof retellCallSchema>;

export const retellEventSchema = z.object({
  event: z.string(),
  call: retellCallSchema,
});

export const retellInboundSchema = z.object({
  event: z.literal("call_inbound"),
  call_inbound: z
    .object({
      agent_id: z.string().optional().nullable(),
      from_number: z.string().optional().nullable(),
      to_number: z.string().optional().nullable(),
      call_id: z.string().optional(),
    })
    .passthrough(),
});

export const retellFunctionSchema = z.object({
  name: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  call: retellCallSchema.partial().extend({ call_id: z.string() }),
});

export function retellWebhookKey(): string | undefined {
  return env.RETELL_WEBHOOK_KEY ?? env.RETELL_API_KEY;
}
