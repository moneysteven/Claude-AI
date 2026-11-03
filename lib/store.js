// Tiny file-backed data store. Good enough for a small hardware catalog and
// order log without needing to run/manage a separate database server.
// If the catalog grows large or you get many concurrent orders, swap this
// for a real database (Postgres/SQLite) — the rest of the app only talks to
// the functions exported here, so that swap stays contained to this file.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PRODUCTS_PATH = path.join(DATA_DIR, "products.json");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");

function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return JSON.parse(raw || "[]");
}

// Write to a temp file then rename over the original: rename is atomic, so a
// crash mid-write can never leave a truncated/corrupt JSON file behind.
function writeJson(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function getProducts() {
  return readJson(PRODUCTS_PATH);
}

function getProduct(id) {
  return getProducts().find((p) => p.id === id) || null;
}

function saveProducts(products) {
  writeJson(PRODUCTS_PATH, products);
}

function getOrders() {
  return readJson(ORDERS_PATH);
}

function getOrder(id) {
  if (typeof id !== "string") return null;
  return getOrders().find((o) => o.id === id) || null;
}

function saveOrder(order) {
  const orders = getOrders();
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = order;
  } else {
    orders.push(order);
  }
  writeJson(ORDERS_PATH, orders);
  return order;
}

function decrementStock(items) {
  const products = getProducts();
  for (const item of items) {
    const product = products.find((p) => p.id === item.id);
    if (product) {
      product.stock = Math.max(0, product.stock - item.quantity);
    }
  }
  saveProducts(products);
}

module.exports = {
  getProducts,
  getProduct,
  saveProducts,
  getOrders,
  getOrder,
  saveOrder,
  decrementStock,
};
