const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const { fulfillOrder, applyPaymentEvent } = require("../lib/orders");
const { PROVIDERS } = require("../lib/providers");
const { asyncHandler } = require("../lib/security");

// Fygaro calls this URL when a payment completes or fails. This must be
// reachable from the internet — so it only works once the site is deployed
// (not on localhost), unless you use a tunnel like ngrok for local testing.
//
// Registered as raw body (see server.js) so we can verify the signature
// before trusting the payload. Always verified with the Fygaro adapter,
// regardless of which provider is active for new checkouts.
router.post(
  "/fygaro",
  asyncHandler(async (req, res) => {
    const provider = PROVIDERS.fygaro;
    const rawBody = req.body; // Buffer, thanks to express.raw() in server.js

    if (!provider.verifyWebhook(rawBody, req.headers)) {
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

    if (!event || typeof event.orderId !== "string" || !event.orderId) {
      return res.status(400).send("Missing order reference");
    }

    const order = store.getOrder(event.orderId);
    if (!order) {
      console.warn(`[webhook] unknown order ${event.orderId}`);
      return res.status(404).send("Unknown order");
    }

    const result = applyPaymentEvent(order, event);
    if (!result.changed) {
      // Duplicate/replayed/out-of-order event: acknowledge so the gateway
      // stops retrying, but don't change anything.
      return res.status(200).send("OK (no change)");
    }
    if (order.status === "review") {
      console.warn(`[webhook] order ${order.id} held for review: ${order.reviewReason}`);
    }

    // Respond before sending email so a slow SMTP server can't cause the
    // gateway to time out and retry; fulfilment is idempotent anyway.
    res.status(200).send("OK");
    if (order.status === "paid") {
      fulfillOrder(order.id).catch((err) => console.error("[webhook] fulfilment failed:", err));
    }
  })
);

module.exports = router;
