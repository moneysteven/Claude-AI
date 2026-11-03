// Estimator data model: pure, isomorphic (imported by markup.js in Node and by
// index.js in the browser). Everything is derived from BUSINESS — no facts here.
import { iconTypeFor } from "../../lib/icons.js";

// Plain-language names for product *types* (groups of BUSINESS.products that
// share an illustration). Descriptive labels only, not product claims.
const TYPE_LABEL = {
  slider: "Sliding windows", picture: "Picture & fixed windows", awning: "Awning & vent windows",
  casement: "Casement windows", louver: "Louver windows", singlehung: "Single hung windows",
  swing: "Swing doors", sliding: "Sliding doors", shower: "Shower doors & screens",
  railing: "Glass railings", blind: "Shades & blinds", storefront: "Store front doors", curtainwall: "Curtain walls",
};

/** Products grouped by category + illustration type, in BUSINESS order. */
export function groupProducts(products) {
  const map = new Map();
  for (const p of products) {
    const type = iconTypeFor(p);
    const key = `${p.cat}-${type}`;
    if (!map.has(key)) map.set(key, { key, cat: p.cat, type, label: TYPE_LABEL[type] || p.name, products: [] });
    map.get(key).products.push(p);
  }
  for (const g of map.values()) g.materials = [...new Set(g.products.map((p) => p.material || ""))];
  return [...map.values()];
}

/** Finish list for a product: only aluminium / uPVC windows, doors and commercial systems take a finish. */
// TODO(business): confirm which finishes apply per product/material (e.g. Tube Swing Door spec lists clear/bronze anodised + white,
// but the residential list has no Anodised; is Wood offered on uPVC as well as aluminium?).
export function finishesFor(p, B) {
  if (!p || !/aluminium|upvc/i.test(p.material || "")) return { kind: "", list: [] };
  if (p.cat === "commercial") return { kind: "Commercial & curtain wall", list: B.finishes.commercial };
  if (p.cat === "windows" || p.cat === "doors") return { kind: "Residential", list: B.finishes.residential };
  return { kind: "", list: [] };
}

/** Size printed in the product name, e.g. "… 32″×80″ (White)" -> {w:32,h:80}. */
export function fixedSize(p) {
  const m = /(\d+(?:\.\d+)?)\s*[″"]\s*[×x]\s*(\d+(?:\.\d+)?)\s*[″"]/.exec(p?.name || "");
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** Sensible starting size for the preview (user edits it). */
export function defaultSize(p, type) {
  const f = fixedSize(p);
  if (f) return f;
  return ({ swing: [36, 80], sliding: [72, 80], shower: [36, 72], railing: [96, 42], storefront: [72, 84], curtainwall: [144, 120], blind: [48, 60] })[type]
    ?.reduce((o, v, i) => ((o[i ? "h" : "w"] = v), o), {}) || { w: 36, h: 48 };
}

/** "Friction Casement" + uPVC -> "uPVC Friction Casement" (names that already say the material are kept). */
export function displayName(p) {
  const m = p.material || "";
  return /^(aluminium|upvc)$/i.test(m) && !p.name.toLowerCase().includes(m.toLowerCase()) ? `${m} ${p.name}` : p.name;
}

/** "• 2× uPVC Friction Casement, 36×48, White" */
export function lineText(it) {
  const size = it.w && it.h ? `, ${it.w}×${it.h}` : "";
  return `• ${it.qty}× ${displayName(it)}${size}${it.finish ? `, ${it.finish}` : ""}`;
}

/** Frame colour for the preview when no finish applies. */
export function previewColour(p, finish, B) {
  const s = B.finishes.swatches;
  if (finish && s[finish]) return s[finish];
  const n = `${p?.name || ""} ${p?.material || ""}`;
  if (/bronze/i.test(n)) return s.Bronze;
  if (/mahogany|wood/i.test(n)) return s.Wood;
  if (/white|steel/i.test(n)) return s.White;
  return s.Anodised;
}

// ---------------------------------------------------------------------------
// Preview drawing (inches; origin at the bottom-centre, y up is negative).
// Panel/sash counts change by type. Illustrative only, not a specification.
const r = (x, y, w, h, cls, extra = "") => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${cls}"${extra}/>`;
const ringPath = (x, y, w, h, t) => `M${x} ${y}h${w}v${h}h${-w}Z M${x + t} ${y + t}v${h - 2 * t}h${w - 2 * t}v${-(h - 2 * t)}Z`;
const fr = (x, y, w, h, t) => `<path class="est-pv-frame" d="${ringPath(x, y, w, h, Math.min(t, w / 4, h / 4))}"/>`;
const gl = (x, y, w, h) => r(x, y, w, h, "est-pv-glass");
const ln = (d, cls = "est-pv-line") => `<path class="${cls}" d="${d}"/>`;
/** a sash = frame ring + glass */
const sash = (x, y, w, h, t) => gl(x + t, y + t, w - 2 * t, h - 2 * t) + fr(x, y, w, h, t);

export function drawPreview(type, w, h, p = {}) {
  const x = -w / 2, y = -h, T = 2.5, t = 2;
  const ix = x + T, iy = y + T, iw = w - 2 * T, ih = h - 2 * T;
  const name = (p.name || "").toLowerCase();
  let s = "";
  switch (type) {
    case "picture":
      s = gl(ix, iy, iw, ih) + fr(x, y, w, h, T); break;
    case "slider": {
      const n = 2, pw = (iw + t) / n;
      for (let i = 0; i < n; i++) s += sash(ix + i * (pw - t), iy, pw, ih, t);
      s += fr(x, y, w, h, T); break;
    }
    case "singlehung": {
      const ph = (ih + t) / 2;
      s = sash(ix, iy, iw, ph, t) + sash(ix, iy + ph - t, iw, ph, t) + fr(x, y, w, h, T); break;
    }
    case "casement": {
      const pw = iw / 2;
      s = sash(ix, iy, pw, ih, t) + sash(ix + pw, iy, pw, ih, t) + fr(x, y, w, h, T) +
        ln(`M${ix + pw} ${iy}L${ix} ${iy + ih / 2}L${ix + pw} ${iy + ih}M${ix + pw} ${iy}L${ix + iw} ${iy + ih / 2}L${ix + pw} ${iy + ih}`, "est-pv-dash");
      break;
    }
    case "awning": {
      const top = ih * 0.45;
      s = gl(ix, iy, iw, top) + sash(ix, iy + top, iw, ih - top, t) + fr(x, y, w, h, T) +
        ln(`M${ix} ${iy + ih}L${ix + iw / 2} ${iy + top}L${ix + iw} ${iy + ih}`, "est-pv-dash"); break;
    }
    case "louver": {
      const n = Math.max(3, Math.round(ih / 4.5)), step = ih / n;
      s = gl(ix, iy, iw, ih);
      for (let i = 1; i < n; i++) s += ln(`M${ix} ${iy + i * step + step * 0.3}L${ix + iw} ${iy + i * step - step * 0.1}`);
      s += fr(x, y, w, h, T); break;
    }
    case "sliding": {
      const n = 2, pw = (iw + t) / n;
      for (let i = 0; i < n; i++) s += sash(ix + i * (pw - t), iy, pw, ih, t);
      s += fr(x, y, w, h, T); break;
    }
    case "swing": {
      if (/6-panel/.test(name)) {
        s = r(ix, iy, iw, ih, "est-pv-leaf");
        const cw = (iw - 9) / 2, rh = (ih - 12) / 3;
        for (let c = 0; c < 2; c++) for (let k = 0; k < 3; k++) s += r(ix + 3 + c * (cw + 3), iy + 3 + k * (rh + 3), cw, rh, "est-pv-panel");
      } else if (/wrought|oval|fanlight|french|texas|tuscany/.test(name)) {
        s = r(ix, iy, iw, ih, "est-pv-leaf") + `<ellipse cx="0" cy="${iy + ih * 0.35}" rx="${iw * 0.3}" ry="${ih * 0.25}" class="est-pv-glass"/>`;
      } else {
        s = gl(ix + t, iy + t, iw - 2 * t, ih * 0.55) + r(ix + t, iy + ih * 0.62, iw - 2 * t, ih * 0.36, "est-pv-panel");
      }
      s += fr(x, y, w, h, T) + `<circle cx="${x + w - 6}" cy="${y + h * 0.52}" r="1.4" class="est-pv-knob"/>`; break;
    }
    case "shower": {
      const n = /screen/.test(name) ? 1 : 2, pw = w / n;
      for (let i = 0; i < n; i++) s += r(x + i * pw + 0.5, y, pw - 1, h, "est-pv-glass est-pv-glass--shower");
      s += ln(`M${x} ${y}V0`, "est-pv-line est-pv-line--metal"); break;
    }
    case "railing": {
      // Glass panel 4 ft suggested (BUSINESS spec) -> one panel per 48".
      const n = Math.max(1, Math.ceil(w / 48)), pw = w / n;
      for (let i = 0; i < n; i++) s += r(x + i * pw + 1.5, y + 3, pw - 3, h - 4, "est-pv-glass");
      for (let i = 0; i <= n; i++) s += ln(`M${x + i * pw} ${y}V0`, "est-pv-line est-pv-line--metal");
      s += ln(`M${x - 1} ${y}H${x + w + 1}`, "est-pv-line est-pv-line--metal"); break;
    }
    case "blind":
      s = gl(ix, iy, iw, ih) + r(ix, iy, iw, ih * 0.58, "est-pv-shade") + fr(x, y, w, h, T); break;
    case "storefront": {
      const tr = Math.min(18, ih * 0.2), side = Math.min(iw * 0.18, 24), dw = (iw - 2 * side) / 2;
      s = gl(ix, iy, iw, ih) +
        ln(`M${ix} ${iy + tr}H${ix + iw}M${ix + side} ${iy + tr}V0M${ix + iw - side} ${iy + tr}V0M0 ${iy + tr}V0`, "est-pv-mullion") +
        ln(`M${-dw * 0.5} ${iy + ih * 0.55}h${dw * 0.3}M${dw * 0.2} ${iy + ih * 0.55}h${dw * 0.3}`, "est-pv-line est-pv-line--metal") +
        fr(x, y, w, h, T); break;
    }
    case "curtainwall": {
      const cols = Math.max(1, Math.ceil(w / 60)), rows = Math.max(1, Math.ceil(h / 60));
      s = gl(x, y, w, h);
      let d = "";
      for (let i = 1; i < cols; i++) d += `M${x + (w * i) / cols} ${y}V0`;
      for (let i = 1; i < rows; i++) d += `M${x} ${y + (h * i) / rows}H${x + w}`;
      s += (d ? ln(d, "est-pv-mullion") : "") + fr(x, y, w, h, T); break;
    }
    default:
      s = gl(ix, iy, iw, ih) + fr(x, y, w, h, T);
  }
  return s;
}

export const LIMITS = { w: [12, 240], h: [12, 192], qty: [1, 99] };
