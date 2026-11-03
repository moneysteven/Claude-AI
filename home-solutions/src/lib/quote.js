// Quote basket shared by the catalogue (+ buttons), the estimator and the
// header badge. Persisted in localStorage; broadcasts "quote:change".
//
// Item: { key, productId, name, material, cat, finish, w, h, qty, priceJMD? }

const KEY = "hs-quote-v1";
let items = [];
try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(items)) items = []; } catch { items = []; }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage may be blocked */ }
  window.dispatchEvent(new CustomEvent("quote:change", { detail: { items: [...items], count: count() } }));
}

let seq = 0;
const newKey = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;

export const getItems = () => items.map((i) => ({ ...i }));
export const count = () => items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

/** Adds a line (merging with an identical product/finish/size line). Returns the line key. */
export function add(line) {
  const same = items.find((i) => i.productId === line.productId && i.finish === line.finish && i.w === line.w && i.h === line.h);
  if (same) { same.qty = (Number(same.qty) || 0) + (Number(line.qty) || 1); save(); return same.key; }
  const item = { qty: 1, ...line, key: newKey() };
  items.push(item); save(); return item.key;
}
export function update(key, patch) {
  const it = items.find((i) => i.key === key); if (!it) return;
  Object.assign(it, patch);
  if (!(Number(it.qty) > 0)) items = items.filter((i) => i.key !== key);
  save();
}
export function remove(key) { items = items.filter((i) => i.key !== key); save(); }
export function clear() { items = []; save(); }

/** JMD subtotal if EVERY line has a known price, else null ("Estimate: TBC"). */
export function subtotal(list = items) {
  if (!list.length || !list.every((i) => typeof i.priceJMD === "number")) return null;
  return list.reduce((s, i) => s + i.priceJMD * (Number(i.qty) || 0), 0);
}

export function onChange(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener("quote:change", h);
  return () => window.removeEventListener("quote:change", h);
}
