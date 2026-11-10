import type { Business } from "@prisma/client";
import { TOOL_DEFINITIONS } from "../assistant/tools";
import { env } from "../env";

/**
 * Retell agent template. Every business gets its own Retell LLM + agent built
 * from this template (scripts/retell-sync.ts now; the onboarding flow in
 * Phase 2). The prompt itself is injected per call by /api/retell/inbound as
 * dynamic variables, so editing FAQs or prices in the dashboard takes effect
 * on the very next call without re-syncing Retell.
 */

export const VOICE_GENERAL_PROMPT = `{{assistant_instructions}}

{{call_context}}

CALLER: {{caller_number}}

PHONE-SPECIFIC RULES
- You already greeted the caller with the AI and recording notice. Never skip or contradict it.
- If the caller asks for a person, is upset, or needs something you can't do: say you'll connect them, call request_human, then transfer_to_staff. If the transfer fails or nobody answers, apologise and take a message with capture_lead.
- On a call, the caller's number is known from caller ID; confirm it ("Is this number the best one for WhatsApp?") instead of asking them to read it out. If they want a different number, pass it as customer_phone.
- When a tool is running, say a short filler like "One moment while I check that."
- Keep it brief and warm. End with end_call once they're done.`;

export interface RetellLlmParams {
  general_prompt: string;
  begin_message: string;
  start_speaker: "agent";
  default_dynamic_variables: Record<string, string>;
  model_config: { type: "cascading"; primary: { model: string }; temperature: number };
  general_tools: unknown[];
}

export function functionUrl(name: string): string {
  return `${env.APP_URL}/api/retell/functions/${name}`;
}

export function buildRetellLlm(business: Pick<Business, "name" | "assistantName" | "handoffNumber">, snapshot: { instructions: string; greeting: string }): RetellLlmParams {
  const headers = env.RETELL_FUNCTION_SECRET ? { "X-Conroy-Function-Secret": env.RETELL_FUNCTION_SECRET } : undefined;
  const custom = TOOL_DEFINITIONS.map((t) => ({
    type: "custom",
    name: t.name,
    description: t.description,
    url: functionUrl(t.name),
    method: "POST",
    parameters: t.parameters,
    speak_during_execution: ["check_availability", "book_appointment", "reschedule_booking", "cancel_booking", "find_bookings"].includes(t.name),
    speak_after_execution: true,
    execution_message_description: "Say a short, natural filler such as 'One moment while I check that for you.'",
    timeout_ms: 15000,
    ...(headers ? { headers } : {}),
  }));
  const tools: unknown[] = [
    ...custom,
    {
      type: "end_call",
      name: "end_call",
      description: "End the call politely once the caller has what they need or says goodbye.",
    },
  ];
  if (business.handoffNumber) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_staff",
      description: "Transfer the caller to a staff member. Use after request_human.",
      transfer_destination: { type: "predefined", number: "{{handoff_number}}" },
      transfer_option: { type: "cold_transfer", transfer_ring_duration_ms: 25000 },
      // Telnyx credential connections need the SIP username on outbound legs (Retell's Telnyx guide).
      ...(env.TELEPHONY_PROVIDER === "telnyx" && env.SIP_TRUNK_USERNAME ? { custom_sip_headers: { "X-Telnyx-Username": env.SIP_TRUNK_USERNAME } } : {}),
      speak_during_execution: true,
      execution_message_description: "Tell the caller you're connecting them to a team member now.",
    });
  }
  return {
    general_prompt: VOICE_GENERAL_PROMPT,
    begin_message: "{{greeting_line}}",
    start_speaker: "agent",
    // Used only if the inbound webhook is unreachable: a snapshot of the knowledge base.
    default_dynamic_variables: {
      assistant_instructions: snapshot.instructions,
      call_context: "Current date and time: unknown - ask the caller which day they mean and confirm the date.",
      greeting_line: snapshot.greeting,
      caller_number: "unknown",
      handoff_number: business.handoffNumber ?? "",
      business_name: business.name,
      assistant_name: business.assistantName,
    },
    model_config: { type: "cascading", primary: { model: env.RETELL_LLM_MODEL }, temperature: 0.2 },
    general_tools: tools,
  };
}

export function buildRetellAgent(
  business: Pick<Business, "name" | "slug" | "retentionDays">,
  llmId: string,
  boostedKeywords: string[],
) {
  return {
    agent_name: `Conroy - ${business.name}`.slice(0, 100),
    response_engine: { type: "retell-llm" as const, llm_id: llmId },
    voice_id: env.RETELL_VOICE_ID,
    language: "en-US" as const,
    webhook_url: `${env.APP_URL}/api/retell/webhook`,
    webhook_events: ["call_started" as const, "call_ended" as const, "call_analyzed" as const],
    boosted_keywords: boostedKeywords.slice(0, 100),
    data_storage_retention_days: Math.max(1, Math.min(business.retentionDays, 365)),
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: 20 * 60 * 1000,
    interruption_sensitivity: 0.8,
    enable_backchannel: true,
    timezone: "America/Jamaica",
    post_call_analysis_data: [
      { type: "string" as const, name: "caller_name", description: "The caller's name if they gave it, otherwise empty." },
      { type: "string" as const, name: "call_reason", description: "In under 12 words, what the caller wanted." },
      {
        type: "enum" as const,
        name: "outcome",
        description: "What happened on the call.",
        choices: ["INFO_GIVEN", "LEAD_CAPTURED", "MESSAGE_TAKEN", "TRANSFERRED", "ABANDONED", "OTHER"],
      },
      { type: "enum" as const, name: "urgency", description: "How urgent the caller's need is.", choices: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    ],
  };
}
