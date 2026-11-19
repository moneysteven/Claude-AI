// Glow by Launthia – PayPal REST API (Checkout Orders v2), server side only.
//
// Every path, field and value used here was checked against PayPal's official OpenAPI specification
// (github.com/paypal/paypal-rest-api-specifications, commit 90e8041, April 2026). Nothing is guessed:
//   OAuth token          POST /v1/oauth2/token                          (client credentials: the spec's tokenUrl)
//   Create order         POST /v2/checkout/orders                       checkout_orders_v2.json  orders.create
//   Show order           GET  /v2/checkout/orders/{id}                  checkout_orders_v2.json  orders.get
//   Capture order        POST /v2/checkout/orders/{id}/capture          checkout_orders_v2.json  orders.capture
//   Show capture         GET  /v2/payments/captures/{capture_id}        payments_payment_v2.json captures.get
//   Show refund          GET  /v2/payments/refunds/{refund_id}          payments_payment_v2.json refunds.get
//   Verify webhook       POST /v1/notifications/verify-webhook-signature notifications_webhooks_v1.json
// Hosts (the specs' servers): https://api-m.sandbox.paypal.com (sandbox) and https://api-m.paypal.com (live).
// Order fields used: intent CAPTURE; purchase_units[].amount {currency_code, value}, custom_id (max 255),
// description; payment_source.paypal.experience_context {brand_name (max 127), shipping_preference NO_SHIPPING,
// user_action PAY_NOW, payment_method_preference IMMEDIATE_PAYMENT_REQUIRED, return_url, cancel_url}.
// The buyer is sent to the link with rel "payer-action". Order statuses: CREATED, SAVED, APPROVED, VOIDED,
// COMPLETED, PAYER_ACTION_REQUIRED. Capture statuses: COMPLETED, DECLINED, PARTIALLY_REFUNDED, PENDING, REFUNDED,
// FAILED. Refund statuses: CANCELLED, FAILED, PENDING, COMPLETED. Errors carry details[].issue.
// PayPal-Request-Id (max 108 characters) makes a repeated capture return the first result (kept 6 hours).
//
// Secrets (Supabase > Edge Functions > Secrets; never in the website):
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV ("live" for real money; anything else,
//   or nothing, means the sandbox: TEST MODE, no real money).

const env = (k: string) => Deno.env.get(k) ?? "";
const CLIENT_ID = env("PAYPAL_CLIENT_ID");
const CLIENT_SECRET = env("PAYPAL_CLIENT_SECRET");
const WEBHOOK_ID = env("PAYPAL_WEBHOOK_ID");
export const PAYPAL_LIVE = env("PAYPAL_ENV") === "live";
const BASE = PAYPAL_LIVE ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 15_000;

export function paypalConfigured(): boolean {
  return CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;
}
export function paypalWebhookConfigured(): boolean {
  return paypalConfigured() && WEBHOOK_ID.length > 0;
}

export class PayPalError extends Error {
  step: string;
  status: number;
  constructor(step: string, status: number) {
    super(`PayPal ${step} failed (${status})`);
    this.step = step;
    this.status = status;
  }
}

// deno-lint-ignore no-explicit-any
export type PPResult = { ok: boolean; status: number; body: any; issues: string[] };

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const res = await timedFetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("sign-in", res.status);
  const j = await res.json();
  if (!j?.access_token) throw new PayPalError("sign-in", 0);
  cached = { token: String(j.access_token), until: Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 300) * 1000 };
  return cached.token;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<PPResult> {
  const token = await accessToken();
  const res = await timedFetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) cached = null; // the token ran out early: the next call gets a new one
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
  // deno-lint-ignore no-explicit-any
  const issues = Array.isArray(json?.details) ? json.details.map((d: any) => String(d?.issue || "")).filter(Boolean) : [];
  return { ok: res.ok, status: res.status, body: json, issues };
}

const seg = (id: string) => encodeURIComponent(id);

export function createOrder(o: { bookingId: string; amount: number; currency: string; description: string; returnUrl: string; cancelUrl: string }) {
  return call("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{
      custom_id: o.bookingId,
      description: o.description.slice(0, 127),
      amount: { currency_code: o.currency, value: o.amount.toFixed(2) },
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Glow by Launthia",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
          return_url: o.returnUrl,
          cancel_url: o.cancelUrl,
        },
      },
    },
  }, { "PayPal-Request-Id": `glow-create-${o.bookingId}-${Date.now()}`, Prefer: "return=representation" });
}

// the same PayPal-Request-Id for the same order: a repeated capture can never take the money twice
export const captureOrder = (orderId: string) =>
  call("POST", `/v2/checkout/orders/${seg(orderId)}/capture`, {}, { "PayPal-Request-Id": `glow-capture-${orderId}`.slice(0, 108), Prefer: "return=representation" });
export const getOrder = (orderId: string) => call("GET", `/v2/checkout/orders/${seg(orderId)}`);
export const getCapture = (captureId: string) => call("GET", `/v2/payments/captures/${seg(captureId)}`);
export const getRefund = (refundId: string) => call("GET", `/v2/payments/refunds/${seg(refundId)}`);

// the page PayPal wants the buyer sent to (only ever a PayPal address, over https)
// deno-lint-ignore no-explicit-any
export function payerActionUrl(order: any): string | null {
  // deno-lint-ignore no-explicit-any
  const href = (Array.isArray(order?.links) ? order.links : []).find((l: any) => l?.rel === "payer-action")?.href;
  if (typeof href !== "string") return null;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && (u.hostname === "paypal.com" || u.hostname.endsWith(".paypal.com")) ? u.toString() : null;
  } catch (_) { return null; }
}

// deno-lint-ignore no-explicit-any
export function linkHref(obj: any, rel: string): string {
  // deno-lint-ignore no-explicit-any
  const l = (Array.isArray(obj?.links) ? obj.links : []).find((x: any) => x?.rel === rel);
  return typeof l?.href === "string" ? l.href : "";
}

// asks PayPal whether a notification really came from PayPal for this webhook. Throws when PayPal can't be
// reached (so the notification is answered with an error and PayPal sends it again later).
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (!paypalWebhookConfigured()) return false;
  const h = (n: string) => headers.get(n) || "";
  const body = {
    auth_algo: h("paypal-auth-algo"),
    cert_url: h("paypal-cert-url"),
    transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"),
    transmission_time: h("paypal-transmission-time"),
    webhook_id: WEBHOOK_ID,
    webhook_event: event,
  };
  if (!body.auth_algo || !body.cert_url || !body.transmission_id || !body.transmission_sig || !body.transmission_time) return false;
  const r = await call("POST", "/v1/notifications/verify-webhook-signature", body);
  if (r.status >= 500 || r.status === 429 || r.status === 401) throw new PayPalError("verify", r.status);
  return r.ok && r.body?.verification_status === "SUCCESS";
}
