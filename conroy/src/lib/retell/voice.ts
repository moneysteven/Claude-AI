import type { Business } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { knowledgeTextFor } from "../knowledge";
import { buildSystemPrompt } from "../assistant/prompt";
import { formatPhone, toE164 } from "../phone";
import { formatDateTimeSpoken } from "../time";
import { buildVoiceGreeting } from "../greeting";

export { buildVoiceGreeting };

/**
 * Voice-specific helpers shared by the Retell webhooks and the agent template.
 */


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
    // What Retell charges for the call, in US cents (set once the call has ended).
    call_cost: z.object({ combined_cost: z.number().nonnegative().optional() }).passthrough().optional().nullable(),
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
