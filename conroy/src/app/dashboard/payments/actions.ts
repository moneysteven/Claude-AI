"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/session";
import { parseForm, redirectWith } from "@/lib/forms";
import { parseJmdToCents } from "@/lib/money";
import { cancelPaymentRequest, createAndSendPaymentRequest, markPaymentPaid, sendPaymentMessage } from "@/lib/payments/service";
import { toE164 } from "@/lib/phone";

const BACK = "/dashboard/payments";

const createSchema = z.object({
  templateId: z.string().min(1),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().min(7).max(30),
  amount: z.string().min(1).max(20),
  description: z.string().max(200).optional(),
  bookingReference: z.string().max(20).optional(),
});

export async function createPaymentAction(formData: FormData) {
  const { user, business, t } = await requireTenant();
  const d = parseForm(createSchema, formData, BACK);
  const phone = toE164(d.customerPhone);
  if (!phone) redirectWith(BACK, "error", "That WhatsApp number doesn't look right");
  const amountCents = parseJmdToCents(d.amount);
  if (!amountCents) redirectWith(BACK, "error", "Enter the amount in J$, e.g. 5000");
  const booking = d.bookingReference ? await t.booking.findFirst({ where: { reference: d.bookingReference.toUpperCase() } }) : null;
  if (d.bookingReference && !booking) redirectWith(BACK, "error", "No booking with that reference");
  const { request, outcome } = await createAndSendPaymentRequest({
    businessId: business.id,
    templateId: d.templateId,
    customerPhone: phone,
    customerName: d.customerName || booking?.customerName || null,
    amountCents,
    description: d.description,
    bookingId: booking?.id ?? null,
    userId: user.id,
  });
  revalidatePath(BACK);
  if (outcome.status !== "SENT") {
    redirectWith(BACK, "error", `Saved ${request.reference}, but WhatsApp didn't send it (${outcome.reason ?? outcome.status}). Follow-ups will retry.`);
  }
  redirectWith(BACK, "ok", `Payment link ${request.reference} sent by WhatsApp`);
}

const idSchema = z.object({ paymentRequestId: z.string().min(1) });

export async function markPaidAction(formData: FormData) {
  const { user, business } = await requireTenant();
  const d = parseForm(idSchema, formData, BACK);
  await markPaymentPaid(business.id, d.paymentRequestId, user.id);
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Marked as paid - follow-ups stopped");
}

export async function cancelPaymentAction(formData: FormData) {
  const { user, business } = await requireTenant();
  const d = parseForm(idSchema, formData, BACK);
  await cancelPaymentRequest(business.id, d.paymentRequestId, user.id);
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Payment request cancelled");
}

export async function resendPaymentAction(formData: FormData) {
  const { business, t } = await requireTenant();
  const d = parseForm(idSchema, formData, BACK);
  const req = await t.paymentRequest.findFirst({ where: { id: d.paymentRequestId } });
  if (!req) redirectWith(BACK, "error", "Not found");
  const outcome = await sendPaymentMessage(business.id, req.id, Math.max(1, req.followUpsSent));
  revalidatePath(BACK);
  redirectWith(BACK, outcome.status === "SENT" ? "ok" : "error", outcome.status === "SENT" ? "Reminder sent" : `Not sent (${outcome.reason ?? outcome.status})`);
}
