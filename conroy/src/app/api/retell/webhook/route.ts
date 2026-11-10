import { env } from "@/lib/env";
import { errorJson, firstDelivery, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { handleCallEvent } from "@/lib/retell/calls";
import { verifyRetellSignature } from "@/lib/retell/verify";
import { businessForCall, retellEventSchema, retellWebhookKey } from "@/lib/retell/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Retell call events: call_started, call_ended, call_analyzed. */
export async function POST(req: Request) {
  const raw = await readRawBody(req);
  if (raw === null) return errorJson(413, "Payload too large");
  if (env.RETELL_VERIFY_SIGNATURES && !verifyRetellSignature(raw, req.headers.get("x-retell-signature"), retellWebhookKey())) {
    logger.warn("retell webhook rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  const parsed = retellEventSchema.safeParse(parseJson(raw));
  if (!parsed.success) return errorJson(400, "Invalid payload");
  const { event, call } = parsed.data;

  const business = await businessForCall(call.agent_id, call.to_number);
  if (!business) {
    logger.warn({ event }, "retell event for unknown agent/number");
    return new Response(null, { status: 204 });
  }
  if (!(await firstDelivery("retell", `${event}:${call.call_id}`))) return new Response(null, { status: 204 });

  try {
    await handleCallEvent(business, event, call);
  } catch (err) {
    logger.error({ err: (err as Error).message, event, businessId: business.id }, "retell event processing failed");
    return errorJson(500, "Processing failed");
  }
  return new Response(null, { status: 204 });
}
