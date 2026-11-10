import Retell from "retell-sdk";
import { z } from "zod";
import { env } from "../env";
import { logger } from "../logger";

/**
 * Deleting data held at Retell: call records (recording, transcript) when a
 * person asks to be erased, and everything (calls, agent, LLM, number import)
 * when a business is deleted. Runs as a background job so a slow or failing
 * Retell API never blocks the dashboard, and pg-boss retries what failed.
 */

/** The slice of the Retell SDK used for clean-up (tests pass a fake). */
export interface RetellCleanupClient {
  call: { delete(callId: string): Promise<unknown> };
  agent: { delete(agentId: string): Promise<unknown> };
  llm: { delete(llmId: string): Promise<unknown> };
  phoneNumber: { delete(phoneNumber: string): Promise<unknown> };
}

export const retellCleanupSchema = z.object({
  reason: z.enum(["person_erased", "business_deleted"]),
  /** Kept for log lines only; the business row may no longer exist. */
  businessSlug: z.string(),
  callIds: z.array(z.string().min(1)).max(50_000).default([]),
  agentId: z.string().nullable().optional(),
  llmId: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
});

export type RetellCleanup = z.infer<typeof retellCleanupSchema>;

export function retellCleanupClient(): RetellCleanupClient | null {
  if (!env.RETELL_API_KEY) return null;
  return new Retell({ apiKey: env.RETELL_API_KEY }) as unknown as RetellCleanupClient;
}

/** Something to delete at Retell? (Avoids queueing empty jobs.) */
export function hasRetellWork(job: Pick<RetellCleanup, "callIds" | "agentId" | "llmId" | "phoneNumber">): boolean {
  return (job.callIds?.length ?? 0) > 0 || Boolean(job.agentId || job.llmId || job.phoneNumber);
}

const isNotFound = (err: unknown) => (err as { status?: number })?.status === 404;

async function removeOne(what: string, fn: () => Promise<unknown>): Promise<"deleted" | "missing" | "failed"> {
  try {
    await fn();
    return "deleted";
  } catch (err) {
    if (isNotFound(err)) return "missing"; // already gone: nothing to do
    logger.warn({ what, err: (err as Error).message }, "retell delete failed");
    return "failed";
  }
}

export interface RetellCleanupResult {
  callsDeleted: number;
  callsMissing: number;
  failed: string[];
}

/**
 * Delete the listed Retell resources. 404s count as done. Throws when anything
 * else failed so the job is retried; a retry repeats only harmless deletes.
 * Order: the number first (stops new calls), then the agent, its LLM, then calls.
 */
export async function runRetellCleanup(job: RetellCleanup, client: RetellCleanupClient | null = retellCleanupClient(), concurrency = 4): Promise<RetellCleanupResult> {
  const result: RetellCleanupResult = { callsDeleted: 0, callsMissing: 0, failed: [] };
  if (!hasRetellWork(job)) return result;
  if (!client) {
    logger.warn({ business: job.businessSlug, reason: job.reason }, "RETELL_API_KEY not set: Retell data must be deleted in the Retell dashboard");
    return result;
  }

  if (job.phoneNumber && (await removeOne("phone number", () => client.phoneNumber.delete(job.phoneNumber as string))) === "failed") {
    result.failed.push("phone number");
  }
  if (job.agentId && (await removeOne("agent", () => client.agent.delete(job.agentId as string))) === "failed") result.failed.push("agent");
  if (job.llmId && (await removeOne("llm", () => client.llm.delete(job.llmId as string))) === "failed") result.failed.push("llm");

  const queue = [...new Set(job.callIds)];
  let failedCalls = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const outcome = await removeOne("call", () => client.call.delete(id as string));
      if (outcome === "deleted") result.callsDeleted++;
      else if (outcome === "missing") result.callsMissing++;
      else failedCalls++;
    }
  });
  await Promise.all(workers);
  if (failedCalls) result.failed.push(`${failedCalls} call(s)`);

  logger.info(
    { business: job.businessSlug, reason: job.reason, callsDeleted: result.callsDeleted, callsMissing: result.callsMissing, failed: result.failed },
    "retell cleanup finished",
  );
  if (result.failed.length) throw new Error(`Retell clean-up incomplete for ${job.businessSlug}: ${result.failed.join(", ")} (will retry)`);
  return result;
}
