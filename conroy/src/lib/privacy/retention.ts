import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { db } from "../db";
import { decryptOptional } from "../crypto";
import { logger } from "../logger";
import { tenantDb } from "../tenant";
import { audit } from "../audit";
import { enqueue, JOB } from "../jobs/queue";
import { hasRetellWork, type RetellCleanup } from "../retell/cleanup";

/**
 * Data Protection Act 2020 support:
 * - nightly deletion of recordings, transcripts, summaries and chat text after
 *   each business's `retentionDays`;
 * - nightly removal of customer details after `customerRetentionMonths`
 *   without any contact from that person (bookings and payments are kept for
 *   the business's records, anonymised);
 * - export / erasure of one person's data on request.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Most people processed per business per night, so one run stays short. */
const EXPIRY_BATCH = 500;

/** Name left on bookings after the person's details are removed. */
export const ERASED_NAME = { request: "Deleted on request", expired: "Past customer" } as const;
type EraseMode = keyof typeof ERASED_NAME;

/** Queues deletion of Retell's copies; tests pass their own function. */
export type ScheduleRetellCleanup = (job: RetellCleanup) => Promise<void>;
export const queueRetellCleanup: ScheduleRetellCleanup = (job) =>
  enqueue(JOB.RETELL_CLEANUP, job, { singletonKey: job.reason === "business_deleted" ? `retell-cleanup:${job.businessSlug}` : undefined });

// ------------------------------------------------------------ nightly job

/** Daily job (03:15 Jamaica time): everything past its retention period. */
export async function purgeExpiredData(now: Date = new Date()) {
  const businesses = await db.business.findMany({ select: { id: true, retentionDays: true, customerRetentionMonths: true } });
  let calls = 0;
  let messages = 0;
  let people = 0;
  for (const b of businesses) {
    const cutoff = new Date(now.getTime() - Math.max(1, b.retentionDays) * DAY);
    const c = await db.callLog.updateMany({
      where: { businessId: b.id, createdAt: { lt: cutoff }, purgedAt: null },
      data: { transcriptEnc: null, recordingUrlEnc: null, summaryEnc: null, purgedAt: now },
    });
    const m = await db.message.updateMany({
      where: { businessId: b.id, createdAt: { lt: cutoff }, bodyEnc: { not: null } },
      data: { bodyEnc: null },
    });
    calls += c.count;
    messages += m.count;
    try {
      people += (await expireCustomerRecords(b.id, b.customerRetentionMonths, now)).people;
    } catch (err) {
      // One business's failure must not stop the others; the next run retries.
      logger.error({ err: (err as Error).message, businessId: b.id }, "customer record expiry failed");
    }
  }
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.webhookReceipt.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - 30 * DAY) } } });
  logger.info({ calls, messages, people }, "retention purge complete");
  return { calls, messages, people };
}

export function customerCutoff(months: number, now: Date = new Date()): Date {
  return DateTime.fromJSDate(now, { zone: "utc" }).minus({ months: Math.max(1, months) }).toJSDate();
}

/**
 * Phone numbers whose most recent contact with the business (booking date,
 * lead, call, chat, payment request, first contact) is older than `cutoff`.
 * A future booking counts as recent, so regular customers are never touched.
 * Opted-out numbers whose details were already removed are skipped: they are
 * kept only so STOP keeps working.
 */
export async function stalePhones(businessId: string, cutoff: Date, limit = EXPIRY_BATCH): Promise<string[]> {
  const rows = await db.$queryRaw<{ phone: string }[]>(Prisma.sql`
    SELECT phone FROM (
      SELECT phone, GREATEST("createdAt", COALESCE("lastInboundWhatsappAt", "createdAt")) AS at
        FROM "Contact"
        WHERE "businessId" = ${businessId} AND phone IS NOT NULL
          AND NOT ("whatsappOptOut" AND name IS NULL AND email IS NULL)
      UNION ALL
      SELECT "customerPhone", "startAt" FROM "Booking"
        WHERE "businessId" = ${businessId} AND "customerPhone" IS NOT NULL
      UNION ALL
      SELECT phone, "createdAt" FROM "Lead"
        WHERE "businessId" = ${businessId} AND phone IS NOT NULL
      UNION ALL
      SELECT "fromNumber", COALESCE("startedAt", "createdAt") FROM "CallLog"
        WHERE "businessId" = ${businessId} AND "fromNumber" IS NOT NULL
      UNION ALL
      SELECT "externalId", "lastMessageAt" FROM "Conversation"
        WHERE "businessId" = ${businessId} AND channel = 'WHATSAPP'::"Channel"
      UNION ALL
      SELECT c.phone, v."lastMessageAt" FROM "Conversation" v JOIN "Contact" c ON c.id = v."contactId"
        WHERE v."businessId" = ${businessId} AND c."businessId" = ${businessId} AND c.phone IS NOT NULL
      UNION ALL
      SELECT "customerPhone", "createdAt" FROM "PaymentRequest"
        WHERE "businessId" = ${businessId} AND "customerPhone" <> 'deleted'
    ) activity
    GROUP BY phone
    HAVING MAX(at) < ${cutoff}
    ORDER BY phone
    LIMIT ${limit}`);
  return rows.map((r) => r.phone);
}

export interface ExpiryResult {
  people: number;
  anonymousLeads: number;
  anonymousBookings: number;
  anonymousChats: number;
  callReasons: number;
}

/**
 * Remove customer details nobody has needed for `months` months. People are
 * handled one at a time, exactly like an erasure request (bookings kept but
 * anonymised); records with no phone number expire on their own dates.
 */
export async function expireCustomerRecords(businessId: string, months: number, now: Date = new Date()): Promise<ExpiryResult> {
  const cutoff = customerCutoff(months, now);
  const t = tenantDb(businessId);
  const phones = await stalePhones(businessId, cutoff);
  for (const phone of phones) {
    await t.$transaction((tx) => erasePhone(tx as unknown as PrivacyTx, phone, "expired", now));
  }
  const [leads, bookings, chats, calls] = await Promise.all([
    t.lead.deleteMany({ where: { phone: null, createdAt: { lt: cutoff } } }),
    t.booking.updateMany({
      where: {
        customerPhone: null,
        startAt: { lt: cutoff },
        OR: [{ customerName: { notIn: [ERASED_NAME.request, ERASED_NAME.expired] } }, { notes: { not: null } }, { contactId: { not: null } }],
      },
      data: { customerName: ERASED_NAME.expired, notes: null, contactId: null },
    }),
    t.conversation.deleteMany({ where: { contactId: null, channel: "WEB", lastMessageAt: { lt: cutoff } } }),
    t.callLog.updateMany({ where: { fromNumber: null, createdAt: { lt: cutoff }, reason: { not: null } }, data: { reason: null, contactId: null } }),
  ]);
  const result = { people: phones.length, anonymousLeads: leads.count, anonymousBookings: bookings.count, anonymousChats: chats.count, callReasons: calls.count };
  if (Object.values(result).some((n) => n > 0)) {
    await audit({ businessId, action: "privacy.expire", details: { ...result, months, cutoff: cutoff.toISOString() } });
  }
  return result;
}

// ------------------------------------------------------------ one person

/** Everything held about one phone number, decrypted, for a subject access request. */
export async function exportPersonData(businessId: string, phone: string) {
  const t = tenantDb(businessId);
  const contact = await t.contact.findFirst({ where: { phone } });
  const byContact = contact ? [{ contactId: contact.id }] : [];
  const [bookings, leads, conversations, calls, payments] = await Promise.all([
    t.booking.findMany({ where: { OR: [{ customerPhone: phone }, ...byContact] }, include: { service: { select: { name: true } } } }),
    t.lead.findMany({ where: { OR: [{ phone }, ...byContact] } }),
    t.conversation.findMany({
      where: { OR: [{ externalId: phone }, ...byContact] },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    t.callLog.findMany({ where: { OR: [{ fromNumber: phone }, ...byContact] } }),
    t.paymentRequest.findMany({ where: { OR: [{ customerPhone: phone }, ...byContact] } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    phone,
    contact: contact && { name: contact.name, email: contact.email, whatsappOptOut: contact.whatsappOptOut, createdAt: contact.createdAt },
    bookings: bookings.map((b) => ({
      reference: b.reference,
      service: b.service.name,
      startAt: b.startAt,
      status: b.status,
      name: b.customerName,
      notes: b.notes,
      channel: b.channel,
    })),
    leads: leads.map((l) => ({ name: l.name, request: l.request, preferredTime: l.preferredTime, createdAt: l.createdAt, status: l.status })),
    messages: conversations.flatMap((c) =>
      c.messages.map((m) => ({ at: m.createdAt, channel: c.channel, direction: m.direction, from: m.sender, text: decryptOptional(m.bodyEnc) })),
    ),
    calls: calls.map((c) => ({
      at: c.startedAt,
      durationSec: c.durationSec,
      outcome: c.outcome,
      summary: decryptOptional(c.summaryEnc),
      transcript: decryptOptional(c.transcriptEnc),
    })),
    payments: payments.map((p) => ({ reference: p.reference, amountCents: p.amountCents, status: p.status, createdAt: p.createdAt })),
  };
}

/** The models erasePhone touches, as seen inside a tenant-scoped transaction. */
type PrivacyTx = Pick<Prisma.TransactionClient, "contact" | "booking" | "lead" | "conversation" | "callLog" | "paymentRequest">;

export interface EraseCounts {
  bookings: number;
  leads: number;
  conversations: number;
  calls: number;
  payments: number;
  contacts: number;
  /** Retell call ids whose copies should be deleted at Retell too. */
  retellCallIds: string[];
}

/**
 * Remove one person's details inside a transaction. Records found by phone
 * number or by the linked contact (website chats) are all covered.
 * - "request": the person asked; everything goes, including an opt-out record.
 * - "expired": retention ran out; an opted-out number is kept (name and email
 *   removed) so STOP is still honoured if they come back.
 */
async function erasePhone(tx: PrivacyTx, phone: string, mode: EraseMode, now: Date): Promise<EraseCounts> {
  const contacts = await tx.contact.findMany({ where: { phone }, select: { id: true, whatsappOptOut: true } });
  const ids = contacts.map((c) => c.id);
  const mine = <K extends string>(key: K) => [{ [key]: phone } as Record<K, string>, ...(ids.length ? [{ contactId: { in: ids } }] : [])];

  const bookings = await tx.booking.updateMany({
    where: { OR: mine("customerPhone") },
    data: { customerName: ERASED_NAME[mode], customerPhone: null, notes: null, contactId: null },
  });
  const leads = await tx.lead.deleteMany({ where: { OR: mine("phone") } });
  const conversations = await tx.conversation.deleteMany({ where: { OR: mine("externalId") } });
  const callRows = await tx.callLog.findMany({ where: { OR: mine("fromNumber") }, select: { retellCallId: true } });
  const calls = await tx.callLog.updateMany({
    where: { OR: mine("fromNumber") },
    data: { fromNumber: null, transcriptEnc: null, summaryEnc: null, recordingUrlEnc: null, reason: null, contactId: null, purgedAt: now },
  });
  // Unpaid requests are cancelled; paid ones keep their status for the business's accounts.
  await tx.paymentRequest.updateMany({ where: { OR: mine("customerPhone"), status: "PENDING" }, data: { status: "CANCELLED" } });
  const payments = await tx.paymentRequest.updateMany({
    where: { OR: mine("customerPhone") },
    // The link can carry the customer's name ({name} placeholder), so it goes too.
    data: { customerName: null, customerPhone: "deleted", url: "", contactId: null },
  });

  const keep = mode === "expired" ? contacts.filter((c) => c.whatsappOptOut).map((c) => c.id) : [];
  if (keep.length) await tx.contact.updateMany({ where: { id: { in: keep } }, data: { name: null, email: null } });
  const removed = await tx.contact.deleteMany({ where: { id: { in: ids.filter((id) => !keep.includes(id)) } } });

  return {
    bookings: bookings.count,
    leads: leads.count,
    conversations: conversations.count,
    calls: calls.count,
    payments: payments.count,
    contacts: removed.count,
    retellCallIds: callRows.map((c) => c.retellCallId),
  };
}

/**
 * Erase one person's data on request. Bookings are kept for the business's
 * records but anonymised; Retell's copies of their calls are deleted in the background.
 */
export async function erasePersonData(
  businessId: string,
  phone: string,
  userId: string | null,
  opts: { scheduleRetellCleanup?: ScheduleRetellCleanup; now?: Date } = {},
) {
  const t = tenantDb(businessId);
  const now = opts.now ?? new Date();
  const { retellCallIds, ...counts } = await t.$transaction((tx) => erasePhone(tx as unknown as PrivacyTx, phone, "request", now));
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { slug: true } });
  const job: RetellCleanup = { reason: "person_erased", businessSlug: business.slug, callIds: retellCallIds };
  if (hasRetellWork(job)) await (opts.scheduleRetellCleanup ?? queueRetellCleanup)(job);
  const result = { ...counts, retellCalls: retellCallIds.length };
  await audit({ businessId, userId, action: "privacy.erase", entityType: "Contact", details: result });
  return result;
}
