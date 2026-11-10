import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = new Date();

/** Uptime check for Caddy/Docker/UptimeRobot: 200 when the app and database are healthy. */
export async function GET() {
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  const healthy = database === "ok";
  return json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
