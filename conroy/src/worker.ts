import "./lib/env-bootstrap";
import { env } from "./lib/env";
import { getBoss, JOB, type JobName } from "./lib/jobs/queue";
import { runJob } from "./lib/jobs/handlers";
import { beat } from "./lib/heartbeat";
import { logger } from "./lib/logger";
import { sendAdminAlert } from "./lib/notify/email";
import { JAMAICA_TZ } from "./lib/time";

/**
 * Background worker: runs queued jobs (WhatsApp replies, notifications) and
 * the schedules below. Start with `npm run worker` (Docker: the `worker` service).
 */
const SCHEDULES: { name: JobName; cron: string; what: string }[] = [
  { name: JOB.REMINDER_SCAN, cron: "*/5 * * * *", what: "24h + 2h appointment reminders" },
  { name: JOB.PAYMENT_FOLLOWUP_SCAN, cron: "7 * * * *", what: "payment follow-ups (day 3 / day 7)" },
  { name: JOB.RETENTION_PURGE, cron: "15 3 * * *", what: "delete expired transcripts/messages (03:15 Jamaica time)" },
  { name: JOB.USAGE_ALERT_SCAN, cron: "23 * * * *", what: "80% / 100% plan usage alerts" },
];

const SCHEDULED = new Set<string>(SCHEDULES.map((s) => s.name));

async function main() {
  if (!env.JOBS_ENABLED) {
    logger.warn("JOBS_ENABLED=false: worker not started");
    return;
  }
  const boss = await getBoss({ worker: true });

  for (const name of Object.values(JOB)) {
    await boss.work(name, { batchSize: 1, pollingIntervalSeconds: SCHEDULED.has(name) ? 30 : 2 }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await runJob(name, job.data);
          logger.info({ job: name, id: job.id, ms: Date.now() - started }, "job done");
        } catch (err) {
          logger.error({ job: name, id: job.id, err: (err as Error).message }, "job failed");
          await sendAdminAlert(`Job failing: ${name}`, (err as Error).message, { jobId: job.id });
          throw err; // pg-boss retries with backoff
        }
      }
    });
  }

  for (const s of SCHEDULES) {
    await boss.schedule(s.name, s.cron, {}, { tz: JAMAICA_TZ });
    logger.info({ job: s.name, cron: s.cron, tz: JAMAICA_TZ }, `scheduled: ${s.what}`);
  }
  logger.info("worker started");

  // Liveness for /api/health and the Docker healthcheck.
  const heartbeat = () => beat("worker", { pid: process.pid }).catch((err) => logger.error({ err: (err as Error).message }, "heartbeat failed"));
  await heartbeat();
  const heartbeatTimer = setInterval(heartbeat, 60_000);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker stopping");
    clearInterval(heartbeatTimer);
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(async (err) => {
  logger.fatal({ err: (err as Error).message }, "worker crashed");
  await sendAdminAlert("Worker crashed", (err as Error).message).catch(() => {});
  process.exit(1);
});
