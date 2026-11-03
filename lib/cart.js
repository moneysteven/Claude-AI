const store = require("./store");

// The cart lives in the customer's signed session cookie as { [productId]: quantity }.
// No server-side session storage needed, and it survives a page refresh.

const MAX_QTY = 999;

function getCart(req) {
  const cart = req.session.cart;
  return cart && typeof cart === "object" && !Array.isArray(cart) ? { ...cart } : {};
}

function saveCart(req, cart) {
  req.session.cart = cart;
}

function toQty(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(MAX_QTY, n) : 0;
}

// Only real, in-stock catalog products can be added; quantity is capped at stock.
function addItem(req, productId, quantity) {
  const product = typeof productId === "string" ? store.getProduct(productId) : null;
  if (!product || product.stock <= 0) return false;
  const cart = getCart(req);
  const current = Object.prototype.hasOwnProperty.call(cart, product.id) ? cart[product.id] : 0;
  cart[product.id] = Math.min(product.stock, current + Math.max(1, toQty(quantity)));
  saveCart(req, cart);
  return true;
}

function setItem(req, productId, quantity) {
  if (typeof productId !== "string") return;
  const cart = getCart(req);
  if (!Object.prototype.hasOwnProperty.call(cart, productId)) return;
  const qty = toQty(quantity);
  if (qty <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = qty;
  }
  saveCart(req, cart);
}

function removeItem(req, productId) {
  if (typeof productId !== "string") return;
  const cart = getCart(req);
  delete cart[productId];
  saveCart(req, cart);
}

function clearCart(req) {
  saveCart(req, {});
}

const round2 = (n) => Math.round(n * 100) / 100;

// Resolves the cart's product ids + quantities against the live catalog,
// so prices/stock are always current (never trust stale cookie prices).
// Out-of-stock products are dropped; quantities are capped at current stock.
function getCartDetails(req) {
  const cart = getCart(req);
  const products = store.getProducts();
  const items = Object.entries(cart)
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === productId);
      if (!product || !(product.stock > 0) || !Number.isFinite(product.price)) return null;
      const clampedQty = Math.max(1, Math.min(toQty(quantity), product.stock));
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: clampedQty,
        stock: product.stock,
        lineTotal: round2(product.price * clampedQty),
      };
    })
    .filter(Boolean);

  const total = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, total, itemCount };
}

module.exports = { getCart, addItem, setItem, removeItem, clearCart, getCartDetails };
