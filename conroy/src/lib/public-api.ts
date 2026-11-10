import type { Business } from "@prisma/client";
import { getActiveBusinessBySlug } from "./business";
import { clientIp, errorJson, json } from "./http";
import { rateLimit } from "./ratelimit";

/**
 * Shared plumbing for the public widget endpoints (/api/public/[slug]/*):
 * business lookup, CORS against the business's allowed website origins, and
 * per-IP rate limits. Nothing here requires a login; nothing returns private data.
 */

export function allowedOrigin(req: Request, business: Pick<Business, "widgetOrigins">): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return "*"; // same-origin or server-to-server
  if (business.widgetOrigins.length === 0) return origin;
  return business.widgetOrigins.includes(origin.toLowerCase()) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      }
    : { vary: "Origin" };
}

export type PublicContext =
  | { ok: true; business: Business; headers: Record<string, string>; ip: string }
  | { ok: false; response: Response };

/** Resolve the business and enforce CORS + a rate limit for one public request. */
export async function publicContext(
  req: Request,
  slug: string,
  limit: { name: string; max: number; windowMs: number },
): Promise<PublicContext> {
  const business = await getActiveBusinessBySlug(slug);
  if (!business) return { ok: false, response: errorJson(404, "Unknown business") };
  const origin = allowedOrigin(req, business);
  const headers = corsHeaders(origin);
  if (!origin) return { ok: false, response: errorJson(403, "This website is not allowed to use the widget", headers) };
  const ip = clientIp(req);
  const rl = rateLimit(`${limit.name}:${business.id}:${ip}`, limit.max, limit.windowMs);
  if (!rl.allowed) {
    return { ok: false, response: errorJson(429, "Too many requests, please slow down", { ...headers, "retry-after": String(rl.retryAfterSec) }) };
  }
  return { ok: true, business, headers, ip };
}

export async function preflight(req: Request, slug: string): Promise<Response> {
  const business = await getActiveBusinessBySlug(slug);
  if (!business) return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin(req, business)) });
}

export { json };
