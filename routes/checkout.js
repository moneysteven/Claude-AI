const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const cart = require("../lib/cart");
const store = require("../lib/store");
const receipts = require("../lib/receipts");
const { fulfillOrder } = require("../lib/orders");
const { getProvider } = require("../lib/providers");
const { asyncHandler, safeEqual, str } = require("../lib/security");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderCheckout(res, cartDetails, error, values = {}) {
  res.status(error ? 400 : 200).render("checkout", {
    title: "Checkout",
    cart: cartDetails,
    cartCount: cartDetails.itemCount,
    error,
    values,
  });
}

// Orders are private: viewable by the browser that placed them, by the
// holder of the secret link (?t=...) used in the payment redirect, or by admin.
function canView(req, order) {
  if (req.session.isAdmin) return true;
  const mine = Array.isArray(req.session.myOrders) && req.session.myOrders.includes(order.id);
  return mine || (typeof req.query.t === "string" && safeEqual(req.query.t, order.accessToken || ""));
}

function rememberOrder(req, orderId) {
  const list = Array.isArray(req.session.myOrders) ? req.session.myOrders : [];
  req.session.myOrders = [...list.filter((id) => id !== orderId), orderId].slice(-10);
}

router.get("/checkout", (req, res) => {
  const cartDetails = cart.getCartDetails(req);
  if (cartDetails.items.length === 0) return res.redirect("/cart");
  renderCheckout(res, cartDetails, null);
});

router.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    const cartDetails = cart.getCartDetails(req);
    if (cartDetails.items.length === 0) return res.redirect("/cart");

    const values = {
      name: str(req.body.name, 120),
      email: str(req.body.email, 200),
      phone: str(req.body.phone, 40),
      address: str(req.body.address, 500),
    };
    if (!values.name || !values.email) {
      return renderCheckout(res, cartDetails, "Name and email are required.", values);
    }
    if (!EMAIL_RE.test(values.email)) {
      return renderCheckout(res, cartDetails, "Please enter a valid email address.", values);
    }

    const order = {
      id: crypto.randomBytes(5).toString("hex").toUpperCase(),
      accessToken: crypto.randomBytes(24).toString("hex"),
      createdAt: new Date().toISOString(),
      status: "pending",
      currency: process.env.CURRENCY || "JMD",
      customer: values,
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
    rememberOrder(req, order.id);

    let url;
    try {
      ({ url } = await getProvider().createPaymentLink(order));
    } catch (err) {
      console.error("[checkout] payment link creation failed:", err.message);
      return renderCheckout(
        res,
        cartDetails,
        "Sorry, we couldn't start the payment right now. Please try again shortly, or contact us directly.",
        values
      );
    }

    // Test provider pays instantly; fulfil now (stock + receipt, exactly once).
    // Real providers are fulfilled by their verified webhook.
    if (store.getOrder(order.id).status === "paid") {
      cart.clearCart(req);
      await fulfillOrder(order.id);
    }
    res.redirect(url);
  })
);

router.get("/order/:id/confirmation", (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order || !canView(req, order)) return res.status(404).render("404", { title: "Not found" });

  // Coming back from the payment page: remember the order in this browser
  // and empty the cart once the payment is confirmed (works for every provider).
  rememberOrder(req, order.id);
  if (order.status === "paid") cart.clearCart(req);

  res.render("confirmation", {
    title: "Order confirmation",
    order,
    receiptUrl: `/order/${order.id}/receipt.pdf?t=${order.accessToken}`,
  });
});

router.get(
  "/order/:id/receipt.pdf",
  asyncHandler(async (req, res) => {
    const order = store.getOrder(req.params.id);
    if (!order || !canView(req, order)) return res.status(404).send("Not found");
    const pdf = await receipts.buildReceiptPdf(order);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="receipt-${order.id}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  })
);

module.exports = router;
