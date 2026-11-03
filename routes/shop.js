const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const cart = require("../lib/cart");
const { str } = require("../lib/security");

router.get("/", (req, res) => {
  const products = store.getProducts();
  const categories = [...new Set(products.map((p) => p.category))];
  const activeCategory = str(req.query.category, 100);
  const searchRaw = str(req.query.q, 100);
  const search = searchRaw.toLowerCase();

  let filtered = products;
  if (activeCategory) filtered = filtered.filter((p) => p.category === activeCategory);
  if (search) {
    filtered = filtered.filter(
      (p) =>
        String(p.name || "").toLowerCase().includes(search) ||
        String(p.description || "").toLowerCase().includes(search)
    );
  }

  res.render("catalog", {
    title: "Shop",
    products: filtered,
    categories,
    activeCategory,
    search: searchRaw,
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
  cart.addItem(req, req.body.productId, req.body.quantity);
  res.redirect("/cart");
});

router.get("/cart", (req, res) => {
  const details = cart.getCartDetails(req);
  res.render("cart", {
    title: "Your Cart",
    cart: details,
    cartCount: details.itemCount,
  });
});

router.post("/cart/update", (req, res) => {
  cart.setItem(req, req.body.productId, req.body.quantity);
  res.redirect("/cart");
});

router.post("/cart/remove", (req, res) => {
  cart.removeItem(req, req.body.productId);
  res.redirect("/cart");
});

module.exports = router;
