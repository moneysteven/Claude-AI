import { z } from "zod";
import { env } from "@/lib/env";
import { errorJson, firstDelivery, json, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { recordCarrierCall, verifyTelnyxSignature } from "@/lib/telephony";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.string(),
    payload: z
      .object({
        call_session_id: z.string().optional(),
        call_control_id: z.string().optional(),
        to: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
      })
      .passthrough(),
  }),
});

/**
 * Telnyx call webhooks (optional, for minute reconciliation).
 * Point the connection's webhook URL at https://APP_DOMAIN/api/telephony/telnyx.
 */
export async function POST(req: Request) {
  const raw = await readRawBody(req, 200_000);
  if (raw === null) return errorJson(413, "Payload too large");
  if (!verifyTelnyxSignature(env.TELNYX_PUBLIC_KEY, raw, req.headers.get("telnyx-signature-ed25519"), req.headers.get("telnyx-timestamp"))) {
    logger.warn("telnyx webhook rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  const parsed = eventSchema.safeParse(parseJson(raw));
  if (!parsed.success) return errorJson(400, "Invalid payload");
  const { id, event_type, payload } = parsed.data.data;
  if (!(await firstDelivery("telnyx", id))) return json({ ok: true, duplicate: true });
  if (event_type === "call.hangup" && payload.start_time && payload.end_time) {
    const seconds = Math.round((new Date(payload.end_time).getTime() - new Date(payload.start_time).getTime()) / 1000);
    const callId = payload.call_session_id ?? payload.call_control_id ?? id;
    await recordCarrierCall("telnyx", callId, payload.to ?? null, seconds, new Date(payload.end_time));
  }
  return json({ ok: true });
}
