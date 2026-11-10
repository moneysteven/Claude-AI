import { env } from "@/lib/env";
import { errorJson, json, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { verifyRetellSignature } from "@/lib/retell/verify";
import { businessForCall, retellInboundSchema, retellWebhookKey, voiceDynamicVariables } from "@/lib/retell/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retell inbound-call webhook (set as the phone number's inbound_webhook_url).
 * Picks the business's agent and injects per-call variables: the greeting in
 * Jamaica time-of-day, the live knowledge base and the handoff number.
 */
export async function POST(req: Request) {
  const raw = await readRawBody(req);
  if (raw === null) return errorJson(413, "Payload too large");
  if (env.RETELL_VERIFY_SIGNATURES && !verifyRetellSignature(raw, req.headers.get("x-retell-signature"), retellWebhookKey())) {
    logger.warn("retell inbound webhook rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  const parsed = retellInboundSchema.safeParse(parseJson(raw));
  if (!parsed.success) return errorJson(400, "Invalid payload");
  const inbound = parsed.data.call_inbound;

  const business = await businessForCall(inbound.agent_id, inbound.to_number);
  if (!business) {
    logger.warn("inbound call to an unknown number");
    return json({ call_inbound: {} });
  }
  const dynamicVariables = await voiceDynamicVariables(business, inbound.from_number ?? null);
  return json({
    call_inbound: {
      ...(business.retellAgentId ? { override_agent_id: business.retellAgentId } : {}),
      dynamic_variables: dynamicVariables,
      metadata: { business_id: business.id },
    },
  });
}
