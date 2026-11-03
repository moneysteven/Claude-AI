// Product line illustrations (aluminium strokes) — isomorphic (Node + browser).
// OWNED BY THE CATALOGUE BUILDER. Contract (used by catalogue + estimator):
//
//   productIcon(type, { size = 120, title = "", className = "" }) -> SVG string
//   iconTypeFor(product) -> one of ICON_TYPES (maps BUSINESS.products[] to an icon)
//   ICON_TYPES = ["slider","picture","awning","casement","louver","singlehung",
//                 "swing","sliding","shower","railing","blind","storefront","curtainwall"]
//
// Drawing system: 120×120 viewBox, frame strokes in aluminium #9AA1AB (2.25),
// inner sashes/details in #C9CED6 (1.75), glass in a faint sky tint, glare in
// a pale sky. Round caps/joins everywhere. No <defs>/ids, so any number of
// icons can sit on one page without id collisions.

export const ICON_TYPES = ["slider", "picture", "awning", "casement", "louver", "singlehung", "swing", "sliding", "shower", "railing", "blind", "storefront", "curtainwall"];

const FRAME = "#9AA1AB";
const SASH = "#C9CED6";
const GLASS = 'fill="#26A8E0" fill-opacity=".08"';
const GLARE = 'stroke="#26A8E0" stroke-opacity=".28" stroke-width="2" fill="none"';

// primitives ---------------------------------------------------------------
const frame = (x, y, w, h, r = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff" stroke="${FRAME}" stroke-width="2.25"/>`;
const pane = (x, y, w, h, r = 1.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${GLASS} stroke="${SASH}" stroke-width="1.75"/>`;
const line = (d, c = SASH, w = 1.75, extra = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"${extra}/>`;
const dashed = (d) => line(d, FRAME, 1.5, ' stroke-dasharray="3 4" stroke-opacity=".8"');
/** two short diagonal glare strokes in the top-left of a pane */
const glare = (x, y, s = 1) => `<path d="M${x} ${y + 14 * s}l${14 * s} -${14 * s}M${x} ${y + 24 * s}l${24 * s} -${24 * s}" ${GLARE} stroke-linecap="round"/>`;
const handle = (x, y, h = 10) => line(`M${x} ${y}v${h}`, FRAME, 2.5);
const knob = (cx, cy, r = 2.4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${FRAME}" stroke-width="1.75"/>`;
const floor = (x1, x2, y) => line(`M${x1} ${y}H${x2}`, SASH, 1.75);
const arrow = (x1, x2, y) => {
  // double-headed horizontal travel arrow
  const d = x2 > x1 ? 1 : -1;
  return line(`M${x1} ${y}H${x2}m${-4 * d} -4l${4 * d} 4l${-4 * d} 4`, FRAME, 1.75);
};

// drawings ----------------------------------------------------------------
const DRAW = {
  // Horizontal slider: two overlapping sashes, one travels.
  slider: () =>
    frame(12, 24, 96, 72) +
    pane(18, 30, 46, 60) + glare(23, 35) +
    pane(56, 30, 46, 60) + glare(61, 35, 0.8) +
    handle(60, 54, 12) + arrow(70, 92, 102),

  // Fixed / picture: one large pane, generous glare.
  picture: () =>
    frame(16, 16, 88, 88) + pane(23, 23, 74, 74) + glare(30, 30, 1.3) +
    line("M76 88l14 -14", "#26A8E0", 2, ' stroke-opacity=".18"'),

  // Awning / projecting vent: top-hung lower sash, opening lines meet at the hinge.
  awning: () =>
    frame(18, 14, 84, 92) +
    pane(24, 20, 72, 36) + glare(29, 24, 0.8) +
    pane(24, 60, 72, 40) +
    dashed("M24 100L60 60L96 100") +
    knob(60, 95, 2.2),

  // Friction casement: two side-hung sashes opening outward.
  casement: () =>
    frame(14, 18, 92, 84) +
    pane(20, 24, 38, 72) + pane(62, 24, 38, 72) +
    glare(25, 29, 0.8) +
    dashed("M58 24L20 60L58 96") + dashed("M62 24L100 60L62 96") +
    handle(54, 54, 12) + handle(66, 54, 12),

  // Louver / jalousie: angled glass slats with a side operator.
  louver: () =>
    frame(22, 12, 76, 96) +
    Array.from({ length: 8 }, (_, i) => {
      const y = 19 + i * 11;
      return `<path d="M29 ${y + 3}L91 ${y}V${y + 6}L29 ${y + 9}Z" ${GLASS} stroke="${SASH}" stroke-width="1.75"/>`;
    }).join("") +
    line("M95 54v14", FRAME, 2.5) + knob(95, 72, 2.6),

  // Single hung / push up: fixed top, lower sash slides up.
  singlehung: () =>
    frame(26, 10, 68, 100) +
    pane(32, 16, 56, 42) + glare(37, 21, 0.9) +
    pane(30, 58, 60, 46) +
    line("M48 100h24", FRAME, 2.5) +
    line("M60 92V70m-4 5l4 -5l4 5", FRAME, 1.75),

  // Swing door: leaf with glass lite, lever handle, hinges, floor and swing arc.
  swing: () =>
    floor(10, 110, 110) +
    `<rect x="30" y="10" width="60" height="100" rx="2" fill="#fff" stroke="${FRAME}" stroke-width="2.25"/>` +
    `<rect x="36" y="16" width="48" height="94" rx="1.5" fill="#fff" stroke="${SASH}" stroke-width="1.75"/>` +
    pane(43, 23, 34, 34) + glare(47, 27, 0.7) +
    `<rect x="43" y="66" width="34" height="34" rx="1.5" fill="none" stroke="${SASH}" stroke-width="1.75"/>` +
    knob(77, 63, 2.2) + line("M77 63h-8", FRAME, 2.5) +
    line("M36 28v6M36 86v6", FRAME, 2.5) +
    dashed("M84 110A48 48 0 0 0 36 62"),

  // Sliding patio door: two tall panels, pull handle, travel arrow.
  sliding: () =>
    floor(4, 116, 108) +
    frame(10, 14, 100, 94, 2) +
    pane(16, 20, 46, 82) + glare(21, 25, 1.1) +
    pane(58, 20, 46, 82) + glare(63, 25, 0.8) +
    handle(63, 54, 16) + arrow(84, 98, 62),

  // Frameless shower: wall, shower arm + head, fixed panel + door with clamps & knob.
  shower: () =>
    line("M14 8V112", SASH, 1.75) + floor(10, 112, 108) +
    line("M14 22h14q6 0 6 6v4", FRAME, 2.25) +
    line("M27 33h14", FRAME, 2.5) +
    line("M30 40v6M34 42v6M38 40v6", "#26A8E0", 1.5, ' stroke-opacity=".35"') +
    `<rect x="48" y="18" width="28" height="88" rx="1.5" ${GLASS} stroke="${SASH}" stroke-width="1.75"/>` +
    `<rect x="78" y="18" width="28" height="88" rx="1.5" ${GLASS} stroke="${SASH}" stroke-width="1.75"/>` +
    glare(52, 24, 0.8) + glare(82, 24, 0.6) +
    line("M74 30h6M74 92h6", FRAME, 3) +
    knob(101, 62, 2.6) + line("M42 106h70", FRAME, 2.25),

  // Frameless glass railing: deck, stainless posts, glass panels, handrail.
  railing: () =>
    line("M6 98H114", FRAME, 2.25) + line("M10 104H110", SASH, 1.75) +
    line("M8 40H112", FRAME, 2.5) +
    line("M14 40V98M60 40V98M106 40V98", FRAME, 2.25) +
    pane(18, 46, 38, 48) + pane(64, 46, 38, 48) +
    glare(22, 50, 0.8) + glare(68, 50, 0.6) +
    line("M18 52h-4M18 88h-4M56 52h4M56 88h4M64 52h-4M64 88h-4M102 52h4M102 88h4", FRAME, 2),

  // Roller blind: window frame, roller tube, half-lowered shade, cord with bead.
  blind: () =>
    frame(16, 16, 88, 92) + pane(22, 26, 76, 76) + glare(30, 72, 0.8) +
    `<rect x="12" y="14" width="96" height="10" rx="5" fill="#fff" stroke="${FRAME}" stroke-width="2.25"/>` +
    `<path d="M22 24H98V64H22Z" fill="#F5F6F8" stroke="${SASH}" stroke-width="1.75"/>` +
    line("M22 34H98M22 44H98M22 54H98", SASH, 1, ' stroke-opacity=".7"') +
    line("M22 64H98", FRAME, 2.5) + line("M56 64v4M64 64v4", FRAME, 1.75) +
    line("M102 24V74", FRAME, 1.25) + knob(102, 77, 2.2),

  // Commercial storefront: transom, side lites, double doors with push bars, threshold.
  storefront: () =>
    floor(2, 118, 110) +
    frame(6, 14, 108, 96, 2) +
    line("M6 34H114M32 14V110M88 14V110M60 34V110", FRAME, 2.25) +
    pane(10, 18, 100, 12, 1) +
    pane(10, 38, 18, 68) + pane(92, 38, 18, 68) +
    pane(36, 38, 20, 68) + pane(64, 38, 20, 68) +
    glare(39, 42, 0.6) + glare(13, 42, 0.5) +
    line("M42 72h10M68 72h10", FRAME, 3) +
    line("M30 110H90", FRAME, 3),

  // Curtain wall: building facade grid of mullions and transoms with varied glass.
  curtainwall: () => {
    let s = line("M4 112H116", SASH, 1.75) + frame(14, 8, 92, 104, 2);
    const cols = [14, 37, 60, 83, 106], rows = [8, 34, 60, 86, 112];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      const op = [0.06, 0.12, 0.08, 0.16][(c + r * 3) % 4];
      s += `<rect x="${cols[c] + 2.5}" y="${rows[r] + 2.5}" width="18" height="21" rx="1" fill="#26A8E0" fill-opacity="${op}"/>`;
    }
    s += line("M37 8V112M60 8V112M83 8V112M14 34H106M14 60H106M14 86H106", FRAME, 2.25);
    s += `<path d="M20 30l12 -12M20 56l12 -12M43 30l8 -8M66 82l12 -12M89 56l10 -10" ${GLARE} stroke-linecap="round"/>`;
    return s;
  },
};

/** Map a BUSINESS.products[] entry to the best-fitting ICON_TYPE. */
export function iconTypeFor(product = {}) {
  const n = `${product.name || ""} ${product.id || ""}`.toLowerCase();
  const cat = product.cat || "";
  if (/curtain/.test(n)) return "curtainwall";
  if (/store ?front/.test(n)) return "storefront";
  if (cat === "blinds" || /shade|blind/.test(n)) return "blind";
  if (cat === "railings" || /railing/.test(n)) return "railing";
  if (cat === "showers" || /shower/.test(n)) return "shower";
  if (/louver|louvre|jalousie/.test(n)) return "louver";
  if (/casement/.test(n)) return "casement";
  if (/awning|vent/.test(n)) return "awning";
  if (/single hung|singlehung|push up/.test(n)) return "singlehung";
  if (/picture|fixed/.test(n)) return "picture";
  if (cat === "windows") return "slider"; // sliders, L-Series, 75 Series
  if (/slid/.test(n)) return "sliding"; // patio + closet doors
  if (cat === "doors") return "swing";
  if (cat === "commercial") return "storefront";
  return "picture";
}

/**
 * SVG string for an icon type. With `title` the SVG is announced
 * (role="img" + aria-label); without it, it is decorative (aria-hidden).
 */
export function productIcon(type, { size = 120, title = "", className = "" } = {}) {
  const draw = DRAW[type] || DRAW.picture;
  const t = String(title).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const a11y = t ? `role="img" aria-label="${t}"` : 'aria-hidden="true" focusable="false"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" ${a11y}${className ? ` class="${className}"` : ""} stroke-linecap="round" stroke-linejoin="round" data-icon="${type in DRAW ? type : "picture"}">${draw()}</svg>`;
}
