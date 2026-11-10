import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { errorJson, json, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { dispatchWhatsAppWebhook } from "@/lib/whatsapp/dispatch";
import { verifyDialog360Token } from "@/lib/whatsapp/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 360dialog webhook. 360dialog doesn't sign payloads, so a shared secret
 * authenticates them: the "Register webhook" button on the business page sets
 *   https://APP_DOMAIN/api/whatsapp/360dialog?business=SLUG
 * with an X-Conroy-Webhook-Token header. Manual setups can put ?token=... in the URL instead.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  // The secret arrives as a header (set when registering the webhook via the 360dialog API) or, as a fallback, in the URL.
  const token = req.headers.get("x-conroy-webhook-token") ?? url.searchParams.get("token");
  if (!verifyDialog360Token(token, env.DIALOG360_WEBHOOK_TOKEN)) {
    logger.warn("360dialog webhook rejected: bad token");
    return errorJson(401, "Invalid token");
  }
  const raw = await readRawBody(req);
  if (raw === null) return errorJson(413, "Payload too large");
  const body = parseJson(raw);
  if (body === undefined) return errorJson(400, "Invalid JSON");
  const slug = url.searchParams.get("business");
  const fallback = slug ? await db.business.findUnique({ where: { slug } }) : null;
  try {
    const result = await dispatchWhatsAppWebhook(body, fallback);
    return json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "360dialog webhook processing failed");
    return errorJson(500, "Processing failed");
  }
}
