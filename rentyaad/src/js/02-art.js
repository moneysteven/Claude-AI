/* ============ sample vehicle illustrations (generated SVG; no external images) ============ */
const ART = new Map();
function shade(hex, amt) {
  let c = String(hex || "#888").replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const n = parseInt(c, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function wheelSVG(cx, r) {
  const cy = 200 - r;
  let spokes = "";
  for (let k = 0; k < 5; k++) { const a = (k * 72) * Math.PI / 180; spokes += `<path d="M${cx} ${cy}L${(cx + Math.cos(a) * r * 0.5).toFixed(1)} ${(cy + Math.sin(a) * r * 0.5).toFixed(1)}" stroke="#7d848e" stroke-width="${(r * 0.12).toFixed(1)}" stroke-linecap="round"/>`; }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#18181b"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.6).toFixed(1)}" fill="#c9ced6"/>${spokes}<circle cx="${cx}" cy="${cy}" r="${(r * 0.16).toFixed(1)}" fill="#eef0f3"/>`;
}
const SHAPES = {
  car: {
    body: "M58 184 L58 160 Q60 147 76 144 L120 139 L156 111 Q164 104 177 104 L250 104 Q263 104 271 113 L301 139 L331 143 Q346 146 346 161 L346 184 Z",
    win: '<path d="M129 139 L160 114 L206 114 L206 139 Z"/><path d="M214 114 L249 114 Q257 114 263 121 L282 139 L214 139 Z"/>',
    lines: d => `<path d="M210 142 V182" stroke="${d}" stroke-width="2"/><rect x="226" y="150" width="16" height="4" rx="2" fill="${d}"/><rect x="166" y="150" width="16" height="4" rx="2" fill="${d}"/>`,
    head: [332, 150, 14, 9], tail: [58, 150, 9, 12], wheels: [[115, 25], [290, 25]],
  },
  suv: {
    body: "M50 186 L50 152 Q50 139 64 137 L96 133 L120 97 Q126 88 138 88 L276 88 Q289 88 296 98 L320 133 L338 137 Q353 140 353 156 L353 186 Z",
    win: '<path d="M131 131 L148 98 L202 98 L202 131 Z"/><path d="M210 98 L271 98 Q280 98 284 106 L301 131 L210 131 Z"/>',
    lines: d => `<rect x="140" y="81" width="134" height="6" rx="3" fill="#2a2a2e"/><path d="M206 134 V182" stroke="${d}" stroke-width="2"/><rect x="222" y="146" width="18" height="4" rx="2" fill="${d}"/><rect x="160" y="146" width="18" height="4" rx="2" fill="${d}"/><rect x="50" y="170" width="303" height="9" rx="4" fill="#2a2a2e" opacity=".5"/>`,
    head: [338, 146, 15, 10], tail: [50, 146, 9, 14], wheels: [[112, 28], [292, 28]],
  },
  van: {
    body: "M46 186 L46 110 Q46 72 84 70 L298 70 Q317 70 326 86 L352 136 Q357 145 357 158 L357 186 Z",
    win: '<rect x="62" y="84" width="68" height="42" rx="7"/><rect x="138" y="84" width="70" height="42" rx="5"/><rect x="216" y="84" width="70" height="42" rx="5"/><path d="M294 84 H316 Q323 85 327 93 L345 128 H294 Z"/>',
    lines: d => `<path d="M212 132 V182" stroke="${d}" stroke-width="2"/><rect x="140" y="133" width="140" height="3" rx="1.5" fill="${d}" opacity=".7"/><rect x="190" y="146" width="16" height="4" rx="2" fill="${d}"/>`,
    head: [341, 148, 15, 10], tail: [46, 148, 8, 16], wheels: [[112, 26], [300, 26]],
  },
  bus: {
    body: "M28 188 L28 76 Q28 58 48 58 L338 58 Q358 58 363 76 L372 126 L374 188 Z",
    win: '<rect x="44" y="72" width="42" height="42" rx="5"/><rect x="92" y="72" width="42" height="42" rx="5"/><rect x="140" y="72" width="42" height="42" rx="5"/><rect x="188" y="72" width="42" height="42" rx="5"/><rect x="236" y="72" width="42" height="42" rx="5"/><rect x="290" y="74" width="26" height="54" rx="3"/><path d="M326 70 H350 Q356 70 358 78 L366 126 H326 Z"/>',
    lines: d => `<rect x="28" y="130" width="346" height="8" fill="#FED100"/><rect x="28" y="138" width="346" height="6" fill="#009B3A"/><rect x="286" y="70" width="34" height="114" rx="3" fill="none" stroke="${d}" stroke-width="2"/>`,
    head: [360, 152, 14, 10], tail: [28, 150, 8, 18], wheels: [[92, 27], [312, 27]],
  },
  pickup: {
    body: "M42 186 L42 134 L150 134 L150 128 L170 96 Q175 89 184 89 L246 89 Q257 89 263 98 L285 132 L334 138 Q351 141 351 158 L351 186 Z",
    win: '<path d="M176 128 L190 99 L226 99 L226 128 Z"/><path d="M233 99 L252 99 Q259 99 263 106 L276 128 L233 128 Z"/>',
    lines: d => `<rect x="42" y="130" width="110" height="6" rx="2" fill="${d}"/><path d="M152 138 V182" stroke="${d}" stroke-width="2"/><rect x="236" y="144" width="16" height="4" rx="2" fill="${d}"/>`,
    head: [336, 148, 15, 10], tail: [42, 142, 8, 14], wheels: [[100, 27], [292, 27]],
  },
  bike: {
    custom: (c, d) => `
      <circle cx="118" cy="162" r="34" fill="none" stroke="#18181b" stroke-width="11"/><circle cx="118" cy="162" r="23" fill="none" stroke="#a7adb5" stroke-width="2.5"/><circle cx="118" cy="162" r="6" fill="#8d939b"/>
      <circle cx="290" cy="162" r="34" fill="none" stroke="#18181b" stroke-width="11"/><circle cx="290" cy="162" r="23" fill="none" stroke="#a7adb5" stroke-width="2.5"/><circle cx="290" cy="162" r="6" fill="#8d939b"/>
      <path d="M118 162 L176 120 L240 120" stroke="${d}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M176 122 L206 162 L240 122" stroke="${d}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M140 152 H222" stroke="#b9bec6" stroke-width="7" stroke-linecap="round"/>
      <path d="M290 162 L262 92" stroke="#4a4f57" stroke-width="7" stroke-linecap="round"/>
      <path d="M180 113 Q198 90 236 96 L246 118 L182 122 Z" fill="${c}"/>
      <path d="M126 110 Q150 98 188 106 L184 118 L130 120 Z" fill="#222327"/>
      <path d="M248 92 Q276 94 282 122 L258 124 Z" fill="${c}"/>
      <circle cx="275" cy="104" r="7" fill="#FFF3C4"/>
      <path d="M250 84 L278 78" stroke="#222327" stroke-width="6" stroke-linecap="round"/>
      <path d="M100 118 Q118 110 134 116" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="98" cy="118" r="4" fill="#E5483F"/>`,
  },
  scooter: {
    custom: (c, d) => `
      <path d="M90 170 Q88 124 140 122 L192 122 Q206 122 208 138 L208 160 L96 172 Z" fill="${c}"/>
      <path d="M112 118 Q142 104 192 114 L190 124 L114 126 Z" fill="#222327"/>
      <rect x="196" y="156" width="74" height="12" rx="6" fill="${d}"/>
      <path d="M256 168 L262 108 Q265 92 278 90 L288 90 L282 122 L276 168 Z" fill="${c}"/>
      <path d="M268 88 L296 82" stroke="#222327" stroke-width="6" stroke-linecap="round"/>
      <circle cx="288" cy="101" r="6" fill="#FFF3C4"/><circle cx="92" cy="140" r="4" fill="#E5483F"/>
      ${wheelSVG(130, 24)}${wheelSVG(286, 24)}
      <path d="M260 160 Q286 142 312 162" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  },
};
function palmSVG(x, flip) {
  const leaves = [-168, -140, -112, -70, -40, -12, 18, 160].map(a => `<ellipse cx="62" cy="92" rx="28" ry="6.5" transform="rotate(${a} 34 92)"/>`).join("");
  return `<g transform="translate(${x} 0)${flip ? " translate(70 0) scale(-1 1)" : ""}"><path d="M14 196 Q18 140 34 92" stroke="#7B5B3A" stroke-width="8" fill="none" stroke-linecap="round"/><g fill="#2F8F5B">${leaves}</g><circle cx="36" cy="96" r="4" fill="#6B4A2A"/><circle cx="30" cy="99" r="4" fill="#6B4A2A"/></g>`;
}
function roadSVG(col = "#45494f") { return `<rect x="0" y="188" width="400" height="44" fill="${col}"/><path d="M0 211 H400" stroke="#F5F5F5" stroke-width="3" stroke-dasharray="20 16" opacity=".8"/><rect x="0" y="186" width="400" height="3" fill="#FED100" opacity=".9"/>`; }
function sceneSVG(kind) {
  switch (kind) {
    case "sunset":
      return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8A5B"/><stop offset=".7" stop-color="#FFD39A"/></linearGradient></defs>
        <rect width="400" height="250" fill="url(#sk)"/><circle cx="96" cy="118" r="34" fill="#FFF1C9" opacity=".95"/>
        <rect x="0" y="136" width="400" height="44" fill="#D9774F"/><path d="M40 150 H120 M180 160 H260 M300 148 H370" stroke="#F7B48A" stroke-width="3" stroke-linecap="round" opacity=".8"/>
        <rect x="0" y="176" width="400" height="74" fill="#E3B98A"/>${palmSVG(318, true)}${roadSVG("#3d3a3c")}`;
    case "hills":
      return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD0F4"/><stop offset="1" stop-color="#EFF8FF"/></linearGradient></defs>
        <rect width="400" height="250" fill="url(#sk)"/><ellipse cx="300" cy="50" rx="34" ry="9" fill="#fff" opacity=".85"/><ellipse cx="90" cy="70" rx="26" ry="7" fill="#fff" opacity=".7"/>
        <path d="M0 150 L50 112 L104 134 L170 90 L236 126 L300 96 L360 118 L400 104 L400 200 L0 200 Z" fill="#5E8FA8" opacity=".75"/>
        <path d="M0 172 Q70 128 150 160 T300 150 T400 156 V200 H0 Z" fill="#3E8E5A"/>
        <g fill="#2C6E43"><circle cx="40" cy="168" r="12"/><circle cx="60" cy="172" r="10"/><circle cx="360" cy="160" r="12"/></g>${roadSVG()}`;
    case "night":
      return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1A3A"/><stop offset="1" stop-color="#2E4377"/></linearGradient></defs>
        <rect width="400" height="250" fill="url(#sk)"/><circle cx="318" cy="56" r="16" fill="#F4F1DE"/><circle cx="324" cy="52" r="14" fill="#16244a"/>
        <g fill="#fff" opacity=".8"><circle cx="40" cy="30" r="1.4"/><circle cx="120" cy="56" r="1.2"/><circle cx="210" cy="24" r="1.5"/><circle cx="260" cy="70" r="1.1"/><circle cx="370" cy="96" r="1.3"/><circle cx="80" cy="96" r="1"/></g>
        <rect x="0" y="138" width="400" height="44" fill="#13305A"/><path d="M60 156 H140 M220 164 H300" stroke="#F4F1DE" stroke-width="2" opacity=".35"/>
        <rect x="0" y="176" width="400" height="74" fill="#3A3A4A"/>${palmSVG(20)}${roadSVG("#2b2c33")}`;
    default:
      return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC8F8"/><stop offset="1" stop-color="#E3F4FF"/></linearGradient></defs>
        <rect width="400" height="250" fill="url(#sk)"/><circle cx="330" cy="54" r="22" fill="#FFE27A"/>
        <ellipse cx="200" cy="44" rx="38" ry="9" fill="#fff" opacity=".85"/><ellipse cx="226" cy="38" rx="22" ry="8" fill="#fff" opacity=".85"/>
        <rect x="0" y="138" width="400" height="42" fill="#19A7C9"/><path d="M30 152 H110 M170 162 H250 M290 150 H380" stroke="#8EE0F0" stroke-width="3" stroke-linecap="round"/>
        <rect x="0" y="176" width="400" height="74" fill="#F1DCA7"/>${palmSVG(16)}${roadSVG()}`;
  }
}
function interiorSVG(c) {
  return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC8F8"/><stop offset="1" stop-color="#E3F4FF"/></linearGradient></defs>
    <rect width="400" height="250" fill="#1b1d22"/>
    <path d="M34 18 H366 Q378 18 375 30 L356 122 H44 L25 30 Q22 18 34 18 Z" fill="url(#sk)"/>
    <path d="M44 122 L356 122 L356 108 Q200 96 44 108 Z" fill="#19A7C9"/>
    <path d="M140 122 L192 70 L208 70 L262 122 Z" fill="#55595f"/><path d="M200 74 V120" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/>
    ${palmSVG(46)}
    <path d="M0 114 Q200 92 400 114 V250 H0 Z" fill="#26292f"/>
    <path d="M0 134 Q200 114 400 134" stroke="${c}" stroke-width="5" fill="none" opacity=".9"/>
    <rect x="150" y="142" width="70" height="42" rx="7" fill="#0b0c0e"/><rect x="156" y="148" width="58" height="30" rx="4" fill="#173a55"/>
    <path d="M162 170 L176 158 L188 166 L206 152" stroke="#5ac8fa" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="258" cy="150" r="13" fill="#0e0f11" stroke="#3a3f47" stroke-width="2"/><circle cx="302" cy="150" r="13" fill="#0e0f11" stroke="#3a3f47" stroke-width="2"/>
    <path d="M258 150 L265 144 M302 150 L295 143" stroke="#ff9f0a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="280" cy="196" r="54" fill="none" stroke="#101114" stroke-width="13"/><path d="M226 196 H334 M280 196 V250" stroke="#101114" stroke-width="12"/><circle cx="280" cy="196" r="15" fill="#1a1b1e"/>
    <circle cx="280" cy="196" r="6" fill="${c}"/>
    <rect x="60" y="150" width="54" height="10" rx="5" fill="#1a1c20"/><rect x="60" y="166" width="54" height="10" rx="5" fill="#1a1c20"/>`;
}
function vehicleSVG(v, variant) {
  const c = v.color || "#2F6FD6"; const d = shade(c, -0.38); const well = shade(c, -0.62);
  const two = TWO_WHEEL.has(v.type);
  const kinds = two ? ["beach", "sunset", "night", "hills"] : ["beach", "sunset", "interior", "hills"];
  const kind = kinds[variant % kinds.length];
  let inner;
  if (kind === "interior") inner = interiorSVG(c);
  else {
    const s = SHAPES[v.type] || SHAPES.car; let veh;
    if (s.custom) veh = s.custom(c, d);
    else {
      const [hx, hy, hw, hh] = s.head, [tx, ty, tw, th] = s.tail;
      veh = `<defs><clipPath id="cb"><path d="${s.body}"/></clipPath><linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6076"/><stop offset="1" stop-color="#18222e"/></linearGradient><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <path d="${s.body}" fill="${c}"/><path d="${s.body}" fill="url(#sh)"/>
        <g fill="url(#gl)">${s.win}</g>${s.lines(d)}
        <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="3" fill="#FFF3C4"/><rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="3" fill="#E5483F"/>
        <g clip-path="url(#cb)">${s.wheels.map(([x, r]) => `<circle cx="${x}" cy="${200 - r}" r="${r + 5}" fill="${well}"/>`).join("")}</g>
        ${s.wheels.map(([x, r]) => wheelSVG(x, r)).join("")}`;
    }
    const shadow = `<ellipse cx="200" cy="201" rx="${two ? 125 : 165}" ry="7" fill="#000" opacity=".25"/>`;
    inner = sceneSVG(kind) + `<g${kind === "sunset" ? ' transform="translate(400 0) scale(-1 1)"' : ""}>${shadow}${veh}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
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
  const gen = [0, 1, 2, 3].map(i => artURL(v, i));
  return ups.length ? ups.concat(gen.slice(0, Math.max(1, 4 - ups.length))) : gen;
}
function coverURL(v) { return v ? vehiclePhotos(v)[0] : ""; }
const BRAND_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" fill="#121212"/><path d="M0 0H32L16 16Z M0 32H32L16 16Z" fill="#009B3A"/><path d="M0 0L32 32M32 0L0 32" stroke="#FED100" stroke-width="5"/></svg>';
