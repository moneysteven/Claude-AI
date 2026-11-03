// Product line illustrations (aluminium strokes) — isomorphic (Node + browser).
// OWNED BY THE CATALOGUE BUILDER. Contract (used by catalogue + estimator):
//
//   productIcon(type, { size = 120, title = "" }) -> SVG string
//   iconTypeFor(product) -> one of ICON_TYPES (maps BUSINESS.products[] to an icon)
//   ICON_TYPES = ["slider","picture","awning","casement","louver","singlehung",
//                 "swing","sliding","shower","railing","blind","storefront","curtainwall"]
//
// Placeholder implementation until the catalogue builder replaces it.
export const ICON_TYPES = ["slider", "picture", "awning", "casement", "louver", "singlehung", "swing", "sliding", "shower", "railing", "blind", "storefront", "curtainwall"];
export function iconTypeFor() { return "picture"; }
export function productIcon(type, { size = 120, title = "" } = {}) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${title || type}"><rect x="20" y="15" width="80" height="90" rx="3" fill="none" stroke="#9AA1AB" stroke-width="3"/></svg>`;
}
