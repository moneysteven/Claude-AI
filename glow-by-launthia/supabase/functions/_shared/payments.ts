// Glow by Launthia – what happens after a client approves a PayPal payment. Used by "checkout" (the client
// came back from PayPal) and "paypal-webhook" (PayPal told us), so both always act the same way.
//
// Rules: the money is only taken while the client still holds the time (checked by lock_for_capture); a booking
// is only confirmed from what PayPal itself reports, read server to server; every step is safe to repeat.

import { rpc } from "./db.ts";
import { captureOrder, getOrder, linkHref } from "./paypal.ts";

export type Outcome = {
  status: "confirmed" | "pending" | "not_charged" | "declined" | "not_approved" | "needs_attention" | "already_paid" | "error";
  message: string;
  reference?: string | null;
  retry?: boolean; // true: nothing changed, PayPal could not be read right now – try again shortly
};

const MSG = {
  confirmed: "Payment received – your booking is confirmed.",
  duplicate: "Payment received – your booking is confirmed. We noticed a second payment for the same booking; Launthia will refund it.",
  pending: "PayPal is still processing your payment. Your time is kept for you, and your booking will be confirmed as soon as PayPal completes it.",
  conflict: "Your payment went through, but the time was taken while you were paying. Launthia will contact you to choose a new time or refund you.",
  check: "Your payment needs a quick check by Launthia. She will contact you.",
  declined: "PayPal could not complete this payment, and you have not been charged. Please pick your time again and try another way to pay.",
  notApproved: "Your PayPal payment was not finished, so you have not been charged.",
  taken: "Sorry – that time was taken while you were paying. You have not been charged. Please pick another time.",
  closed: "This booking can no longer be paid. You have not been charged.",
  alreadyPaid: "This booking is already paid.",
  later: "We couldn't confirm your PayPal payment yet. Please don't pay again – check this page again in a minute.",
  unknown: "We couldn't find this payment.",
};

async function referenceOf(bookingId: string): Promise<string | null> {
  try {
    const s = await rpc("get_booking_status", { p_booking: bookingId });
    return s?.reference ?? null;
  } catch (_) { return null; }
}

// a PayPal capture (read from PayPal) → the booking
// deno-lint-ignore no-explicit-any
export async function settleCapture(bookingId: string, orderId: string, cap: any): Promise<Outcome> {
  const status = String(cap?.status || "");
  const amount = Number(cap?.amount?.value);
  const currency = String(cap?.amount?.currency_code || "");
  const txn = typeof cap?.id === "string" ? cap.id : null;
  if (cap?.custom_id && cap.custom_id !== bookingId) return { status: "error", message: MSG.unknown };

  if (status === "COMPLETED" || status === "PARTIALLY_REFUNDED" || status === "REFUNDED") {
    // the money was taken (refunds, if any, are recorded from PayPal's refund notifications)
    const r = await rpc("confirm_booking_payment", {
      p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId, p_amount: amount, p_currency: currency,
      p_provider_status: status, p_verified_by: "gateway", p_txn_id: txn,
    });
    switch (r?.result) {
      case "confirmed": return { status: "confirmed", message: MSG.confirmed, reference: r.reference ?? null };
      case "already": return { status: "confirmed", message: MSG.confirmed, reference: r.reference ?? (await referenceOf(bookingId)) };
      case "duplicate_payment": return { status: "confirmed", message: MSG.duplicate, reference: r.reference ?? null };
      case "conflict": return { status: "needs_attention", message: MSG.conflict };
      case "amount_mismatch": return { status: "needs_attention", message: MSG.check };
      default: return { status: "error", message: MSG.unknown };
    }
  }
  if (status === "PENDING") {
    const reason = String(cap?.status_details?.reason || "");
    const r = await rpc("mark_payment_pending", {
      p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId,
      p_provider_status: reason ? `PENDING ${reason}` : "PENDING", p_txn_id: txn,
    });
    if (r?.result === "already") return { status: "confirmed", message: MSG.confirmed, reference: await referenceOf(bookingId) };
    if (r?.result === "conflict") return { status: "needs_attention", message: MSG.conflict };
    if (r?.result === "unknown_payment" || r?.result === "not_found") return { status: "error", message: MSG.unknown };
    return { status: "pending", message: MSG.pending };
  }
  if (status === "DECLINED" || status === "FAILED") {
    await rpc("fail_booking_payment", {
      p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId, p_status: "failed", p_reason: `PayPal capture ${status}`,
    });
    return { status: "declined", message: MSG.declined };
  }
  return { status: "error", message: MSG.later, retry: true };
}

// a PayPal order (read from PayPal) → the booking
// deno-lint-ignore no-explicit-any
export async function settleOrder(bookingId: string, orderId: string, order: any, captureFailed = false, issues: string[] = []): Promise<Outcome> {
  if (!order || String(order.id || "") !== orderId) return { status: "error", message: MSG.later, retry: true };
  const pu = Array.isArray(order.purchase_units) ? order.purchase_units[0] : null;
  if (!pu || pu.custom_id !== bookingId) return { status: "error", message: MSG.unknown }; // not this booking's order: never act on it
  const caps = Array.isArray(pu.payments?.captures) ? pu.payments.captures : [];
  // deno-lint-ignore no-explicit-any
  const cap = caps.find((c: any) => c?.status === "COMPLETED") || caps.find((c: any) => c?.status === "PENDING") || caps[caps.length - 1];
  if (cap) return settleCapture(bookingId, orderId, cap);

  const status = String(order.status || "");
  if (status === "APPROVED" && captureFailed) {
    // PayPal refused to take the money (for example the buyer's funding was declined): nothing was charged
    await rpc("fail_booking_payment", {
      p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId, p_status: "failed",
      p_reason: `PayPal capture refused${issues.length ? ": " + issues.join(", ") : ""}`.slice(0, 500),
    });
    return { status: "declined", message: MSG.declined };
  }
  if (status === "VOIDED") {
    await rpc("fail_booking_payment", {
      p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId, p_status: "cancelled", p_reason: "PayPal order voided", p_release: false,
    });
    return { status: "not_charged", message: MSG.notApproved };
  }
  if (status === "CREATED" || status === "PAYER_ACTION_REQUIRED" || status === "SAVED") return { status: "not_approved", message: MSG.notApproved };
  return { status: "error", message: MSG.later, retry: true };
}

// the client approved on PayPal: read the order from PayPal, check the time is still theirs, take the money
// once, and confirm from PayPal's answer
export async function capturePayPal(bookingId: string, orderId: string): Promise<Outcome> {
  // 1. PayPal's own record of the order. Only an order the buyer has APPROVED is ever captured; one that is already
  //    COMPLETED (or not approved yet) is settled from this record without asking PayPal to take anything.
  // deno-lint-ignore no-explicit-any
  let before: any = null;
  try {
    const g = await getOrder(orderId);
    before = g.ok ? g.body : null;
  } catch (_) { before = null; }
  if (!before) return { status: "error", message: MSG.later, retry: true };
  if (String(before.status) !== "APPROVED") return settleOrder(bookingId, orderId, before);
  if (before.purchase_units?.[0]?.custom_id !== bookingId) return { status: "error", message: MSG.unknown };

  // 2. the time must still be the client's (or still free), and only one request may capture at a time
  const lock = await rpc("lock_for_capture", { p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId });
  if (!lock?.ok) {
    switch (lock?.result) {
      case "already_succeeded": return { status: "confirmed", message: MSG.confirmed, reference: lock.reference ?? (await referenceOf(bookingId)) };
      case "already_paid": return { status: "already_paid", message: MSG.alreadyPaid, reference: lock.reference ?? null };
      case "slot_taken": {
        await rpc("fail_booking_payment", {
          p_booking: bookingId, p_method: "paypal", p_provider_ref: orderId, p_status: "cancelled",
          p_reason: "the time was taken before the payment was taken; not charged", p_release: false,
        });
        return { status: "not_charged", message: MSG.taken };
      }
      case "in_progress": return { status: "error", message: MSG.later, retry: true }; // the other request finishes it
      case "unknown_payment":
      case "not_found": return { status: "error", message: MSG.unknown };
      default: return { status: "not_charged", message: MSG.closed };
    }
  }

  // 3. take the money (the same PayPal-Request-Id for this order, so a repeat can never take it twice)
  try {
    let res;
    try { res = await captureOrder(orderId); } catch (_) { res = null; }
    // only 422 (UNPROCESSABLE_ENTITY: PayPal refused the capture) counts as a refusal. Anything else – no answer, a
    // 5xx, an expired sign-in – means we don't know yet: read the order rather than guess
    const captureFailed = !!res && res.status === 422;
    // deno-lint-ignore no-explicit-any
    let order: any = res?.ok && Array.isArray(res.body?.purchase_units) ? res.body : null;
    if (!order) {
      try {
        const g = await getOrder(orderId);
        order = g.ok ? g.body : null;
      } catch (_) { order = null; }
    }
    if (!order) return { status: "error", message: MSG.later, retry: true };
    if (!captureFailed && String(order.status) === "APPROVED") {
      // the capture didn't answer and the money has not been taken: leave everything as it is, try again later
      return { status: "error", message: MSG.later, retry: true };
    }
    return await settleOrder(bookingId, orderId, order, captureFailed, res?.issues || []);
  } finally {
    // 4. the attempt is over (whatever happened): the next request may go ahead
    await rpc("release_capture_claim", { p_method: "paypal", p_provider_ref: orderId }).catch(() => {});
  }
}

// the PayPal order id from a capture: supplementary_data.related_ids.order_id, or its "up" link to the order
// deno-lint-ignore no-explicit-any
export function orderIdOfCapture(cap: any): string | null {
  const rel = cap?.supplementary_data?.related_ids?.order_id;
  if (typeof rel === "string" && rel) return rel;
  const m = linkHref(cap, "up").match(/\/v2\/checkout\/orders\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
// the PayPal capture id from a refund: its "up" link to the capture
// deno-lint-ignore no-explicit-any
export function captureIdOfRefund(refund: any): string | null {
  const m = linkHref(refund, "up").match(/\/v2\/payments\/captures\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
