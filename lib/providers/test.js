// Test/demo payment provider. No real money moves. Lets you (and the
// customer, in a demo) walk through the whole cart -> checkout -> receipt
// flow before your real Fygaro account/credentials are ready.
//
// It "pays" the order immediately and redirects straight to the receipt.

const store = require("../store");

async function createPaymentLink(order) {
  // In real life this would be a hosted payment page URL from the gateway.
  // Here we just mark the order paid right away and point at our own
  // "fake payment" confirmation page.
  order.status = "paid";
  order.providerReference = `TEST-${order.id}`;
  store.saveOrder(order);
  return { url: `/order/${order.id}/confirmation?demo=1` };
}

function verifyWebhook() {
  // No real webhooks in test mode.
  return true;
}

function parseWebhookEvent() {
  return null;
}

module.exports = { createPaymentLink, verifyWebhook, parseWebhookEvent };
