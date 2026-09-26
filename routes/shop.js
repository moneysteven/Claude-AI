const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const cart = require("../lib/cart");

router.get("/", (req, res) => {
  const products = store.getProducts();
  const categories = [...new Set(products.map((p) => p.category))];
  const activeCategory = req.query.category || "";
  const search = (req.query.q || "").trim().toLowerCase();

  let filtered = products;
  if (activeCategory) filtered = filtered.filter((p) => p.category === activeCategory);
  if (search) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
    );
  }

  res.render("catalog", {
    title: "Shop",
    products: filtered,
    categories,
    activeCategory,
    search: req.query.q || "",
    cartCount: cart.getCartDetails(req).itemCount,
  });
});

router.get("/product/:id", (req, res) => {
  const product = store.getProduct(req.params.id);
  if (!product) return res.status(404).render("404", { title: "Not found" });
  res.render("product", {
    title: product.name,
    product,
    cartCount: cart.getCartDetails(req).itemCount,
  });
});

router.post("/cart/add", (req, res) => {
  const { productId, quantity } = req.body;
  cart.addItem(req, productId, Math.max(1, parseInt(quantity, 10) || 1));
  res.redirect(req.get("referer") && !req.get("referer").includes("/cart") ? req.get("referer") : "/cart");
});

router.get("/cart", (req, res) => {
  res.render("cart", {
    title: "Your Cart",
    cart: cart.getCartDetails(req),
  });
});

router.post("/cart/update", (req, res) => {
  const { productId, quantity } = req.body;
  cart.setItem(req, productId, parseInt(quantity, 10) || 0);
  res.redirect("/cart");
});

router.post("/cart/remove", (req, res) => {
  cart.removeItem(req, req.body.productId);
  res.redirect("/cart");
});

module.exports = router;
