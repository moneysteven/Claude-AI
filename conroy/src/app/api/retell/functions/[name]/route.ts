import { executeTool, isToolName } from "@/lib/assistant/tools";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { errorJson, json, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { toE164 } from "@/lib/phone";
import { ensureCallLog, recordCallEvents } from "@/lib/retell/calls";
import { verifyRetellSignature } from "@/lib/retell/verify";
import { businessForCall, retellFunctionSchema, retellWebhookKey } from "@/lib/retell/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retell custom functions (check_availability, book_appointment, ...).
 * The same tool code the chat bot uses; the caller's number comes from
 * Retell's call object (caller ID), never from what the model says.
 */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const raw = await readRawBody(req, 200_000);
  if (raw === null) return errorJson(413, "Payload too large");

  if (env.RETELL_VERIFY_SIGNATURES && !verifyRetellSignature(raw, req.headers.get("x-retell-signature"), retellWebhookKey())) {
    logger.warn({ tool: name }, "retell function rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  if (env.RETELL_FUNCTION_SECRET) {
    const given = req.headers.get("x-conroy-function-secret") ?? "";
    if (!safeEqual(given, env.RETELL_FUNCTION_SECRET)) return errorJson(401, "Invalid function secret");
  }
  if (!isToolName(name)) return errorJson(404, "Unknown function");

  const parsed = retellFunctionSchema.safeParse(parseJson(raw));
  if (!parsed.success) return errorJson(400, "Invalid payload");
  const { call, args } = parsed.data;
  if (parsed.data.name && parsed.data.name !== name) return errorJson(400, "Function name mismatch");

  const business = await businessForCall(call.agent_id, call.to_number);
  if (!business || business.status === "DISABLED") {
    return json({ ok: false, error: "This business is not available. Apologise and suggest sending a WhatsApp message." });
  }

  const log = await ensureCallLog(business, call);
  const outcome = await executeTool(name, args ?? {}, {
    businessId: business.id,
    channel: "VOICE",
    trustedPhone: toE164(call.from_number ?? null),
    callLogId: log.id,
  });
  await recordCallEvents(business.id, log.id, outcome.events);
  logger.info({ tool: name, ok: outcome.ok, businessId: business.id }, "retell function executed");
  return json({ ok: outcome.ok, ...outcome.result });
}
