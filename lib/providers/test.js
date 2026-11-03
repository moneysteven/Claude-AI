// Test/demo payment provider. No real money moves. Lets you (and the
// customer, in a demo) walk through the whole cart -> checkout -> receipt
// flow before your real Fygaro account/credentials are ready.
//
// It "pays" the order immediately and redirects straight to the receipt.
// Orders paid this way are flagged `testMode` and excluded from revenue.

const store = require("../store");

async function createPaymentLink(order) {
  order.status = "paid";
  order.testMode = true;
  order.providerReference = `TEST-${order.id}`;
  store.saveOrder(order);
  return { url: `/order/${order.id}/confirmation?t=${order.accessToken}` };
}

function verifyWebhook() {
  // No real webhooks in test mode — never accept one.
  return false;
}

function parseWebhookEvent() {
  return null;
}

module.exports = { createPaymentLink, verifyWebhook, parseWebhookEvent };
