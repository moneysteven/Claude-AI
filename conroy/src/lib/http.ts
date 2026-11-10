import { Prisma } from "@prisma/client";
import { db } from "./db";

/** Small helpers for route handlers. */

export const MAX_WEBHOOK_BYTES = 1_000_000;

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

export function errorJson(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: message }, { status, headers });
}

/** Read the raw body with a size cap (signatures are computed over the exact bytes). */
export async function readRawBody(req: Request, maxBytes = MAX_WEBHOOK_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await req.text();
  return Buffer.byteLength(text) > maxBytes ? null : text;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Best-effort client IP behind Caddy/Nginx. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Record a webhook delivery id. Returns false if it was already processed
 * (provider retry or replay), so the caller can acknowledge and skip it.
 */
export async function firstDelivery(provider: string, externalId: string): Promise<boolean> {
  try {
    await db.webhookReceipt.create({ data: { provider, externalId: externalId.slice(0, 200) } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}
