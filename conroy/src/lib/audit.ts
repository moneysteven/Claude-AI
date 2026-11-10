import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

export interface AuditEntry {
  businessId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Never put secrets or message bodies here. */
  details?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append-only audit trail of admin and assistant actions. Never throws. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        businessId: entry.businessId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, action: entry.action }, "audit log write failed");
  }
}
