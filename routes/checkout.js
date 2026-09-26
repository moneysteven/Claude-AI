const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const cart = require("../lib/cart");
const store = require("../lib/store");
const receipts = require("../lib/receipts");
const { getProvider } = require("../lib/providers");

router.get("/checkout", (req, res) => {
  const cartDetails = cart.getCartDetails(req);
  if (cartDetails.items.length === 0) return res.redirect("/cart");
  res.render("checkout", { title: "Checkout", cart: cartDetails, error: null });
});

router.post("/checkout", async (req, res) => {
  const cartDetails = cart.getCartDetails(req);
  if (cartDetails.items.length === 0) return res.redirect("/cart");

  const { name, email, phone, address } = req.body;
  if (!name || !email) {
    return res.render("checkout", {
      title: "Checkout",
      cart: cartDetails,
      error: "Name and email are required.",
    });
  }

  const order = {
    id: uuidv4().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: "pending",
    customer: { name, email, phone, address },
    items: cartDetails.items.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    total: cartDetails.total,
    providerReference: null,
  };

  store.saveOrder(order);

  try {
    const provider = getProvider();
    const { url } = await provider.createPaymentLink(order);
    // The cart is cleared once payment is confirmed (webhook, or the test
    // provider's immediate confirmation) — not here — so a customer who
    // abandons the payment page still has their cart.
    res.redirect(url);
  } catch (err) {
    console.error("[checkout] payment link creation failed:", err.message);
    res.render("checkout", {
      title: "Checkout",
      cart: cartDetails,
      error:
        "Sorry, we couldn't start the payment right now. Please try again shortly, or contact us directly.",
    });
  }
});

router.get("/order/:id/confirmation", async (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).render("404", { title: "Not found" });

  // Demo/test-mode flow: the test provider marks the order paid immediately
  // and sends the customer straight here.
  if (order.status === "paid" && req.query.demo) {
    cart.clearCart(req);
    if (!order.receiptSent) {
      const pdf = await receipts.buildReceiptPdf(order);
      await receipts.sendReceiptEmails(order, pdf);
      order.receiptSent = true;
      store.saveOrder(order);
    }
    store.decrementStock(order.items);
  }

  res.render("confirmation", { title: "Order confirmation", order });
});

router.get("/order/:id/receipt.pdf", async (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).send("Not found");
  const pdf = await receipts.buildReceiptPdf(order);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${order.id}.pdf"`);
  res.send(pdf);
});

module.exports = router;
