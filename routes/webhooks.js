const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const receipts = require("../lib/receipts");
const { getProvider } = require("../lib/providers");

// Fygaro (or whichever provider is active) calls this URL when a payment
// completes or fails. This must be reachable from the internet — so it only
// works once the site is deployed (not on localhost), unless you use a
// tunnel like ngrok for local testing.
//
// Registered as raw body (see server.js) so we can verify the signature
// before trusting the payload.
router.post("/fygaro", async (req, res) => {
  const provider = getProvider();
  const rawBody = req.body; // Buffer, thanks to express.raw() in server.js

  const isValid = provider.verifyWebhook(rawBody, req.headers);
  if (!isValid) {
    console.warn("[webhook] signature verification failed");
    return res.status(401).send("Invalid signature");
  }

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody, req.headers);
  } catch (err) {
    console.error("[webhook] could not parse payload:", err.message);
    return res.status(400).send("Bad payload");
  }

  if (!event || !event.orderId) {
    return res.status(400).send("Missing order reference");
  }

  const order = store.getOrder(event.orderId);
  if (!order) {
    console.warn(`[webhook] unknown order ${event.orderId}`);
    return res.status(404).send("Unknown order");
  }

  order.status = event.status;
  order.providerReference = event.providerReference;
  store.saveOrder(order);

  if (event.status === "paid" && !order.receiptSent) {
    const pdf = await receipts.buildReceiptPdf(order);
    await receipts.sendReceiptEmails(order, pdf);
    order.receiptSent = true;
    store.saveOrder(order);
    store.decrementStock(order.items);
  }

  res.status(200).send("OK");
});

module.exports = router;
