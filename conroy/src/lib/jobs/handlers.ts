import { z } from "zod";
import { db } from "../db";
import { logger } from "../logger";
import { alertStaff, notifyBooking, sendOwnerCallSummary, sendReminder } from "../notify";
import { sendAdminAlert } from "../notify/email";
import { dueFollowUpStep, sendPaymentMessage } from "../payments/service";
import { handleInboundWhatsApp } from "../whatsapp/inbound";
import { purgeExpiredData } from "../privacy/retention";
import { runUsageAlertScan } from "../billing";
import { JOB, type JobName } from "./queue";

/**
 * Job handlers. Every handler is idempotent: pg-boss retries failures, and
 * scans re-check state (sent-at timestamps) before sending anything.
 */

const bookingNotify = z.object({ businessId: z.string(), bookingId: z.string(), kind: z.enum(["confirmed", "rescheduled", "cancelled"]) });
const ownerSummary = z.object({ businessId: z.string(), callLogId: z.string() });
const staffAlert = z.object({ businessId: z.string(), title: z.string(), summary: z.string(), customer: z.string(), link: z.string() });
const paymentSend = z.object({ businessId: z.string(), paymentRequestId: z.string(), step: z.number().int().min(0) });
const adminAlert = z.object({ subject: z.string(), message: z.string(), businessId: z.string().optional() });
const inbound = z.object({
  businessId: z.string(),
  phoneNumberId: z.string().nullable(),
  from: z.string(),
  profileName: z.string().nullable(),
  providerMessageId: z.string(),
  timestamp: z.string(),
  text: z.string().nullable(),
  type: z.string(),
});

const HOUR = 60 * 60 * 1000;

/** Bookings that need a 24h or 2h reminder right now. */
export async function runReminderScan(now: Date = new Date()) {
  const due24 = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder24SentAt: null,
      customerPhone: { not: null },
      startAt: { gt: new Date(now.getTime() + 2 * HOUR), lte: new Date(now.getTime() + 24 * HOUR) },
      // Skip the 24h reminder for bookings made less than ~a day ahead (the confirmation covers it).
      createdAt: { lte: new Date(now.getTime() - 2 * HOUR) },
      business: { status: "ACTIVE" },
    },
    select: { id: true, businessId: true, startAt: true, createdAt: true },
    take: 500,
  });
  for (const b of due24) {
    if (b.startAt.getTime() - b.createdAt.getTime() < 20 * HOUR) continue;
    await sendReminder(b.businessId, b.id, "24h").catch((err) => logger.error({ err: err.message, bookingId: b.id }, "24h reminder failed"));
  }
  const due2 = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder2SentAt: null,
      customerPhone: { not: null },
      startAt: { gt: now, lte: new Date(now.getTime() + 2 * HOUR) },
      createdAt: { lte: new Date(now.getTime() - 30 * 60 * 1000) },
      business: { status: "ACTIVE" },
    },
    select: { id: true, businessId: true },
    take: 500,
  });
  for (const b of due2) {
    await sendReminder(b.businessId, b.id, "2h").catch((err) => logger.error({ err: err.message, bookingId: b.id }, "2h reminder failed"));
  }
  return { reminders24: due24.length, reminders2: due2.length };
}

/** Day 3 / day 7 payment follow-ups (stops as soon as staff mark it paid). */
export async function runPaymentFollowUpScan(now: Date = new Date()) {
  const pending = await db.paymentRequest.findMany({
    where: { status: "PENDING", followUpsSent: { lt: 3 }, business: { status: "ACTIVE" } },
    select: { id: true, businessId: true, createdAt: true, followUpsSent: true, status: true },
    take: 500,
  });
  let sent = 0;
  for (const p of pending) {
    const step = dueFollowUpStep(p, now);
    if (step === null) continue;
    await sendPaymentMessage(p.businessId, p.id, step)
      .then(() => sent++)
      .catch((err) => logger.error({ err: err.message, paymentRequestId: p.id }, "payment follow-up failed"));
  }
  return { sent };
}

export async function runJob(name: JobName, data: unknown): Promise<void> {
  switch (name) {
    case JOB.BOOKING_NOTIFY: {
      const d = bookingNotify.parse(data);
      return notifyBooking(d.businessId, d.bookingId, d.kind);
    }
    case JOB.OWNER_CALL_SUMMARY: {
      const d = ownerSummary.parse(data);
      return sendOwnerCallSummary(d.businessId, d.callLogId);
    }
    case JOB.STAFF_ALERT: {
      const d = staffAlert.parse(data);
      return alertStaff(d.businessId, d);
    }
    case JOB.PAYMENT_SEND: {
      const d = paymentSend.parse(data);
      await sendPaymentMessage(d.businessId, d.paymentRequestId, d.step);
      return;
    }
    case JOB.ADMIN_ALERT: {
      const d = adminAlert.parse(data);
      await sendAdminAlert(d.subject, d.message, { businessId: d.businessId });
      return;
    }
    case JOB.WHATSAPP_INBOUND: {
      const d = inbound.parse(data);
      return handleInboundWhatsApp({ ...d, timestamp: new Date(d.timestamp) });
    }
    case JOB.REMINDER_SCAN:
      await runReminderScan();
      return;
    case JOB.PAYMENT_FOLLOWUP_SCAN:
      await runPaymentFollowUpScan();
      return;
    case JOB.RETENTION_PURGE:
      await purgeExpiredData();
      return;
    case JOB.USAGE_ALERT_SCAN:
      await runUsageAlertScan();
      return;
  }
}
