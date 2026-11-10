import { env } from "@/lib/env";
import { errorJson, firstDelivery, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { recordCarrierCall, verifyTwilioSignature } from "@/lib/telephony";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio call status callback (optional, for minute reconciliation).
 * Configure Twilio to POST to https://APP_DOMAIN/api/telephony/twilio.
 */
export async function POST(req: Request) {
  const raw = await readRawBody(req, 100_000);
  if (raw === null) return errorJson(413, "Payload too large");
  const params = Object.fromEntries(new URLSearchParams(raw));
  // Twilio signs the public URL it called, not our internal one behind the proxy.
  const incoming = new URL(req.url);
  const publicUrl = `${env.APP_URL}${incoming.pathname}${incoming.search}`;
  if (!verifyTwilioSignature(env.TWILIO_AUTH_TOKEN, publicUrl, params, req.headers.get("x-twilio-signature"))) {
    logger.warn("twilio webhook rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  const callSid = params.CallSid;
  if (callSid && params.CallStatus === "completed" && (await firstDelivery("twilio", `${callSid}:completed`))) {
    await recordCarrierCall("twilio", callSid, params.To ?? params.Called ?? null, Number(params.CallDuration ?? 0));
  }
  return new Response("<Response/>", { status: 200, headers: { "content-type": "text/xml" } });
}
