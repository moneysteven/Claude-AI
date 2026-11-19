// Glow by Launthia: "paypal-webhook" Edge Function (Supabase, Deno) – PayPal's notifications, as a back-up to the
// client's return page (for example when a client approves on PayPal and closes the tab before coming back).
//
// For every notification:
//   1. PayPal is asked whether the notification is genuine (verify-webhook-signature with PAYPAL_WEBHOOK_ID);
//      anything else is refused.
//   2. It is recorded once by its id; one already handled is skipped.
//   3. Its content is never trusted on its own: the order, capture or refund is read again from PayPal, server
//      to server, and only that answer changes a booking (the same steps as the return page).
// Orders are matched to bookings by our own records (each PayPal order id is stored when the order is made) and
// by the booking id sent to PayPal as custom_id; anything that doesn't match is logged and left alone.
//
// Secrets: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV (see _shared/paypal.ts).
// Deploy: supabase functions deploy paypal-webhook --no-verify-jwt   (PayPal can't sign in; step 1 checks it)
// In PayPal's developer dashboard, add this function's address as the app's webhook and subscribe at least to
// PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.REFUNDED and PAYMENT.CAPTURE.DENIED /
// PAYMENT.CAPTURE.DECLINED (PayPal's specification uses both names), plus the checkout-order-approved event
// [confirm its exact name in PayPal's event list]. This function decides by what the notification is about (an
// order, a capture or a refund), not by its name, so a renamed event still works.

import { rpc } from "../_shared/db.ts";
import { getCapture, getOrder, getRefund, linkHref, paypalWebhookConfigured, verifyWebhook } from "../_shared/paypal.ts";
import { capturePayPal, captureIdOfRefund, orderIdOfCapture, settleCapture, settleOrder } from "../_shared/payments.ts";
import { emailsAfter } from "../_shared/emails.ts";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const isPayPalId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{3,64}$/.test(v);

class Retry extends Error {} // PayPal couldn't be read: answer with an error so PayPal sends the notification again

// deno-lint-ignore no-explicit-any
async function handleEvent(ev: any): Promise<{ note: string; booking: string | null }> {
  // deno-lint-ignore no-explicit-any
  const r: any = ev?.resource || {};
  const self = linkHref(r, "self");

  // an order (for example approved, but the client never came back to the site)
  if (Array.isArray(r.purchase_units) && isPayPalId(r.id)) {
    const pay = await rpc("find_payment", { p_method: "paypal", p_provider_ref: r.id });
    if (!pay) return { note: "order not from this site", booking: null };
    const g = await getOrder(r.id);
    if (!g.ok) throw new Retry();
    // PayPal's own copy of the order must name the same booking before anything is taken or changed
    if (g.body?.purchase_units?.[0]?.custom_id !== pay.booking_id) return { note: "order does not match its booking", booking: pay.booking_id };
    const out = String(g.body?.status) === "APPROVED" ? await capturePayPal(pay.booking_id, r.id) : await settleOrder(pay.booking_id, r.id, g.body);
    if (out.retry) throw new Retry();
    return { note: `order ${g.body?.status}: ${out.status}`, booking: pay.booking_id };
  }

  // a refund (or a reversal) of a captured payment
  if ((ev?.resource_type === "refund" || /\/v2\/payments\/refunds\//.test(self)) && isPayPalId(r.id)) {
    const g = await getRefund(r.id);
    if (!g.ok) throw new Retry();
    if (String(g.body?.status) !== "COMPLETED") return { note: `refund ${g.body?.status}: not counted yet`, booking: null };
    const captureId = captureIdOfRefund(g.body);
    const amount = Number(g.body?.amount?.value);
    if (!captureId || !(amount > 0)) return { note: "refund without a capture or amount", booking: null };
    const pay = await rpc("find_payment", { p_method: "paypal", p_txn_id: captureId });
    if (!pay) return { note: "refund of a payment not from this site", booking: null };
    const res = await rpc("record_gateway_refund", {
      p_method: "paypal", p_txn_id: captureId, p_refund_id: String(g.body.id), p_amount: amount,
      p_currency: String(g.body?.amount?.currency_code || ""), p_note: `PayPal ${String(ev?.event_type || "refund")}`.slice(0, 300),
    });
    return { note: `refund: ${res?.result}`, booking: pay.booking_id };
  }

  // a capture (completed, pending, declined …)
  if ((ev?.resource_type === "capture" || /\/v2\/payments\/captures\//.test(self)) && isPayPalId(r.id)) {
    const g = await getCapture(r.id);
    if (!g.ok) throw new Retry();
    const cap = g.body;
    const orderId = orderIdOfCapture(cap) || orderIdOfCapture(r);
    // deno-lint-ignore no-explicit-any
    let pay: any = await rpc("find_payment", { p_method: "paypal", p_txn_id: String(cap?.id || r.id) });
    if (!pay && orderId) pay = await rpc("find_payment", { p_method: "paypal", p_provider_ref: orderId });
    if (!pay) return { note: "capture of a payment not from this site", booking: null };
    if (orderId && orderId !== pay.provider_ref) return { note: "capture does not match the stored order", booking: pay.booking_id };
    const out = await settleCapture(pay.booking_id, pay.provider_ref, cap);
    if (out.retry) throw new Retry();
    return { note: `capture ${cap?.status}: ${out.status}`, booking: pay.booking_id };
  }

  return { note: "not used", booking: null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!paypalWebhookConfigured()) return reply(503, { error: "not set up" });
  const raw = await req.text();
  if (raw.length > 100_000) return reply(413, { error: "too large" });
  // deno-lint-ignore no-explicit-any
  let ev: any;
  try { ev = JSON.parse(raw); } catch (_) { return reply(400, { error: "not JSON" }); }
  const eventId = typeof ev?.id === "string" ? ev.id.slice(0, 200) : "";
  if (!eventId) return reply(400, { error: "no event id" });

  try {
    if (!(await verifyWebhook(req.headers, ev))) return reply(400, { error: "signature not verified" });
  } catch (_) {
    return reply(503, { error: "could not verify yet" }); // PayPal will send it again
  }

  try {
    const seen = await rpc<string>("record_payment_event", { p_method: "paypal", p_event_id: eventId, p_kind: String(ev?.event_type || "").slice(0, 100) });
    if (seen === "done") return reply(200, { ok: true, duplicate: true });
    const { note, booking } = await handleEvent(ev);
    await rpc("finish_payment_event", { p_method: "paypal", p_event_id: eventId, p_note: note, p_booking: booking });
    await emailsAfter(booking); // anything the payment step queued (sent once, whoever sends it first)
    return reply(200, { ok: true });
  } catch (e) {
    if (!(e instanceof Retry)) console.error("paypal-webhook", eventId, String((e as Error)?.message || e));
    return reply(500, { error: "not handled yet" }); // not marked handled: PayPal's next delivery handles it again
  }
});
