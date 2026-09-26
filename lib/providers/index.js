// Every payment provider implements the same small interface:
//
//   createPaymentLink(order) -> { url }                (async)
//   verifyWebhook(rawBody, headers) -> boolean          (sync or async)
//   parseWebhookEvent(rawBody, headers) -> {
//       orderId, status: "paid" | "failed", providerReference
//   }
//
// This keeps checkout.js and the webhook route provider-agnostic. Adding a
// second provider (WiPay, PayPal, a bank gateway) later means writing one
// new file here and switching PAYMENT_PROVIDER in .env — no other code
// changes.

const testProvider = require("./test");
const fygaroProvider = require("./fygaro");

function getProvider() {
  const name = (process.env.PAYMENT_PROVIDER || "test").toLowerCase();
  if (name === "fygaro") return fygaroProvider;
  return testProvider;
}

module.exports = { getProvider };
