// Pure formatting helpers (safe in Node at build time and in the browser).

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 25650 -> "JMD $25,650" */
export const moneyJMD = (n) => "JMD $" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Price label for a product: real JMD price if known, else "Price on request" (never invent a number). */
export const priceLabel = (p) => (typeof p.priceJMD === "number" ? moneyJMD(p.priceJMD) : "Price on request");

/** "+18769579360" -> "876-957-9360" */
export const phoneDisplay = (e164) => {
  const d = String(e164).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(e164);
};

/** "+18769579360" -> "tel:+18769579360" */
export const telHref = (e164) => "tel:+" + String(e164).replace(/\D/g, "");

/** "2025-03-19" -> "Mar 2025" */
export const monthYear = (iso) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Category labels used by filters, estimator and FAQ. */
export const CATEGORIES = [
  { id: "windows", label: "Windows" },
  { id: "doors", label: "Doors" },
  { id: "showers", label: "Showers" },
  { id: "railings", label: "Railings" },
  { id: "blinds", label: "Blinds" },
  { id: "commercial", label: "Commercial" },
];
