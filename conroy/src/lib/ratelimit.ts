/**
 * In-memory sliding-window rate limiter. One app container serves each
 * deployment (see DEPLOY_HOSTINGER.md), so per-process limits are enough;
 * swap for a Postgres/Redis store if you scale to several app replicas.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  if (now - lastSweep > 60_000) sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > now - windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.hits[0] + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

function sweep(now: number) {
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < now - 60 * 60 * 1000) buckets.delete(key);
  }
}

export function resetRateLimits() {
  buckets.clear();
}
