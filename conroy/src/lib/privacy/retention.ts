import { db } from "../db";
import { decryptOptional } from "../crypto";
import { logger } from "../logger";
import { tenantDb } from "../tenant";
import { audit } from "../audit";

/**
 * Data Protection Act 2020 support: automatic deletion after each business's
 * retention period, and export / erasure of one person's data on request.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Daily job: remove transcripts, recordings, summaries and chat text older than the retention period. */
export async function purgeExpiredData(now: Date = new Date()) {
  const businesses = await db.business.findMany({ select: { id: true, retentionDays: true } });
  let calls = 0;
  let messages = 0;
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
  }
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.webhookReceipt.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - 30 * DAY) } } });
  logger.info({ calls, messages }, "retention purge complete");
  return { calls, messages };
}

/** Everything held about one phone number, decrypted, for a subject access request. */
export async function exportPersonData(businessId: string, phone: string) {
  const t = tenantDb(businessId);
  const contact = await t.contact.findFirst({ where: { phone } });
  const [bookings, leads, conversations, calls, payments] = await Promise.all([
    t.booking.findMany({ where: { customerPhone: phone }, include: { service: { select: { name: true } } } }),
    t.lead.findMany({ where: { phone } }),
    t.conversation.findMany({ where: { externalId: phone }, include: { messages: { orderBy: { createdAt: "asc" } } } }),
    t.callLog.findMany({ where: { fromNumber: phone } }),
    t.paymentRequest.findMany({ where: { customerPhone: phone } }),
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
      c.messages.map((m) => ({ at: m.createdAt, direction: m.direction, from: m.sender, text: decryptOptional(m.bodyEnc) })),
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

/** Erase one person's data. Bookings are kept for the business's records but anonymised. */
export async function erasePersonData(businessId: string, phone: string, userId: string | null) {
  const t = tenantDb(businessId);
  const result = await t.$transaction(async (tx) => {
    const bookings = await tx.booking.updateMany({
      where: { customerPhone: phone },
      data: { customerName: "Deleted on request", customerPhone: null, notes: null, contactId: null },
    });
    const leads = await tx.lead.deleteMany({ where: { phone } });
    const conversations = await tx.conversation.deleteMany({ where: { externalId: phone } });
    const calls = await tx.callLog.updateMany({
      where: { fromNumber: phone },
      data: { fromNumber: null, transcriptEnc: null, summaryEnc: null, recordingUrlEnc: null, reason: null, contactId: null, purgedAt: new Date() },
    });
    const payments = await tx.paymentRequest.updateMany({
      where: { customerPhone: phone },
      data: { customerName: null, customerPhone: "deleted", status: "CANCELLED", contactId: null },
    });
    const contacts = await tx.contact.deleteMany({ where: { phone } });
    return { bookings: bookings.count, leads: leads.count, conversations: conversations.count, calls: calls.count, payments: payments.count, contacts: contacts.count };
  });
  await audit({ businessId, userId, action: "privacy.erase", entityType: "Contact", details: result });
  return result;
}
