import PgBoss from "pg-boss";
import { env } from "../env";
import { logger } from "../logger";

/**
 * Postgres-backed job queue (pg-boss). The web app only *sends* jobs; the
 * worker process (src/worker.ts) runs them and the cron schedules.
 * With JOBS_ENABLED=false (tests) jobs run inline so flows stay deterministic.
 */
export const JOB = {
  BOOKING_NOTIFY: "booking-notify",
  WHATSAPP_INBOUND: "whatsapp-inbound",
  OWNER_CALL_SUMMARY: "owner-call-summary",
  STAFF_ALERT: "staff-alert",
  PAYMENT_SEND: "payment-send",
  ADMIN_ALERT: "admin-alert",
  REMINDER_SCAN: "reminder-scan",
  PAYMENT_FOLLOWUP_SCAN: "payment-followup-scan",
  RETENTION_PURGE: "retention-purge",
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

export interface EnqueueOptions {
  startAfter?: Date | number;
  /** Jobs with the same singletonKey are de-duplicated while one is queued. */
  singletonKey?: string;
}

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStarting?: Promise<PgBoss> };

export async function getBoss(opts: { worker?: boolean } = {}): Promise<PgBoss> {
  if (globalForBoss.boss) return globalForBoss.boss;
  if (!globalForBoss.bossStarting) {
    globalForBoss.bossStarting = (async () => {
      const boss = new PgBoss({
        connectionString: env.DATABASE_URL,
        schema: "pgboss",
        // Only the worker supervises queues and runs cron; the web app just sends.
        supervise: Boolean(opts.worker),
        schedule: Boolean(opts.worker),
        max: opts.worker ? 10 : 3,
      });
      boss.on("error", (err) => logger.error({ err: err.message }, "pg-boss error"));
      await boss.start();
      for (const name of Object.values(JOB)) await boss.createQueue(name);
      globalForBoss.boss = boss;
      return boss;
    })();
  }
  return globalForBoss.bossStarting;
}

export async function enqueue(name: JobName, data: object, opts: EnqueueOptions = {}): Promise<void> {
  if (!env.JOBS_ENABLED) {
    // Inline mode: run now, never throw into the caller.
    const { runJob } = await import("./handlers");
    try {
      await runJob(name, data);
    } catch (err) {
      logger.error({ err: (err as Error).message, job: name }, "inline job failed");
    }
    return;
  }
  const boss = await getBoss();
  await boss.send(name, data, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    ...(opts.startAfter ? { startAfter: opts.startAfter instanceof Date ? opts.startAfter : new Date(Date.now() + opts.startAfter * 1000) } : {}),
    ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}),
  });
}
