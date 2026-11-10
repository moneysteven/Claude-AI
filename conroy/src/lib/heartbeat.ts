import fs from "node:fs";
import { db } from "./db";

/**
 * The worker records it is alive every minute: in the database (for
 * /api/health and uptime monitors) and in a local file (for the Docker
 * healthcheck, which can't query Postgres).
 */
export const WORKER_HEARTBEAT_FILE = "/tmp/conroy-worker-heartbeat";
export const WORKER_STALE_AFTER_MS = 5 * 60 * 1000;

export async function beat(key = "worker", info?: Record<string, string | number>) {
  const at = new Date();
  await db.heartbeat.upsert({ where: { key }, create: { key, at, info }, update: { at, info } });
  try {
    fs.writeFileSync(WORKER_HEARTBEAT_FILE, at.toISOString());
  } catch {
    /* read-only filesystem: the DB heartbeat still works */
  }
}

export async function workerStatus(now: Date = new Date()): Promise<{ status: "ok" | "stale" | "never"; lastSeen: string | null }> {
  const row = await db.heartbeat.findUnique({ where: { key: "worker" } });
  if (!row) return { status: "never", lastSeen: null };
  return { status: now.getTime() - row.at.getTime() < WORKER_STALE_AFTER_MS ? "ok" : "stale", lastSeen: row.at.toISOString() };
}
