const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const store = require("../lib/store");
const { safeEqual, rateLimit, str } = require("../lib/security");

const SESSION_HOURS = 8;
// Rotated on logout (and on every restart): any admin cookie minted before
// then — including a copied/stolen one — stops working.
let adminEpoch = crypto.randomBytes(8).toString("hex");

function requireAuth(req, res, next) {
  const s = req.session;
  if (s.isAdmin && s.adminEpoch === adminEpoch && s.adminUntil > Date.now()) return next();
  s.isAdmin = false;
  res.redirect("/admin/login");
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.get("/login", (req, res) => {
  res.render("admin/login", { title: "Admin Login", error: null });
});

router.post("/login", loginLimiter, (req, res) => {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return res.status(503).render("admin/login", {
      title: "Admin Login",
      error: "Admin login is disabled: set ADMIN_USERNAME and ADMIN_PASSWORD in your .env.",
    });
  }

  const userOk = safeEqual(str(req.body.username, 200), expectedUser);
  const passOk = safeEqual(typeof req.body.password === "string" ? req.body.password : "", expectedPass);
  if (userOk && passOk) {
    req.session.isAdmin = true;
    req.session.adminEpoch = adminEpoch;
    req.session.adminUntil = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    return res.redirect("/admin");
  }
  res.status(401).render("admin/login", { title: "Admin Login", error: "Incorrect username or password." });
});

router.post("/logout", (req, res) => {
  adminEpoch = crypto.randomBytes(8).toString("hex");
  req.session.isAdmin = false;
  delete req.session.adminEpoch;
  delete req.session.adminUntil;
  res.redirect("/admin/login");
});

router.get("/", requireAuth, (req, res) => {
  const orders = store.getOrders().slice().reverse();
  const products = store.getProducts();
  const totalRevenue = orders
    .filter((o) => o.status === "paid" && !o.testMode)
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const testOrders = orders.filter((o) => o.testMode).length;

  res.render("admin/dashboard", {
    title: "Admin",
    orders,
    products,
    totalRevenue,
    testOrders,
  });
});

router.get("/products", requireAuth, (req, res) => {
  const editing = req.query.edit ? store.getProduct(str(req.query.edit, 100)) : null;
  res.render("admin/products", { title: "Manage Products", products: store.getProducts(), error: null, editing });
});

function validateProduct(body) {
  const name = str(body.name, 200);
  const category = str(body.category, 100);
  const description = str(body.description, 2000);
  const priceRaw = str(body.price, 30);
  const stockRaw = str(body.stock, 30);
  const price = Number(priceRaw);
  const stock = Number(stockRaw);
  const image = str(body.image, 500) || "/img/placeholder-generic.svg";

  if (!name || !category || !description) return { error: "Name, category and description are required." };
  if (priceRaw === "" || !Number.isFinite(price) || price <= 0) return { error: "Price must be a number greater than 0." };
  if (stockRaw === "" || !Number.isInteger(stock) || stock < 0) return { error: "Stock must be a whole number, 0 or more." };
  if (!/^\/[\w\-./]+$/.test(image) && !/^https:\/\/[^\s"'<>]+$/i.test(image)) {
    return { error: "Image must be a site path like /img/photo.jpg or an https:// URL." };
  }
  return { data: { name, category, description, price: Math.round(price * 100) / 100, stock, image } };
}

router.post("/products", requireAuth, (req, res) => {
  const products = store.getProducts();
  const { data, error } = validateProduct(req.body);
  if (error) {
    return res.status(400).render("admin/products", {
      title: "Manage Products",
      products,
      error,
      editing: { ...req.body },
    });
  }

  const id = str(req.body.id, 100);
  const existingIdx = id ? products.findIndex((p) => p.id === id) : -1;
  if (existingIdx >= 0) {
    products[existingIdx] = { ...products[existingIdx], ...data, id };
  } else {
    const newId = id && /^[\w-]+$/.test(id) ? id : `hdw-${crypto.randomBytes(4).toString("hex")}`;
    products.push({ id: newId, ...data });
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
