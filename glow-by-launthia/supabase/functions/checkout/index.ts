// Glow by Launthia: "checkout" Edge Function (Supabase, Deno) – the one address the website uses to book and pay.
//
//   options        services, opening rules and the ways to pay that are really set up: bank transfer (her bank
//                  accounts saved) and PayPal.Me (her PayPal.Me name and US-dollar rate saved). Nothing else.
//   days / slots   free days in a range / free start times on a day (Jamaica time)
//   hold           hold a time for the client while they pay (15 minutes by default)
//   release        the client changed their mind: free the time at once
//   status         a booking's status, for the confirmation page (by its private id; no personal details)
//   pay            start paying the deposit: bank transfer (the exact amount + Launthia's bank accounts, given only
//                  to the client holding the time) or PayPal.Me (her PayPal.Me name and the exact US-dollar amount)
//   manual_submit  the client says they have paid: by bank transfer (and to which of her accounts) or on PayPal.
//                  "Pending payment" until Launthia checks her account or her PayPal (never confirmed
//                  automatically); she is emailed to check, and confirms it in her dashboard.
// There is no "pay in person" booking: every booking pays its deposit online first.
//
// Later option (not used by the website): PayPal's JavaScript SDK buttons with a server-made, server-captured order
// (pay without PayPal.Me, paypal_return, paypal_cancel, and the paypal-webhook function) can lock the amount and
// confirm a payment by themselves. They need PayPal REST app keys (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).
//
// Each visitor is limited to a few tries every 10 minutes (counted under a one-way code, never their address).
// Amounts always come from the database, never from the browser. Nothing here ever stores card details.
//
// Secrets (Supabase > Edge Functions > Secrets; never in the website): SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase inside Edge Functions. (SITE_URL and the PAYPAL_* keys are only for the later option above.)
// Deploy: supabase functions deploy checkout --no-verify-jwt   (it is public; it does its own checks)

import { DbError, rpc, SB_URL, SERVICE_KEY } from "../_shared/db.ts";
import { createOrder, getOrder, PAYPAL_LIVE, paypalConfigured, payerActionUrl } from "../_shared/paypal.ts";
import { capturePayPal, settleOrder } from "../_shared/payments.ts";
import { emailsAfter } from "../_shared/emails.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const SITE_URL = (() => {
  try {
    const u = new URL(env("SITE_URL"));
    return u.protocol === "https:" ? u.origin : "";
  } catch (_) { return ""; }
})();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const oops = () => reply(500, { error: "Something went wrong. Please try again." });

// ---- input checks ---------------------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isPayPalId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{3,64}$/.test(v);
// ways to pay that the client sends themselves and Launthia checks by hand
const MANUAL = ["bank", "zelle", "cashapp"];

// ---- per-visitor limits ----------------------------------------------------------------------------------
const LIMITS: Record<string, [number, number]> = { // [tries, seconds]
  all: [120, 600], hold: [8, 600], pay: [12, 600], paypal_return: [20, 600], paypal_cancel: [20, 600], zelle_submit: [5, 600], manual_submit: [5, 600],
};
async function visitorCode(req: Request): Promise<string | null> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
  if (!ip) return null; // no address given to us: the database's own limits still apply
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("glow-visitor:" + SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function allowed(visitor: string | null, action: string): Promise<boolean> {
  if (!visitor) return true;
  const [n, w] = LIMITS.all;
  if (!(await rpc<boolean>("glow_rate_hit", { p_bucket: `all:${visitor}`, p_max: n, p_window_seconds: w }))) return false;
  const lim = LIMITS[action];
  if (lim && !(await rpc<boolean>("glow_rate_hit", { p_bucket: `${action}:${visitor}`, p_max: lim[0], p_window_seconds: lim[1] }))) return false;
  return true;
}

// ---- helpers ------------------------------------------------------------------------------------------------
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { timeZone: "America/Jamaica", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const PREPARE_MSG: Record<string, [number, string]> = {
  "hold expired": [409, "Your time is no longer held. Please pick it again."],
  "payment method not available": [409, "That way to pay isn't available right now. Please choose another."],
  "no amount": [409, "This service can't be paid online yet. Please contact Launthia."],
};
function paypalReady(): boolean {
  return paypalConfigured() && SITE_URL !== "";
}
// the PayPal payment of a booking: the one named (it must belong to this booking) or the latest one
async function paypalPaymentOf(bookingId: string, orderId: unknown) {
  // deno-lint-ignore no-explicit-any
  const p: any = isPayPalId(orderId)
    ? await rpc("find_payment", { p_method: "paypal", p_provider_ref: orderId })
    : await rpc("find_payment", { p_method: "paypal", p_booking: bookingId });
  return p && p.booking_id === bookingId ? p : null;
}

// ---- actions --------------------------------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function handle(action: string, b: any): Promise<Response> {
  switch (action) {
    case "options": {
      const o = await rpc("get_booking_options", {});
      if (!o) return oops();
      // only the ways to pay that are set up: bank transfer and PayPal.Me (the database lists nothing else). The bank
      // details are never in the options; her PayPal.Me name is (it is in the link the client taps anyway).
      const PAYPALME = /^[A-Za-z0-9]{1,20}$/;
      // deno-lint-ignore no-explicit-any
      const methods = (o.payment_methods || []).flatMap((m: any) => {
        if (m.method === "bank" && m.ready === true) {
          return [{ method: "bank", label: m.label, available: true, status: "manual", note: "Confirmed by Launthia once the money arrives.", currency: "JMD" }];
        }
        if (m.method === "paypal" && m.ready === true && PAYPALME.test(String(m.paypalme || "")) && Number(m.jmd_per_usd) > 0) {
          return [{ method: "paypal", label: m.label, available: true, status: "paypalme", paypalme: m.paypalme, note: "Confirmed by Launthia once the money arrives.",
                    currency: "USD", jmd_per_usd: m.jmd_per_usd }];
        }
        return [];
      });
      return reply(200, { timezone: o.timezone, max_days_ahead: o.max_days_ahead, min_notice_minutes: o.min_notice_minutes, hold_minutes: o.hold_minutes,
                          // online booking on or paused, and her note for clients (both from her dashboard)
                          accepting: o.accepting !== false, message: o.message ?? null,
                          // the deposit paid online to book, and the professional-photos add-on (JMD)
                          deposit_jmd: o.deposit_jmd ?? null, photos_addon_jmd: o.photos_addon_jmd ?? null,
                          hours: o.hours, services: o.services, payment_methods: methods });
    }
    case "days": {
      if (!isUuid(b.service_id) || !isDay(b.from) || !isDay(b.to) || b.to < b.from) return reply(400, { error: "Please choose a service and dates." });
      return reply(200, { days: await rpc("get_available_days", { p_service: b.service_id, p_from: b.from, p_to: b.to }) });
    }
    case "slots": {
      if (!isUuid(b.service_id) || !isDay(b.day)) return reply(400, { error: "Please choose a service and a day." });
      return reply(200, { slots: await rpc("get_available_slots", { p_service: b.service_id, p_day: b.day }) });
    }
    case "hold": {
      if (text(b.company, 200) !== "") return reply(400, { error: "Please try again." }); // hidden field only robots fill
      const start = typeof b.start === "string" ? new Date(b.start) : null;
      if (!isUuid(b.service_id) || !start || isNaN(start.getTime())) return reply(400, { error: "Please pick a service and a time." });
      const h = await rpc("create_booking_hold", {
        p_service: b.service_id, p_start: start.toISOString(), p_name: text(b.name, 80), p_email: text(b.email, 120),
        p_phone: text(b.phone, 25), p_agree_terms: b.agree_terms === true,
        // professional photos add-on: only a yes/no comes from the website; its price, the deposit and the balance
        // are worked out by the database
        p_photos: b.photos === true,
      });
      return reply(200, h);
    }
    case "release": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      return reply(200, await rpc("cancel_booking_hold", { p_booking: b.booking_id }));
    }
    case "status": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      const s = await rpc("get_booking_status", { p_booking: b.booking_id });
      return s ? reply(200, s) : reply(404, { error: "We couldn't find this booking." });
    }
    case "pay": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      const method = String(b.method || "");
      // card payments start only once the NCB / FAC adapter (_shared/fac.ts) is finished from their documentation
      if (method === "card") return reply(503, { error: "Card payments are being set up. Please choose another way to pay.", awaiting_integration: true });
      if (method !== "paypal" && !MANUAL.includes(method)) return reply(400, { error: "Please choose a way to pay." });
      const p = await rpc("prepare_payment", { p_booking: b.booking_id, p_method: method });
      if (!p?.ok) {
        const [code, msg] = PREPARE_MSG[p?.reason] || [409, "This booking can't be paid right now."];
        return reply(code, { error: msg });
      }
      // PayPal.Me: her PayPal.Me name and the exact US-dollar deposit (the site builds the paypal.me link from them)
      if (method === "paypal" && typeof p.paypalme === "string" && /^[A-Za-z0-9]{1,20}$/.test(p.paypalme)) {
        return reply(200, { method, mode: "paypalme", paypalme: p.paypalme, amount: p.amount, currency: p.currency, amount_jmd: p.amount_jmd,
                            jmd_per_usd: p.jmd_per_usd, hold_expires_at: p.hold_expires_at });
      }
      if (method === "paypal" && !paypalReady()) return reply(409, { error: "PayPal isn't available right now. Please choose another way to pay." });
      if (MANUAL.includes(method)) {
        // bank transfer: always the deposit in JMD (amount_jmd, e.g. 3000) – never the PayPal US-dollar amount
        const bank = method === "bank";
        return reply(200, { method, amount: bank ? Number(p.amount_jmd) : p.amount, currency: bank ? "JMD" : p.currency, amount_jmd: p.amount_jmd,
                            instructions: p.instructions ?? null, accounts: bank ? (p.accounts ?? []) : undefined, hold_expires_at: p.hold_expires_at });
      }
      let order;
      try {
        order = await createOrder({
          bookingId: b.booking_id, amount: Number(p.amount), currency: String(p.currency),
          description: `${p.service} – ${whenLabel(p.starts_at)} (Jamaica time)`,
          returnUrl: `${SITE_URL}/?glow_pay=paypal&booking=${b.booking_id}`,
          cancelUrl: `${SITE_URL}/?glow_pay=paypal_cancel&booking=${b.booking_id}`,
          popup: b.popup === true, funding: typeof b.funding === "string" ? b.funding.slice(0, 20) : "paypal",
        });
      } catch (_) { order = null; }
      const url = order?.ok ? payerActionUrl(order.body) : null;
      const orderId = order?.ok ? order.body?.id : null;
      // the checkout window on the site needs only the order id; the full-page route needs PayPal's page address
      if ((b.popup !== true && !url) || !isPayPalId(orderId)) return reply(502, { error: "PayPal isn't answering right now. Please try again in a moment." });
      const rec = await rpc("record_payment_started", {
        p_booking: b.booking_id, p_method: "paypal", p_provider_ref: orderId, p_amount: Number(p.amount), p_currency: String(p.currency), p_is_test: !PAYPAL_LIVE,
      });
      if (!rec?.ok) return oops();
      return reply(200, { method: "paypal", redirect_url: url || null, order_id: orderId, amount: p.amount, currency: p.currency, amount_jmd: p.amount_jmd,
                          test_mode: !PAYPAL_LIVE, hold_expires_at: p.hold_expires_at });
    }
    case "paypal_return": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      if (!paypalConfigured()) return reply(503, { error: "PayPal is being set up." });
      const pay = await paypalPaymentOf(b.booking_id, b.order_id);
      if (!pay) return reply(404, { error: "We couldn't find this payment." });
      const out = await capturePayPal(b.booking_id, pay.provider_ref);
      await emailsAfter(b.booking_id); // the confirmation, receipt and alert queued by the payment step (if any)
      return reply(200, { ...out, test_mode: !!pay.is_test });
    }
    case "paypal_cancel": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      if (!paypalConfigured()) return reply(503, { error: "PayPal is being set up." });
      const pay = await paypalPaymentOf(b.booking_id, b.order_id);
      if (!pay) return reply(404, { error: "We couldn't find this payment." });
      let g;
      try { g = await getOrder(pay.provider_ref); } catch (_) { g = null; }
      if (!g?.ok) return reply(200, { status: "error", message: "We couldn't reach PayPal just now. Please check again in a minute.", retry: true });
      const st = String(g.body?.status || "");
      if (st === "APPROVED" || st === "COMPLETED") {
        const out = st === "APPROVED" ? await capturePayPal(b.booking_id, pay.provider_ref) : await settleOrder(b.booking_id, pay.provider_ref, g.body);
        await emailsAfter(b.booking_id);
        return reply(200, { ...out, test_mode: !!pay.is_test });
      }
      await rpc("fail_booking_payment", {
        p_booking: b.booking_id, p_method: "paypal", p_provider_ref: pay.provider_ref, p_status: "cancelled", p_reason: "the client left PayPal", p_release: false,
      });
      const s = await rpc("get_booking_status", { p_booking: b.booking_id });
      return reply(200, { status: "cancelled", message: "You left PayPal before paying, so you have not been charged.", hold_expires_at: s?.hold_expires_at ?? null, test_mode: !!pay.is_test });
    }
    case "zelle_submit":
    case "manual_submit": {
      if (!isUuid(b.booking_id)) return reply(400, { error: "Unknown booking." });
      const method = action === "zelle_submit" ? "zelle" : String(b.method || "");
      if (!MANUAL.includes(method) && method !== "paypal") return reply(400, { error: "Please choose a way to pay." });
      // an optional receipt (photo or PDF): checked BEFORE anything is saved, so a wrong file can simply be swapped
      const receipt = b.receipt == null ? null : checkReceipt(b.receipt);
      if (receipt && "error" in receipt) return reply(400, { error: receipt.error });
      const r = await rpc("submit_manual_payment", {
        p_booking: b.booking_id, p_method: method, p_reference: text(b.reference ?? b.zelle_reference, 60), p_sender_name: text(b.sender_name, 80),
        p_sent_to: method === "bank" ? text(b.sent_to, 2) : null,
        // the client's own account, for a refund if Launthia ever has to cancel (bank transfer only)
        p_refund: method === "bank" && b.refund && typeof b.refund === "object" && !Array.isArray(b.refund)
          ? { bank: text(b.refund.bank, 60), account_number: text(b.refund.account_number, 24), branch: text(b.refund.branch, 60), account_type: text(b.refund.account_type, 10) }
          : null,
      });
      let receiptSaved = false;
      if (receipt && isUuid(r?.payment_id)) receiptSaved = await storeReceipt(b.booking_id, String(r.payment_id), receipt);
      await emailsAfter(b.booking_id); // Launthia is emailed to check her account
      return reply(200, { ...r, receipt: receipt ? (receiptSaved ? "saved" : "not saved") : "none",
                          message: "Thank you! Launthia will confirm your booking as soon as she sees your payment. Your time is kept until then." });
    }
  }
  return reply(400, { error: "Unknown request." });
}

// ---- payment receipts: JPG, PNG, WebP or PDF, at most 5 MB, recognised by the file's own first bytes (not its name) ----
const RECEIPT_MAX = 5 * 1024 * 1024;
const RECEIPT_BODY_MAX = Math.ceil(RECEIPT_MAX * 4 / 3) + 20_000; // the receipt as base64, plus the other fields
type Receipt = { bytes: Uint8Array; ext: "jpg" | "png" | "webp" | "pdf"; mime: string };
// deno-lint-ignore no-explicit-any
function checkReceipt(x: any): Receipt | { error: string } {
  const bad = { error: "Please add the receipt as a photo (JPG, PNG or WebP) or a PDF, no bigger than 5 MB." };
  if (!x || typeof x !== "object" || typeof x.data !== "string" || x.data.length > Math.ceil(RECEIPT_MAX * 4 / 3) + 8) return bad;
  let bytes: Uint8Array;
  try { const bin = atob(x.data); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); } catch (_) { return bad; }
  if (bytes.length < 16 || bytes.length > RECEIPT_MAX) return bad;
  const at = (i: number, s: number[]) => s.every((v, k) => bytes[i + k] === v);
  if (at(0, [0xff, 0xd8, 0xff])) return { bytes, ext: "jpg", mime: "image/jpeg" };
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { bytes, ext: "png", mime: "image/png" };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { bytes, ext: "webp", mime: "image/webp" };
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { bytes, ext: "pdf", mime: "application/pdf" };
  return bad;
}
// into the PRIVATE bucket "payment-receipts" (only Launthia can open it), named by booking and payment – never by the client
async function storeReceipt(bookingId: string, paymentId: string, rc: Receipt): Promise<boolean> {
  const path = `${bookingId}/${paymentId}.${rc.ext}`;
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/payment-receipts/${path}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": rc.mime, "x-upsert": "false" },
      body: rc.bytes,
    });
    if (!res.ok) return false;
    return (await rpc<boolean>("attach_payment_receipt", { p_booking: bookingId, p_payment: paymentId, p_path: path })) === true;
  } catch (_) { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  // deno-lint-ignore no-explicit-any
  let b: any;
  try {
    // small requests only – except the payment details, which may carry a receipt (at most 5 MB, sent as base64)
    const len = Number(req.headers.get("content-length") || "0");
    if (len > RECEIPT_BODY_MAX) return reply(413, { error: "Too much data." });
    const raw = await req.text();
    if (raw.length > RECEIPT_BODY_MAX) return reply(413, { error: "Too much data." });
    b = JSON.parse(raw);
    if (raw.length > 10_000 && b?.action !== "manual_submit") return reply(413, { error: "Too much data." });
  } catch (_) { return reply(400, { error: "Please try again." }); }
  const action = typeof b?.action === "string" ? b.action : "";
  if (!/^[a-z_]{3,20}$/.test(action)) return reply(400, { error: "Unknown request." });
  try {
    if (!(await allowed(await visitorCode(req), action))) {
      return reply(429, { error: "Too many tries. Please wait a few minutes and try again." });
    }
    return await handle(action, b);
  } catch (e) {
    if (e instanceof DbError && e.userMessage) return reply(409, { error: e.userMessage });
    console.error("checkout", action, e instanceof DbError ? `${e.status} ${e.code}` : String((e as Error)?.message || e));
    return oops();
  }
});
