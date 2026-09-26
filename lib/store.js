// Tiny file-backed data store. Good enough for a small hardware catalog and
// order log without needing to run/manage a separate database server.
// If the catalog grows large or you get many concurrent orders, swap this
// for a real database (Postgres/SQLite) — the rest of the app only talks to
// the functions exported here, so that swap stays contained to this file.

const fs = require("fs");
const path = require("path");

const PRODUCTS_PATH = path.join(__dirname, "..", "data", "products.json");
const ORDERS_PATH = path.join(__dirname, "..", "data", "orders.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw || "[]");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
