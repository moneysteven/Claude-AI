import "../src/lib/env-bootstrap";

import { db } from "../src/lib/db";
import { buildRetellAgent } from "../src/lib/retell/agent-template";
import { importRetellNumber, retellPayloads, syncRetellAgent } from "../src/lib/retell/provision";

/**
 * Create or update a business's Retell LLM + agent from the Conroy template,
 * and optionally import its +1 876 number from your SIP trunk. The same
 * actions are available as buttons in /admin/businesses/<id>.
 *
 *   npm run retell:sync -- --business tashas-beauty-salon
 *   npm run retell:sync -- --business tashas-beauty-salon --import-number +18765550123
 *   npm run retell:sync -- --business tashas-beauty-salon --dry-run
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("business");
  if (!slug) throw new Error("Usage: npm run retell:sync -- --business <slug> [--import-number +1876...] [--dry-run]");
  const business = await db.business.findUniqueOrThrow({ where: { slug } });

  if (process.argv.includes("--dry-run")) {
    const { llm, keywords } = await retellPayloads(business.id);
    console.log(JSON.stringify({ llm: { ...llm, default_dynamic_variables: "(knowledge base snapshot omitted)" } }, null, 2));
    console.log(JSON.stringify({ agent: buildRetellAgent(business, "<llm_id>", keywords) }, null, 2));
    return;
  }

  const { llmId, agentId } = await syncRetellAgent(business.id);
  console.log(`Retell LLM ${llmId} and agent ${agentId} are in sync for ${business.name}.`);
  const number = arg("import-number");
  if (number) {
    const { voiceNumber } = await importRetellNumber(business.id, number);
    console.log(`Imported ${voiceNumber} into Retell.`);
  }
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
