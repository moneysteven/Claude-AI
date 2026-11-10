import crypto from "node:crypto";
import { db } from "./db";
import { toE164 } from "./phone";
import { recordUsage } from "./usage";

/**
 * Carrier webhooks (Twilio / Telnyx). Retell already reports call minutes;
 * these optional status callbacks record what the carrier saw, so Steven can
 * reconcile carrier bills against Retell minutes per business.
 */

/**
 * Twilio: X-Twilio-Signature = base64(HMAC-SHA1(authToken, fullUrl + each
 * POST param name+value sorted by name)). `url` must be the exact public URL
 * configured in Twilio, including the query string.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

/** The URL with and without the default port: Twilio's own signing is inconsistent about it (same as their SDK). */
function urlVariants(url: string): string[] {
  try {
    const u = new URL(url);
    const defaultPort = u.protocol === "https:" ? "443" : "80";
    const withoutPort = new URL(url);
    withoutPort.port = "";
    const withPort = `${u.protocol}//${u.hostname}:${u.port || defaultPort}${u.pathname}${u.search}`;
    return [...new Set([url, withoutPort.toString(), withPort])];
  } catch {
    return [url];
  }
}

export function verifyTwilioSignature(authToken: string | undefined, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!authToken || !signature) return false;
  const given = Buffer.from(signature);
  return urlVariants(url).some((candidate) => {
    const expected = Buffer.from(twilioSignature(authToken, candidate, params));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

// DER header for a raw 32-byte Ed25519 public key (SubjectPublicKeyInfo).
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Telnyx: Ed25519 signature (base64, header telnyx-signature-ed25519) over
 * "<telnyx-timestamp>|<raw body>", checked with the account's public key
 * (base64, Mission Control > Keys & Credentials > Public Key).
 */
export function verifyTelnyxSignature(
  publicKeyB64: string | undefined,
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!publicKeyB64 || !signatureB64 || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  try {
    const raw = Buffer.from(publicKeyB64, "base64");
    if (raw.length !== 32) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Record carrier-side seconds for the business that owns the dialled number. */
export async function recordCarrierCall(provider: "twilio" | "telnyx", callId: string, toNumber: string | null, seconds: number, endedAt?: Date) {
  const to = toE164(toNumber);
  if (!to || !(seconds > 0)) return { recorded: false as const };
  const business = await db.business.findUnique({ where: { voiceNumber: to } });
  if (!business) return { recorded: false as const };
  await recordUsage(business.id, "TELEPHONY_SECONDS", seconds, `${provider}:${callId}`, endedAt);
  return { recorded: true as const, businessId: business.id };
}
