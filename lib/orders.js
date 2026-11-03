// Order fulfillment: everything that must happen exactly once when an order
// becomes paid (stock decrement + receipt emails), no matter how many times
// the confirmation page is loaded or the gateway retries its webhook.

const store = require("./store");
const receipts = require("./receipts");

// Marks the order fulfilled and decrements stock synchronously (no awaits
// between the check and the write, so concurrent requests in this Node process
// can't both pass the check), then sends receipts. Returns the saved order.
async function fulfillOrder(orderId) {
  const order = store.getOrder(orderId);
  if (!order || order.status !== "paid" || order.fulfilledAt) return order;

  order.fulfilledAt = new Date().toISOString();
  store.saveOrder(order);
  store.decrementStock(order.items);

  try {
    const pdf = await receipts.buildReceiptPdf(order);
    await receipts.sendReceiptEmails(order, pdf);
    const latest = store.getOrder(orderId);
    latest.receiptSent = true;
    store.saveOrder(latest);
    return latest;
  } catch (err) {
    // The sale is still valid and the receipt can still be downloaded from the
    // site; just record that the email failed so the owner can follow up.
    console.error(`[orders] receipt email failed for ${orderId}:`, err.message);
    const latest = store.getOrder(orderId);
    latest.receiptError = err.message;
    store.saveOrder(latest);
    return latest;
  }
}

// Applies a verified payment-provider event to an order. Status only moves
// forward from "pending": a paid order is never downgraded by a later,
// replayed, or out-of-order event, and an amount/currency mismatch is held
// for manual review instead of being fulfilled.
function applyPaymentEvent(order, event) {
  if (order.status !== "pending") {
    return { changed: false, reason: `order already ${order.status}` };
  }

  if (event.status === "paid") {
    const expectedCurrency = (order.currency || process.env.CURRENCY || "JMD").toUpperCase();
    const amountOk = event.amount == null || Math.abs(Number(event.amount) - order.total) < 0.005;
    const currencyOk = !event.currency || String(event.currency).toUpperCase() === expectedCurrency;
    if (!amountOk || !currencyOk) {
      order.status = "review";
      order.reviewReason = `Payment of ${event.currency || ""} ${event.amount} does not match order total ${expectedCurrency} ${order.total}`;
    } else {
      order.status = "paid";
    }
  } else {
    order.status = "failed";
  }
  order.providerReference = event.providerReference || order.providerReference;
  order.updatedAt = new Date().toISOString();
  store.saveOrder(order);
  return { changed: true };
}

module.exports = { fulfillOrder, applyPaymentEvent };
