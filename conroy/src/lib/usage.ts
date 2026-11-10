import { Prisma, type UsageKind } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

/**
 * Usage metering per business (voice seconds, WhatsApp messages, LLM tokens).
 * `dedupeKey` makes webhook retries safe: the same event is only counted once.
 */
export async function recordUsage(businessId: string, kind: UsageKind, quantity: number, dedupeKey?: string, occurredAt?: Date) {
  if (!(quantity > 0)) return;
  try {
    await db.usageEvent.create({
      data: { businessId, kind, quantity: Math.round(quantity), dedupeKey: dedupeKey ?? null, occurredAt: occurredAt ?? new Date() },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // already counted
    logger.error({ err: (err as Error).message, businessId, kind }, "usage write failed");
  }
}

export async function usageTotals(businessId: string, from: Date, to: Date): Promise<Record<UsageKind, number>> {
  const rows = await db.usageEvent.groupBy({
    by: ["kind"],
    where: { businessId, occurredAt: { gte: from, lt: to } },
    _sum: { quantity: true },
  });
  const totals = {
    VOICE_SECONDS: 0,
    WHATSAPP_INBOUND: 0,
    WHATSAPP_OUTBOUND_SESSION: 0,
    WHATSAPP_OUTBOUND_TEMPLATE: 0,
    WEB_CHAT_MESSAGE: 0,
    LLM_INPUT_TOKENS: 0,
    LLM_OUTPUT_TOKENS: 0,
  } as Record<UsageKind, number>;
  for (const r of rows) totals[r.kind] = r._sum.quantity ?? 0;
  return totals;
}
