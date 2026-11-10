import Retell from "retell-sdk";
import { buildSystemPrompt } from "../assistant/prompt";
import { audit } from "../audit";
import { db } from "../db";
import { env } from "../env";
import { knowledgeTextFor } from "../knowledge";
import { toE164 } from "../phone";
import { buildRetellAgent, buildRetellLlm } from "./agent-template";
import { buildVoiceGreeting } from "./voice";

/**
 * Create / update a business's Retell LLM + agent from the Conroy template
 * and import its +1 876 number. Used by onboarding, the super-admin "Sync
 * voice agent" button and `npm run retell:sync`.
 */

/** The slice of the Retell SDK we use (lets tests pass a fake). */
export interface RetellClientLike {
  llm: {
    create(params: never): Promise<{ llm_id: string }>;
    update(id: string, params: never): Promise<{ llm_id: string }>;
  };
  agent: {
    create(params: never): Promise<{ agent_id: string }>;
    update(id: string, params: never): Promise<{ agent_id: string }>;
  };
  phoneNumber: {
    import(params: never): Promise<{ phone_number: string }>;
    update(phoneNumber: string, params: never): Promise<{ phone_number: string }>;
  };
}

export function retellConfigured(): boolean {
  return Boolean(env.RETELL_API_KEY);
}

export function retellClient(): RetellClientLike {
  if (!env.RETELL_API_KEY) throw new Error("RETELL_API_KEY is not set");
  return new Retell({ apiKey: env.RETELL_API_KEY }) as unknown as RetellClientLike;
}

export async function retellPayloads(businessId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const [services, staff] = await Promise.all([
    db.service.findMany({ where: { businessId, active: true }, select: { name: true } }),
    db.staff.findMany({ where: { businessId, active: true }, select: { name: true } }),
  ]);
  const kb = await knowledgeTextFor(businessId);
  const prompt = buildSystemPrompt(business, kb, "VOICE");
  const llm = buildRetellLlm(business, { instructions: prompt.staticPart, greeting: buildVoiceGreeting(business) });
  const keywords = [business.name, business.assistantName, business.area ?? "", ...services.map((s) => s.name), ...staff.map((s) => s.name), "unnu", "wah gwaan"].filter(
    Boolean,
  );
  return { business, llm, keywords };
}

export async function syncRetellAgent(businessId: string, client: RetellClientLike = retellClient(), actorUserId?: string | null) {
  const { business, llm: llmParams, keywords } = await retellPayloads(businessId);
  const llm = business.retellLlmId
    ? await client.llm.update(business.retellLlmId, llmParams as never)
    : await client.llm.create(llmParams as never);
  const agentParams = buildRetellAgent(business, llm.llm_id, keywords);
  const agent = business.retellAgentId
    ? await client.agent.update(business.retellAgentId, agentParams as never)
    : await client.agent.create(agentParams as never);
  await db.business.update({ where: { id: businessId }, data: { retellLlmId: llm.llm_id, retellAgentId: agent.agent_id } });
  await audit({ businessId, userId: actorUserId, action: "voice.sync_agent", entityType: "Business", entityId: businessId });
  return { llmId: llm.llm_id, agentId: agent.agent_id };
}

/**
 * Connect a +1 876 number from the SIP trunk (Twilio/Telnyx) to this
 * business's agent. Retell sends inbound calls to /api/retell/inbound.
 */
export async function importRetellNumber(businessId: string, number: string, client: RetellClientLike = retellClient(), actorUserId?: string | null) {
  const e164 = toE164(number);
  if (!e164) throw new Error("That phone number isn't valid");
  if (!env.SIP_TERMINATION_URI) throw new Error("SIP_TERMINATION_URI is not set (your Twilio/Telnyx trunk's termination URI)");
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  if (!business.retellAgentId) throw new Error("Create the voice agent first");
  const taken = await db.business.findFirst({ where: { voiceNumber: e164, id: { not: businessId } } });
  if (taken) throw new Error(`That number already belongs to ${taken.name}`);
  await client.phoneNumber.import({
    phone_number: e164,
    termination_uri: env.SIP_TERMINATION_URI,
    inbound_agents: [{ agent_id: business.retellAgentId, weight: 1 }],
    inbound_webhook_url: `${env.APP_URL}/api/retell/inbound`,
    nickname: business.name.slice(0, 60),
    ...(env.SIP_TRUNK_USERNAME ? { sip_trunk_auth_username: env.SIP_TRUNK_USERNAME } : {}),
    ...(env.SIP_TRUNK_PASSWORD ? { sip_trunk_auth_password: env.SIP_TRUNK_PASSWORD } : {}),
  } as never);
  await db.business.update({ where: { id: businessId }, data: { voiceNumber: e164 } });
  await audit({ businessId, userId: actorUserId, action: "voice.import_number", entityType: "Business", entityId: businessId });
  return { voiceNumber: e164 };
}
