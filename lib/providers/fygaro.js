// Fygaro payment provider adapter.
//
// IMPORTANT — read this before going live:
// Fygaro (https://fygaro.com) is a Jamaican payment platform (checkout
// links, invoicing, POS) that pays out to local JMD/USD bank accounts.
// The exact API request/response shapes below are written to the general
// shape of a hosted-checkout gateway (create a payment link server-side,
// receive a signed webhook on completion). Once you have a Fygaro merchant
// account, open their developer/API documentation from your dashboard and
// confirm:
//   1. The exact endpoint URL and request body for creating a payment link
//      or invoice (FYGARO_API_BASE_URL + the path used in createPaymentLink).
//   2. The exact webhook signature header name and algorithm they use
//      (verifyWebhook below assumes an HMAC-SHA256 signature header, which
//      is the common pattern — adjust the header name/algorithm to match
//      what Fygaro actually sends).
//   3. The field names in the webhook payload for order id, status, and
//      transaction reference (parseWebhookEvent below).
//
// Everything else in this app (cart, checkout page, receipts, admin) does
// not need to change no matter what you find — only this file does.

const crypto = require("crypto");

const API_BASE = process.env.FYGARO_API_BASE_URL;
const API_KEY = process.env.FYGARO_API_KEY;
const API_SECRET = process.env.FYGARO_API_SECRET;
const WEBHOOK_SECRET = process.env.FYGARO_WEBHOOK_SECRET;

async function createPaymentLink(order) {
  if (!API_BASE || !API_KEY) {
    throw new Error(
      "Fygaro is not configured yet. Set FYGARO_API_BASE_URL, FYGARO_API_KEY " +
        "and FYGARO_API_SECRET in your .env once your merchant account is " +
        "approved (see lib/providers/fygaro.js)."
    );
  }

  const response = await fetch(`${API_BASE}/payment-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      amount: order.total,
      currency: process.env.CURRENCY || "JMD",
      reference: order.id,
      description: `Order ${order.id} — ${process.env.SITE_NAME || "Steven Scale Solutions"}`,
      customer_email: order.customer.email,
      customer_name: order.customer.name,
      redirect_url: `${process.env.SITE_URL}/order/${order.id}/confirmation`,
      webhook_url: `${process.env.SITE_URL}/webhooks/fygaro`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Fygaro payment link request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  // Adjust this field name to whatever Fygaro's response actually calls
  // the hosted checkout URL (commonly "url", "checkout_url", or "link").
  return { url: data.url || data.checkout_url || data.link };
}

function verifyWebhook(rawBody, headers) {
  if (!WEBHOOK_SECRET) return false;
  // Adjust the header name to match Fygaro's actual signature header.
  const signature = headers["x-fygaro-signature"];
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseWebhookEvent(rawBody) {
  const payload = JSON.parse(rawBody);
  // Adjust these field names to match Fygaro's actual webhook payload.
  return {
    orderId: payload.reference || payload.order_id,
    status: payload.status === "completed" || payload.status === "paid" ? "paid" : "failed",
    providerReference: payload.transaction_id || payload.id,
  };
}

module.exports = { createPaymentLink, verifyWebhook, parseWebhookEvent };
