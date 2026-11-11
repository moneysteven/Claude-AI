/* ============ sample vehicle renders — studio "photography" style, generated as SVG ============
   External images can't load inside an artifact, so SAMPLE listings use these renders.
   Host-uploaded photos always come first. */
const ART = new Map();
function shade(hex, amt) {
  let c = String(hex || "#888").replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const n = parseInt(c, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function lum(hex) { const c = String(hex).replace("#", ""); const n = parseInt(c, 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }

function wheelSVG(cx, r, id) {
  const cy = 200 - r; let spokes = "";
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 - 90) * Math.PI / 180, b = a + 0.22, c2 = a - 0.22; const R = r * 0.6, ri = r * 0.17;
    spokes += `<path d="M${(cx + Math.cos(c2) * ri).toFixed(1)} ${(cy + Math.sin(c2) * ri).toFixed(1)} L${(cx + Math.cos(a - 0.12) * R).toFixed(1)} ${(cy + Math.sin(a - 0.12) * R).toFixed(1)} L${(cx + Math.cos(a + 0.12) * R).toFixed(1)} ${(cy + Math.sin(a + 0.12) * R).toFixed(1)} L${(cx + Math.cos(b) * ri).toFixed(1)} ${(cy + Math.sin(b) * ri).toFixed(1)} Z" fill="url(#spoke${id})"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#tyre)"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.66).toFixed(1)}" fill="url(#rim)"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.58).toFixed(1)}" fill="#1b1c1f"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.44).toFixed(1)}" fill="#3a3c41" opacity=".7"/>
    ${spokes}<circle cx="${cx}" cy="${cy}" r="${(r * 0.17).toFixed(1)}" fill="url(#rim)"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.07).toFixed(1)}" fill="#2a2c30"/>`;
}
const SHAPES = {
  car: { body: "M58 184 L58 160 Q60 147 76 144 L120 139 L156 111 Q164 104 177 104 L250 104 Q263 104 271 113 L301 139 L331 143 Q346 146 346 161 L346 184 Z",
    win: '<path d="M129 139 L160 114 L206 114 L206 139 Z"/><path d="M214 114 L249 114 Q257 114 263 121 L282 139 L214 139 Z"/>',
    belt: "M76 147 L332 147", seams: "M210 142 V181 M140 144 V181", handles: [[166, 152], [226, 152]], mirror: [282, 132],
    head: "M330 150 L345 152 L345 159 L333 158 Z", tail: "M58 150 L66 150 L66 162 L58 162 Z", wheels: [[115, 25], [290, 25]] },
  suv: { body: "M50 186 L50 152 Q50 139 64 137 L96 133 L120 97 Q126 88 138 88 L276 88 Q289 88 296 98 L320 133 L338 137 Q353 140 353 156 L353 186 Z",
    win: '<path d="M131 131 L148 98 L202 98 L202 131 Z"/><path d="M210 98 L271 98 Q280 98 284 106 L301 131 L210 131 Z"/>',
    belt: "M64 140 L338 140", seams: "M206 134 V182 M130 136 V182", handles: [[160, 146], [222, 146]], mirror: [302, 124], rails: true,
    head: "M336 146 L352 149 L352 157 L338 156 Z", tail: "M50 145 L58 145 L58 160 L50 160 Z", wheels: [[112, 28], [292, 28]] },
  van: { body: "M46 186 L46 110 Q46 72 84 70 L298 70 Q317 70 326 86 L352 136 Q357 145 357 158 L357 186 Z",
    win: '<rect x="62" y="84" width="68" height="42" rx="6"/><rect x="138" y="84" width="70" height="42" rx="4"/><rect x="216" y="84" width="70" height="42" rx="4"/><path d="M294 84 H316 Q323 85 327 93 L345 128 H294 Z"/>',
    belt: "M48 134 L352 134", seams: "M212 132 V182 M136 132 V182", handles: [[190, 146]], mirror: [330, 120],
    head: "M340 148 L356 150 L356 158 L342 157 Z", tail: "M46 146 L54 146 L54 164 L46 164 Z", wheels: [[112, 26], [300, 26]] },
  bus: { body: "M28 188 L28 76 Q28 58 48 58 L338 58 Q358 58 363 76 L372 126 L374 188 Z",
    win: '<rect x="44" y="72" width="42" height="42" rx="4"/><rect x="92" y="72" width="42" height="42" rx="4"/><rect x="140" y="72" width="42" height="42" rx="4"/><rect x="188" y="72" width="42" height="42" rx="4"/><rect x="236" y="72" width="42" height="42" rx="4"/><rect x="290" y="74" width="26" height="54" rx="3"/><path d="M326 70 H350 Q356 70 358 78 L366 126 H326 Z"/>',
    belt: "M30 124 L370 124", seams: "M286 70 V184 M320 70 V184", handles: [], mirror: [368, 92],
    head: "M358 150 L372 151 L372 160 L360 159 Z", tail: "M28 148 L36 148 L36 168 L28 168 Z", wheels: [[92, 27], [312, 27]] },
  pickup: { body: "M42 186 L42 134 L150 134 L150 128 L170 96 Q175 89 184 89 L246 89 Q257 89 263 98 L285 132 L334 138 Q351 141 351 158 L351 186 Z",
    win: '<path d="M176 128 L190 99 L226 99 L226 128 Z"/><path d="M233 99 L252 99 Q259 99 263 106 L276 128 L233 128 Z"/>',
    belt: "M44 138 L340 140", seams: "M152 136 V182 M230 132 V182", handles: [[238, 144]], mirror: [282, 124],
    head: "M334 146 L350 149 L350 157 L336 156 Z", tail: "M42 140 L50 140 L50 154 L42 154 Z", wheels: [[100, 27], [292, 27]] },
};
function twoWheeler(type, c, d) {
  const tyre = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#tyreS)" stroke-width="${r * 0.28}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="none" stroke="url(#rimS)" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="url(#rim)"/>`;
  if (type === "bike") return `
    ${tyre(118, 164, 34)}${tyre(290, 164, 34)}
    <path d="M118 164 L176 120 L240 120 L290 164" stroke="#2b2d31" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M176 122 L206 164 L240 122" stroke="#3a3d42" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="186" y="134" width="44" height="30" rx="6" fill="url(#engine)"/>
    <path d="M140 156 C170 162 200 160 226 154" stroke="url(#chrome)" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M290 164 L262 92" stroke="url(#chrome)" stroke-width="6" stroke-linecap="round"/>
    <path d="M180 114 Q198 88 238 95 L248 118 L182 123 Z" fill="url(#paint)"/><path d="M188 104 Q206 92 232 97" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none"/>
    <path d="M126 110 Q150 98 188 106 L184 118 L130 120 Z" fill="#1d1e21"/>
    <path d="M248 92 Q276 94 283 122 L258 124 Z" fill="url(#paint)"/>
    <path d="M268 100 L282 103 L281 110 L270 108 Z" fill="#f4f6f8"/>
    <path d="M250 84 L278 78" stroke="#1d1e21" stroke-width="5" stroke-linecap="round"/>
    <path d="M100 118 Q118 110 134 116" stroke="${d}" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="95" y="115" width="6" height="5" rx="1" fill="#9b1c1c"/>`;
  return `
    ${tyre(130, 176, 24)}${tyre(286, 176, 24)}
    <path d="M90 170 Q88 124 140 122 L192 122 Q206 122 208 138 L208 160 L96 172 Z" fill="url(#paint)"/>
    <path d="M100 136 Q118 126 150 126" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none"/>
    <path d="M112 118 Q142 104 192 114 L190 124 L114 126 Z" fill="#1d1e21"/>
    <rect x="196" y="156" width="74" height="10" rx="5" fill="#2a2c30"/>
    <path d="M256 168 L262 108 Q265 92 278 90 L288 90 L282 122 L276 168 Z" fill="url(#paint)"/>
    <path d="M268 88 L296 82" stroke="#1d1e21" stroke-width="5" stroke-linecap="round"/>
    <path d="M281 96 L292 98 L291 105 L282 104 Z" fill="#f4f6f8"/><rect x="88" y="138" width="6" height="5" rx="1" fill="#9b1c1c"/>
    <path d="M262 160 Q286 144 312 162" stroke="${d}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
}
function backdrop(kind, id) {
  if (kind === "dark") return `<radialGradient id="bg${id}" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#3b3d42"/><stop offset=".55" stop-color="#1b1c1f"/><stop offset="1" stop-color="#0c0c0d"/></radialGradient>
      <linearGradient id="fl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2b2f" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>`;
  if (kind === "street") return `<linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#23303d"/><stop offset=".55" stop-color="#7a6a5e"/><stop offset=".8" stop-color="#c79a6e"/><stop offset="1" stop-color="#3a3532"/></linearGradient>
      <linearGradient id="fl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2b2b"/><stop offset="1" stop-color="#121212"/></linearGradient>`;
  return `<radialGradient id="bg${id}" cx="50%" cy="36%" r="78%"><stop offset="0" stop-color="#fbfbfa"/><stop offset=".6" stop-color="#ebebea"/><stop offset="1" stop-color="#d4d5d6"/></radialGradient>
      <linearGradient id="fl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d9d9" stop-opacity="0"/><stop offset="1" stop-color="#bfc0c2" stop-opacity=".8"/></linearGradient>`;
}
function scene(kind, id) {
  if (kind === "street") {
    let bokeh = ""; const pts = [[40, 70, 16, "#ffd9a0"], [92, 52, 10, "#fff0cf"], [150, 88, 22, "#f2b67a"], [236, 60, 14, "#ffe2b0"], [300, 92, 26, "#e8a76c"], [356, 54, 12, "#fff4dc"], [210, 110, 9, "#ffe7c4"], [120, 120, 12, "#ffd29a"]];
    for (const [x, y, r, c] of pts) bokeh += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".35"/>`;
    return `<rect width="400" height="250" fill="url(#bg${id})"/><g filter="url(#soft)">${bokeh}</g><rect y="176" width="400" height="74" fill="url(#fl${id})"/><path d="M0 214 H400" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>`;
  }
  return `<rect width="400" height="250" fill="url(#bg${id})"/><rect y="150" width="400" height="100" fill="url(#fl${id})"/>`;
}
function interiorSVG(c) {
  return `<defs><linearGradient id="dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2c30"/><stop offset="1" stop-color="#0e0f11"/></linearGradient>
      <linearGradient id="ws" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa4b5"/><stop offset=".6" stop-color="#c9d3d6"/><stop offset="1" stop-color="#6f7b62"/></linearGradient>
      <radialGradient id="screen" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2d4152"/><stop offset="1" stop-color="#0f171f"/></radialGradient>
      <linearGradient id="trim" x1="0" x2="1"><stop offset="0" stop-color="${shade(c, -0.2)}" stop-opacity=".2"/><stop offset=".5" stop-color="${shade(c, 0.25)}"/><stop offset="1" stop-color="${shade(c, -0.2)}" stop-opacity=".2"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>
    <rect width="400" height="250" fill="#0d0e10"/>
    <path d="M30 14 H370 Q382 14 379 26 L360 118 H40 L21 26 Q18 14 30 14 Z" fill="url(#ws)" filter="url(#soft)"/>
    <path d="M0 108 Q200 86 400 108 V250 H0 Z" fill="url(#dash)"/>
    <path d="M0 128 Q200 108 400 128" stroke="url(#trim)" stroke-width="2.5" fill="none"/>
    <rect x="150" y="136" width="72" height="44" rx="6" fill="#050607"/><rect x="155" y="141" width="62" height="34" rx="3" fill="url(#screen)"/>
    <path d="M162 166 L176 156 L188 162 L204 150" stroke="#9fb8c9" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
    <circle cx="258" cy="146" r="13" fill="#060708" stroke="#2c2f34" stroke-width="1.5"/><circle cx="302" cy="146" r="13" fill="#060708" stroke="#2c2f34" stroke-width="1.5"/>
    <path d="M258 146 L265 140 M302 146 L295 139" stroke="#e8e8e8" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="280" cy="198" r="54" fill="none" stroke="#141518" stroke-width="12"/><circle cx="280" cy="198" r="54" fill="none" stroke="#3a3d42" stroke-width="1" stroke-dasharray="2 4"/>
    <path d="M226 198 H334 M280 198 V250" stroke="#141518" stroke-width="11"/><circle cx="280" cy="198" r="15" fill="#1b1c1f"/>
    <rect x="58" y="146" width="56" height="8" rx="4" fill="#16171a"/><rect x="58" y="160" width="56" height="8" rx="4" fill="#16171a"/>`;
}
function vehicleSVG(v, variant) {
  const c = v.color || "#53575D"; const id = "x";
  const two = TWO_WHEEL.has(v.type);
  const kinds = two ? ["studio", "street", "dark", "studio2"] : ["studio", "street", "interior", "detail"];
  const kind = kinds[variant % kinds.length];
  if (kind === "interior") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">${interiorSVG(c)}</svg>`;
  const bgKind = kind === "street" ? "street" : kind === "dark" || kind === "detail" ? "dark" : "light";
  const light = lum(c) > 0.62;
  const defs = `<defs>${backdrop(bgKind, id)}
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c, light ? 0.35 : 0.42)}"/><stop offset=".16" stop-color="${shade(c, light ? 0.12 : 0.16)}"/><stop offset=".5" stop-color="${c}"/><stop offset=".8" stop-color="${shade(c, -0.28)}"/><stop offset="1" stop-color="${shade(c, -0.55)}"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity="${bgKind === "light" ? 0.28 : 0.18}"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="skirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a434d"/><stop offset=".45" stop-color="#151a20"/><stop offset="1" stop-color="#07090b"/></linearGradient>
    <linearGradient id="glassRef" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="tyre" cx="50%" cy="45%" r="55%"><stop offset=".7" stop-color="#1f2023"/><stop offset=".92" stop-color="#121214"/><stop offset="1" stop-color="#2c2d31"/></radialGradient>
    <linearGradient id="tyreS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2d31"/><stop offset="1" stop-color="#0f0f11"/></linearGradient>
    <radialGradient id="rim" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f5f6f7"/><stop offset=".55" stop-color="#b7bcc3"/><stop offset="1" stop-color="#6b7078"/></radialGradient>
    <linearGradient id="rimS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8eaed"/><stop offset="1" stop-color="#7d838b"/></linearGradient>
    <linearGradient id="spokex" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef0f2"/><stop offset="1" stop-color="#8f959d"/></linearGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0f1f3"/><stop offset=".5" stop-color="#9aa0a7"/><stop offset="1" stop-color="#5b6067"/></linearGradient>
    <linearGradient id="engine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4d53"/><stop offset="1" stop-color="#1c1d20"/></linearGradient>
    <linearGradient id="lamp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfd8e0"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="tail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d2312b"/><stop offset="1" stop-color="#6e1311"/></linearGradient>
    <filter id="blur" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="blur2" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
  let veh;
  if (two) veh = twoWheeler(v.type, c, shade(c, -0.35));
  else {
    const s = SHAPES[v.type] || SHAPES.car;
    veh = `<clipPath id="cb"><path d="${s.body}"/></clipPath>
      <path d="${s.body}" fill="url(#paint)"/>
      <g clip-path="url(#cb)"><rect x="0" y="0" width="400" height="250" fill="url(#sheen)"/><rect x="0" y="150" width="400" height="48" fill="url(#skirt)"/>${s.wheels.map(([x, r]) => `<circle cx="${x}" cy="${200 - r}" r="${r + 5}" fill="#0b0c0d"/>`).join("")}</g>
      <g fill="url(#glass)">${s.win}</g><g fill="url(#glassRef)" opacity=".9">${s.win}</g>
      ${s.rails ? `<rect x="140" y="82" width="134" height="5" rx="2.5" fill="#1d1e21"/>` : ""}
      <path d="${s.belt}" stroke="#fff" stroke-opacity="${bgKind === "light" ? 0.5 : 0.28}" stroke-width="1.3" filter="url(#blur2)"/>
      <path d="${s.seams}" stroke="#000" stroke-opacity=".28" stroke-width="1"/>
      ${s.handles.map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="3.4" rx="1.7" fill="#000" opacity=".35"/>`).join("")}
      <path d="M${s.mirror[0]} ${s.mirror[1]} l9 -1 l2 7 l-10 1 z" fill="${shade(c, -0.3)}"/>
      <path d="${s.head}" fill="url(#lamp)"/><path d="${s.tail}" fill="url(#tail)"/>
      ${s.wheels.map(([x, r]) => wheelSVG(x, r, "x")).join("")}`;
  }
  const shadowOp = bgKind === "light" ? 0.38 : 0.7;
  const ground = `<ellipse cx="200" cy="201" rx="${two ? 120 : 168}" ry="9" fill="#000" opacity="${shadowOp}" filter="url(#blur)"/>${two ? "" : (SHAPES[v.type] || SHAPES.car).wheels.map(([x]) => `<ellipse cx="${x}" cy="200" rx="22" ry="3" fill="#000" opacity="${shadowOp + 0.15}" filter="url(#blur2)"/>`).join("")}`;
  const flip = kind === "street" || kind === "studio2";
  let g = `<g${flip ? ' transform="translate(400 0) scale(-1 1)"' : ""}>${ground}${veh}</g>`;
  if (kind === "detail") { const w = (SHAPES[v.type] || SHAPES.car).wheels[1]; g = `<g transform="translate(${200 - w[0] * 2.1} ${125 - (200 - w[1]) * 2.1}) scale(2.1)">${ground}${veh}</g>`; }
  const spot = bgKind === "light" ? "" : `<ellipse cx="200" cy="40" rx="180" ry="60" fill="#fff" opacity=".05" filter="url(#soft)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">${defs}${scene(bgKind, id)}${spot}${g}</svg>`;
}
function artURL(v, i) {
  const key = `${v.type}|${v.color}|${i}`;
  let u = ART.get(key);
  if (!u) {
    const svg = vehicleSVG(v, i);
    try { u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); } catch (e) { u = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
    ART.set(key, u);
  }
  return u;
}
function vehiclePhotos(v) {
  const ups = (v.photos || []).filter(Boolean);
  if (ups.length) return ups;
  return [0, 1, 2, 3].map(i => artURL(v, i));
}
function isRender(v) { return !(v.photos || []).some(Boolean); }
function coverURL(v) { return v ? vehiclePhotos(v)[0] : ""; }
const BRAND_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0B5D3B"/><path d="M11.5 23V9.5h5.6a4 4 0 0 1 0 8h-5.6M16.6 17.5l4.6 5.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9.5" r="1.6" fill="#E9C46A"/></svg>';
