import "../src/lib/env-bootstrap";

import Retell from "retell-sdk";
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { knowledgeTextFor } from "../src/lib/knowledge";
import { buildSystemPrompt } from "../src/lib/assistant/prompt";
import { buildRetellAgent, buildRetellLlm } from "../src/lib/retell/agent-template";
import { buildVoiceGreeting } from "../src/lib/retell/voice";

/**
 * Create or update a business's Retell LLM + agent from the Conroy template,
 * and optionally import its +1 876 number from your SIP trunk.
 *
 *   npm run retell:sync -- --business tashas-beauty-salon
 *   npm run retell:sync -- --business tashas-beauty-salon --import-number +18765550123
 *   npm run retell:sync -- --business tashas-beauty-salon --dry-run
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const slug = arg("business");
  if (!slug) throw new Error("Usage: npm run retell:sync -- --business <slug> [--import-number +1876...] [--dry-run]");
  const business = await db.business.findUniqueOrThrow({ where: { slug } });
  const services = await db.service.findMany({ where: { businessId: business.id, active: true } });
  const staff = await db.staff.findMany({ where: { businessId: business.id, active: true } });

  const kb = await knowledgeTextFor(business.id);
  const prompt = buildSystemPrompt(business, kb, "VOICE");
  const llmParams = buildRetellLlm(business, { instructions: prompt.staticPart, greeting: buildVoiceGreeting(business) });
  const keywords = [
    business.name,
    business.assistantName,
    business.area ?? "",
    ...services.map((s) => s.name),
    ...staff.map((s) => s.name),
    "Patois",
    "unnu",
    "wah gwaan",
  ].filter(Boolean);

  if (flag("dry-run")) {
    console.log(JSON.stringify({ llm: { ...llmParams, default_dynamic_variables: "(snapshot omitted)" } }, null, 2));
    console.log(JSON.stringify({ agent: buildRetellAgent(business, "<llm_id>", keywords) }, null, 2));
    return;
  }
  if (!env.RETELL_API_KEY) throw new Error("RETELL_API_KEY is not set");
  const retell = new Retell({ apiKey: env.RETELL_API_KEY });

  // The template is checked by our own types; the SDK's unions are cast at this boundary.
  const llm = business.retellLlmId
    ? await retell.llm.update(business.retellLlmId, llmParams as unknown as Retell.LlmUpdateParams)
    : await retell.llm.create(llmParams as unknown as Retell.LlmCreateParams);
  const agentParams = buildRetellAgent(business, llm.llm_id, keywords);
  const agent = business.retellAgentId
    ? await retell.agent.update(business.retellAgentId, agentParams as unknown as Retell.AgentUpdateParams)
    : await retell.agent.create(agentParams as unknown as Retell.AgentCreateParams);

  await db.business.update({ where: { id: business.id }, data: { retellLlmId: llm.llm_id, retellAgentId: agent.agent_id } });
  console.log(`Retell LLM ${llm.llm_id} and agent ${agent.agent_id} are in sync for ${business.name}.`);

  const number = arg("import-number");
  if (number) {
    if (!env.SIP_TERMINATION_URI) throw new Error("SIP_TERMINATION_URI is required to import a number");
    const params = {
      phone_number: number,
      termination_uri: env.SIP_TERMINATION_URI,
      inbound_agents: [{ agent_id: agent.agent_id, weight: 1 }],
      inbound_webhook_url: `${env.APP_URL}/api/retell/inbound`,
      nickname: business.name.slice(0, 60),
      ...(env.SIP_TRUNK_USERNAME ? { sip_trunk_auth_username: env.SIP_TRUNK_USERNAME } : {}),
      ...(env.SIP_TRUNK_PASSWORD ? { sip_trunk_auth_password: env.SIP_TRUNK_PASSWORD } : {}),
    };
    await retell.phoneNumber.import(params as Retell.PhoneNumberImportParams);
    await db.business.update({ where: { id: business.id }, data: { voiceNumber: number } });
    console.log(`Imported ${number} into Retell (inbound webhook: ${params.inbound_webhook_url}).`);
  }
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
