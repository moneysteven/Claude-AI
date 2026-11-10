import type { PaymentKind, PaymentLinkTemplate } from "@prisma/client";
import { audit } from "../audit";
import { randomCode } from "../crypto";
import { formatJmd } from "../money";
import { tenantDb } from "../tenant";
import { upsertContact } from "../contacts";
import { sendCustomerWhatsApp } from "../whatsapp/outbound";

/**
 * Payment LINKS only (Fygaro / WiPay). Conroy never sees card data: it fills
 * the business's own link template and sends it by WhatsApp, then follows up
 * politely until staff mark the request paid.
 */

/** Follow-up schedule in days after the first send: day 0 (initial), day 3, day 7. */
export const FOLLOW_UP_DAYS = [0, 3, 7] as const;

const PLACEHOLDER_RE = /\{(amount|amount_cents|reference|name|currency|description)\}/g;

export function renderPaymentUrl(
  template: Pick<PaymentLinkTemplate, "urlTemplate">,
  values: { amountCents: number; reference: string; name?: string | null; currency?: string; description?: string | null },
): string {
  const map: Record<string, string> = {
    amount: (values.amountCents / 100).toFixed(2),
    amount_cents: String(values.amountCents),
    reference: values.reference,
    name: values.name ?? "",
    currency: values.currency ?? "JMD",
    description: values.description ?? "",
  };
  const url = template.urlTemplate.replace(PLACEHOLDER_RE, (_, key: string) => encodeURIComponent(map[key] ?? ""));
  const parsed = new URL(url); // throws for malformed templates
  if (parsed.protocol !== "https:") throw new Error("Payment links must use https");
  return parsed.toString();
}

export function validatePaymentTemplate(urlTemplate: string): string | null {
  try {
    renderPaymentUrl({ urlTemplate }, { amountCents: 100, reference: "TEST" });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export async function findTemplate(businessId: string, kind: PaymentKind) {
  const t = tenantDb(businessId);
  return (
    (await t.paymentLinkTemplate.findFirst({ where: { kind, active: true }, orderBy: { provider: "asc" } })) ??
    (kind === "INVOICE" ? null : t.paymentLinkTemplate.findFirst({ where: { kind: "FULL", active: true } }))
  );
}

export interface CreatePaymentParams {
  businessId: string;
  templateId: string;
  customerPhone: string;
  customerName?: string | null;
  amountCents: number;
  description?: string | null;
  bookingId?: string | null;
  userId?: string | null;
}

export async function createAndSendPaymentRequest(p: CreatePaymentParams) {
  if (!(p.amountCents > 0)) throw new Error("Amount must be greater than zero");
  const t = tenantDb(p.businessId);
  const template = await t.paymentLinkTemplate.findFirstOrThrow({ where: { id: p.templateId, active: true } });
  const contact = await upsertContact(p.businessId, p.customerPhone, p.customerName);
  let request = null;
  for (let attempt = 0; attempt < 5 && !request; attempt++) {
    const reference = `PAY-${randomCode(5)}`;
    try {
      request = await t.paymentRequest.create({
        data: {
          businessId: p.businessId,
          templateId: template.id,
          contactId: contact.id,
          bookingId: p.bookingId ?? null,
          customerName: p.customerName ?? contact.name,
          customerPhone: p.customerPhone,
          amountCents: p.amountCents,
          reference,
          url: renderPaymentUrl(template, {
            amountCents: p.amountCents,
            reference,
            name: p.customerName ?? contact.name,
            description: p.description,
          }),
          description: p.description?.slice(0, 200) ?? template.label,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  if (!request) throw new Error("Could not allocate a payment reference");
  await audit({ businessId: p.businessId, userId: p.userId, action: "payment.create", entityType: "PaymentRequest", entityId: request.id });
  const outcome = await sendPaymentMessage(p.businessId, request.id, 0);
  return { request, outcome };
}

/** Send the initial link (step 0) or a follow-up (step >= 1). */
export async function sendPaymentMessage(businessId: string, requestId: string, step: number) {
  const t = tenantDb(businessId);
  const req = await t.paymentRequest.findFirstOrThrow({ where: { id: requestId } });
  if (req.status !== "PENDING") return { status: "SUPPRESSED" as const, reason: "not_pending" };
  const business = await t.business.findUniqueOrThrow({ where: { id: businessId } });
  const name = req.customerName?.split(" ")[0] || "there";
  const amount = formatJmd(req.amountCents);
  const what = req.description ?? "your booking";
  const outcome =
    step === 0
      ? await sendCustomerWhatsApp({
          businessId,
          to: req.customerPhone,
          sender: "ASSISTANT",
          text: `Hi ${name}, here is your secure payment link from ${business.name} for ${what} (${amount}): ${req.url}\nReference: ${req.reference}. We never ask for card details by chat.`,
          template: { name: "payment_link", params: [name, business.name, what, amount, req.url, req.reference] },
        })
      : await sendCustomerWhatsApp({
          businessId,
          to: req.customerPhone,
          sender: "ASSISTANT",
          text: `Hi ${name}, a friendly reminder from ${business.name}: your payment of ${amount} for ${what} (ref ${req.reference}) is still open. Pay securely here: ${req.url}\nIf you've already paid, just reply and we'll check.`,
          template: { name: "payment_reminder", params: [name, business.name, amount, what, req.reference, req.url] },
        });
  if (outcome.status === "SENT") {
    await t.paymentRequest.update({ where: { id: req.id }, data: { followUpsSent: step + 1, lastSentAt: new Date() } });
  }
  return outcome;
}

/** Which follow-up step (if any) is due now for a pending request. */
export function dueFollowUpStep(req: { createdAt: Date; followUpsSent: number; status: string }, now: Date = new Date()): number | null {
  if (req.status !== "PENDING") return null;
  const next = req.followUpsSent; // 0 = initial not yet sent
  if (next >= FOLLOW_UP_DAYS.length) return null;
  const dueAt = req.createdAt.getTime() + FOLLOW_UP_DAYS[next] * 24 * 60 * 60 * 1000;
  return now.getTime() >= dueAt ? next : null;
}

export async function markPaymentPaid(businessId: string, requestId: string, userId: string | null) {
  const t = tenantDb(businessId);
  const updated = await t.paymentRequest.update({
    where: { id: requestId },
    data: { status: "PAID", paidAt: new Date(), markedPaidById: userId },
  });
  await audit({ businessId, userId, action: "payment.mark_paid", entityType: "PaymentRequest", entityId: requestId });
  return updated;
}

export async function cancelPaymentRequest(businessId: string, requestId: string, userId: string | null) {
  const t = tenantDb(businessId);
  const updated = await t.paymentRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  await audit({ businessId, userId, action: "payment.cancel", entityType: "PaymentRequest", entityId: requestId });
  return updated;
}
