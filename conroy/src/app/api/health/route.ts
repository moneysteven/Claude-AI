import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { workerStatus } from "@/lib/heartbeat";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = new Date();
const BACKUP_MAX_AGE_HOURS = 26;

/** Age of the newest database backup, when the backups folder is mounted (Docker). */
function backupStatus(): { status: "ok" | "stale" | "none" | "not_configured"; newest: string | null } {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return { status: "not_configured", newest: null };
  try {
    const newest = fs
      .readdirSync(dir)
      .filter((f) => /^conroy_.*\.dump$/.test(f))
      .map((f) => fs.statSync(path.join(dir, f)).mtime)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!newest) return { status: "none", newest: null };
    return { status: Date.now() - newest.getTime() < BACKUP_MAX_AGE_HOURS * 3600_000 ? "ok" : "stale", newest: newest.toISOString() };
  } catch {
    return { status: "none", newest: null };
  }
}

/**
 * Uptime check.
 *   GET /api/health            -> app + database + background worker + backups (for UptimeRobot)
 *   GET /api/health?scope=app  -> app + database only (Docker healthcheck)
 * 200 when healthy, 503 otherwise. Never reveals configuration or secrets.
 */
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") === "app" ? "app" : "full";
  let database: "ok" | "error" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  let worker: { status: string; lastSeen: string | null } = { status: "skipped", lastSeen: null };
  if (scope === "full" && database === "ok") {
    worker = env.JOBS_ENABLED ? await workerStatus() : { status: "disabled", lastSeen: null };
  }
  const backup = scope === "full" ? backupStatus() : { status: "skipped", newest: null };
  const healthy =
    database === "ok" &&
    (scope === "app" ||
      ((worker.status === "ok" || worker.status === "disabled") && (backup.status === "ok" || backup.status === "not_configured")));
  return json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      worker: worker.status,
      workerLastSeen: worker.lastSeen,
      backup: backup.status,
      newestBackup: backup.newest,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
