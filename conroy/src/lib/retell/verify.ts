import crypto from "node:crypto";

/**
 * Retell webhook signatures (same scheme as the official retell-sdk `verify`):
 *   x-retell-signature: "v=<unix ms>,d=<hex HMAC-SHA256(apiKey, rawBody + timestamp)>"
 * Requests older than 5 minutes are rejected to stop replays.
 */
const FIVE_MINUTES = 5 * 60 * 1000;

export function signRetellBody(rawBody: string, apiKey: string, timestamp: number = Date.now()): string {
  const digest = crypto.createHmac("sha256", apiKey).update(rawBody + timestamp).digest("hex");
  return `v=${timestamp},d=${digest}`;
}

export function verifyRetellSignature(rawBody: string, signature: string | null, apiKey: string | undefined, now: number = Date.now()): boolean {
  if (!signature || !apiKey) return false;
  const match = /^v=(\d+),d=([0-9a-f]{64})$/i.exec(signature.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > FIVE_MINUTES) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody + timestamp).digest();
  const given = Buffer.from(match[2], "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
