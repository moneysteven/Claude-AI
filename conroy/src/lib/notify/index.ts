import { decryptOptional } from "../crypto";
import { env } from "../env";
import { logger } from "../logger";
import { formatPhone } from "../phone";
import { formatDateTimeShort, formatDateTimeSpoken, localDateOf, todayLocal, addDays } from "../time";
import { tenantDb } from "../tenant";
import { sendCustomerWhatsApp, sendStaffTemplate } from "../whatsapp/outbound";

/** Customer notifications for booking changes (WhatsApp; text inside the 24h window, template outside). */
export async function notifyBooking(businessId: string, bookingId: string, kind: "confirmed" | "rescheduled" | "cancelled") {
  const t = tenantDb(businessId);
  const booking = await t.booking.findFirst({ where: { id: bookingId }, include: { service: true, staff: true } });
  if (!booking || !booking.customerPhone) return;
  const business = await t.business.findUniqueOrThrow({ where: { id: businessId } });
  const first = booking.customerName.split(" ")[0] || "there";
  const when = formatDateTimeSpoken(booking.startAt, business.timezone);
  const withStaff = booking.staff ? ` with ${booking.staff.name}` : "";

  if (kind === "confirmed") {
    const outcome = await sendCustomerWhatsApp({
      businessId,
      to: booking.customerPhone,
      sender: "SYSTEM",
      text: `Hi ${first}, your ${booking.service.name}${withStaff} at ${business.name} is confirmed for ${when} (Jamaica time). Booking ref: ${booking.reference}. Reply here if you need to reschedule or cancel.`,
      template: { name: "booking_confirmation", params: [first, booking.service.name, business.name, `${when}${withStaff}`, booking.reference] },
    });
    if (outcome.status === "SENT") await t.booking.update({ where: { id: booking.id }, data: { confirmationSentAt: new Date() } });
    return;
  }
  const details = kind === "rescheduled" ? `${booking.service.name}${withStaff} on ${when}` : `${booking.service.name} on ${when} is cancelled`;
  await sendCustomerWhatsApp({
    businessId,
    to: booking.customerPhone,
    sender: "SYSTEM",
    text:
      kind === "rescheduled"
        ? `Hi ${first}, your booking ${booking.reference} at ${business.name} has been moved to ${when}${withStaff} (Jamaica time). See you then!`
        : `Hi ${first}, your booking ${booking.reference} (${booking.service.name}, ${when}) at ${business.name} has been cancelled. Reply here any time to book again.`,
    template: { name: "booking_update", params: [first, booking.reference, business.name, kind, details] },
  });
}

/** 24-hour and 2-hour reminders. */
export async function sendReminder(businessId: string, bookingId: string, which: "24h" | "2h") {
  const t = tenantDb(businessId);
  const booking = await t.booking.findFirst({ where: { id: bookingId }, include: { service: true, staff: true } });
  if (!booking || booking.status !== "CONFIRMED" || !booking.customerPhone) return;
  if (which === "24h" && booking.reminder24SentAt) return;
  if (which === "2h" && booking.reminder2SentAt) return;
  const business = await t.business.findUniqueOrThrow({ where: { id: businessId } });
  const tz = business.timezone;
  const today = todayLocal(new Date(), tz);
  const day = localDateOf(booking.startAt, tz);
  const relative = day === today ? "today" : day === addDays(today, 1) ? "tomorrow" : "coming up";
  const when = formatDateTimeSpoken(booking.startAt, tz);
  const outcome = await sendCustomerWhatsApp({
    businessId,
    to: booking.customerPhone,
    sender: "SYSTEM",
    // Reminders are business-initiated: always the approved template.
    template: {
      name: "appointment_reminder",
      params: [business.name, `${booking.service.name}${booking.staff ? ` with ${booking.staff.name}` : ""}`, relative, when, booking.reference],
    },
  });
  // Mark as handled even when suppressed (opted out) so we don't retry forever.
  if (outcome.status === "SENT" || outcome.status === "SUPPRESSED") {
    await t.booking.update({
      where: { id: booking.id },
      data: which === "24h" ? { reminder24SentAt: new Date() } : { reminder2SentAt: new Date() },
    });
  }
}

export interface StaffAlert {
  title: string; // "Customer wants a person"
  summary: string;
  customer: string;
  link: string;
}

/** WhatsApp alert to the owner (and the handoff number when it is a different person). */
export async function alertStaff(businessId: string, alert: StaffAlert) {
  const business = await tenantDb(businessId).business.findUniqueOrThrow({ where: { id: businessId } });
  const recipients = [...new Set([business.ownerWhatsapp, business.handoffNumber].filter((x): x is string => Boolean(x)))];
  if (recipients.length === 0) {
    logger.warn({ businessId }, "staff alert skipped: no owner WhatsApp number configured");
    return;
  }
  for (const to of recipients) {
    await sendStaffTemplate(businessId, to, "staff_alert", [alert.title, business.name, alert.summary, alert.customer, alert.link]);
  }
}

const OUTCOME_LABEL: Record<string, string> = {
  BOOKED: "Booked",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  LEAD_CAPTURED: "Message / lead taken",
  INFO_GIVEN: "Answered questions",
  TRANSFERRED: "Transferred to staff",
  MESSAGE_TAKEN: "Message taken",
  ABANDONED: "Caller hung up",
  OTHER: "Other",
};

/** After every call: WhatsApp summary to the owner with a link to the transcript. */
export async function sendOwnerCallSummary(businessId: string, callLogId: string) {
  const t = tenantDb(businessId);
  const call = await t.callLog.findFirst({ where: { id: callLogId } });
  if (!call || call.ownerNotifiedAt) return;
  const business = await t.business.findUniqueOrThrow({ where: { id: businessId } });
  if (!business.ownerWhatsapp) {
    await t.callLog.update({ where: { id: call.id }, data: { ownerNotifiedAt: new Date() } });
    return;
  }
  const contact = call.contactId ? await t.contact.findFirst({ where: { id: call.contactId } }) : null;
  const booking = call.bookingId ? await t.booking.findFirst({ where: { id: call.bookingId }, include: { service: true } }) : null;
  const caller = [contact?.name, call.fromNumber ? formatPhone(call.fromNumber) : "hidden number"].filter(Boolean).join(" ");
  const summary = decryptOptional(call.summaryEnc);
  const reason = call.reason ?? summary?.split(/(?<=\.)\s/)[0] ?? "Not captured";
  const bookingText = booking
    ? `${booking.service.name}, ${formatDateTimeShort(booking.startAt, business.timezone)}, ref ${booking.reference}`
    : "None";
  const outcome = `${OUTCOME_LABEL[call.outcome ?? "OTHER"]}${call.afterHours ? " (after hours)" : ""}`;
  const res = await sendStaffTemplate(businessId, business.ownerWhatsapp, "owner_call_summary", [
    business.name,
    caller,
    reason,
    outcome,
    bookingText,
    `${env.APP_URL}/dashboard/calls/${call.id}`,
  ]);
  if (res.status === "SENT") await t.callLog.update({ where: { id: call.id }, data: { ownerNotifiedAt: new Date() } });
}
