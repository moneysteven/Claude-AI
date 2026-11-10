import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { errorJson, json, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { dispatchWhatsAppWebhook } from "@/lib/whatsapp/dispatch";
import { verifyMetaSignature } from "@/lib/whatsapp/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta webhook verification handshake (hub.challenge). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && env.META_WA_VERIFY_TOKEN && safeEqual(token, env.META_WA_VERIFY_TOKEN)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return errorJson(403, "Verification failed");
}

/** Incoming messages and delivery receipts from the WhatsApp Cloud API. */
export async function POST(req: Request) {
  const raw = await readRawBody(req);
  if (raw === null) return errorJson(413, "Payload too large");
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.META_WA_APP_SECRET)) {
    logger.warn("meta webhook rejected: bad signature");
    return errorJson(401, "Invalid signature");
  }
  const body = parseJson(raw);
  if (body === undefined) return errorJson(400, "Invalid JSON");
  try {
    const result = await dispatchWhatsAppWebhook(body);
    return json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "meta webhook processing failed");
    return errorJson(500, "Processing failed");
  }
}
