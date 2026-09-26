const store = require("./store");

// The cart lives in the customer's signed session cookie as { [productId]: quantity }.
// No server-side session storage needed, and it survives a page refresh.

function getCart(req) {
  return req.session.cart || {};
}

function saveCart(req, cart) {
  req.session.cart = cart;
}

function addItem(req, productId, quantity) {
  const cart = getCart(req);
  cart[productId] = (cart[productId] || 0) + quantity;
  saveCart(req, cart);
}

function setItem(req, productId, quantity) {
  const cart = getCart(req);
  if (quantity <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = quantity;
  }
  saveCart(req, cart);
}

function removeItem(req, productId) {
  const cart = getCart(req);
  delete cart[productId];
  saveCart(req, cart);
}

function clearCart(req) {
  saveCart(req, {});
}

// Resolves the cart's product ids + quantities against the live catalog,
// so prices/stock are always current (never trust stale cookie prices).
function getCartDetails(req) {
  const cart = getCart(req);
  const products = store.getProducts();
  const items = Object.entries(cart)
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      const clampedQty = Math.max(1, Math.min(quantity, product.stock));
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: clampedQty,
        stock: product.stock,
        lineTotal: product.price * clampedQty,
      };
    })
    .filter(Boolean);

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, total, itemCount };
}

module.exports = { getCart, addItem, setItem, removeItem, clearCart, getCartDetails };
