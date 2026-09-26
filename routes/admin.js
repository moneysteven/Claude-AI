const express = require("express");
const router = express.Router();
const store = require("../lib/store");

function requireAuth(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect("/admin/login");
}

router.get("/login", (req, res) => {
  res.render("admin/login", { title: "Admin Login", error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  res.render("admin/login", { title: "Admin Login", error: "Incorrect username or password." });
});

router.post("/logout", (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin/login");
});

router.get("/", requireAuth, (req, res) => {
  const orders = store.getOrders().slice().reverse();
  const products = store.getProducts();
  const totalRevenue = orders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  res.render("admin/dashboard", {
    title: "Admin",
    orders,
    products,
    totalRevenue,
  });
});

router.get("/products", requireAuth, (req, res) => {
  res.render("admin/products", { title: "Manage Products", products: store.getProducts() });
});

router.post("/products", requireAuth, (req, res) => {
  const products = store.getProducts();
  const { id, name, category, price, stock, description, image } = req.body;
  const existingIdx = products.findIndex((p) => p.id === id);

  const productData = {
    id: id || `hdw-${Date.now()}`,
    name,
    category,
    price: Number(price),
    stock: Number(stock),
    description,
    image: image || "/img/placeholder-generic.svg",
  };

  if (existingIdx >= 0) {
    products[existingIdx] = productData;
  } else {
    products.push(productData);
  }
  store.saveProducts(products);
  res.redirect("/admin/products");
});

router.post("/products/:id/delete", requireAuth, (req, res) => {
  const products = store.getProducts().filter((p) => p.id !== req.params.id);
  store.saveProducts(products);
  res.redirect("/admin/products");
});

module.exports = router;
