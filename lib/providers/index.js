// Every payment provider implements the same small interface:
//
//   createPaymentLink(order) -> { url }                (async)
//   verifyWebhook(rawBody, headers) -> boolean          (sync or async)
//   parseWebhookEvent(rawBody, headers) -> {
//       orderId, status: "paid" | "failed", providerReference,
//       amount?, currency?
//   }
//
// This keeps checkout.js and the webhook route provider-agnostic. Adding a
// second provider (WiPay, PayPal, a bank gateway) later means writing one
// new file here and adding it to PROVIDERS — no other code changes.

const testProvider = require("./test");
const fygaroProvider = require("./fygaro");

const PROVIDERS = { test: testProvider, fygaro: fygaroProvider };

// Fails closed: an unknown/misspelled PAYMENT_PROVIDER is an error, never a
// silent fallback to the test provider (which marks orders paid for free).
// In production the test provider must be explicitly allowed.
function getProviderName() {
  const raw = process.env.PAYMENT_PROVIDER;
  const name = (raw === undefined || raw === "" ? "test" : raw).trim().toLowerCase();
  if (!PROVIDERS[name]) {
    throw new Error(
      `Unknown PAYMENT_PROVIDER "${raw}". Use one of: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  if (
    name === "test" &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_TEST_PAYMENTS !== "true"
  ) {
    throw new Error(
      "PAYMENT_PROVIDER is 'test' (no real money is collected) but NODE_ENV=production. " +
        "Set PAYMENT_PROVIDER=fygaro, or set ALLOW_TEST_PAYMENTS=true if you really want a demo site."
    );
  }
  return name;
}

function getProvider() {
  return PROVIDERS[getProviderName()];
}

function isTestMode() {
  return getProviderName() === "test";
}

module.exports = { getProvider, getProviderName, isTestMode, PROVIDERS };
