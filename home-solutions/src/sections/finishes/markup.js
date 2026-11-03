// Section 03 Finishes: swatch switcher (BRIEF §4.03, §6.4).
// A sliding door + window composite drawn in SVG: separate <path> frame layers
// (fill inherits var(--frame)) set into a plaster wall, with glass panes that
// let the stock interior photo show through. Native radio inputs inside a
// role=radiogroup give arrow-key support for free; without JS a generated
// :has() stylesheet still recolours the frame (instantly). index.js tweens
// --frame with GSAP and crossfades the Wood grain / Anodised gradient layers.

/** Rectangular frame ring: outer box minus inner box (fill-rule evenodd). */
const ring = (x, y, w, h, t) =>
  `M${x} ${y}h${w}v${h}h${-w}Z M${x + t} ${y + t}v${h - 2 * t}h${w - 2 * t}v${-(h - 2 * t)}Z`;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;

// Geometry in a 1200×800 viewBox. Door opening 236..664 × 112..744, window
// opening 704..984 × 176..496. Mobile crops to the centre (x 200..1000).
const DOOR = { x: 236, y: 112, w: 428, h: 632, t: 20 };
const WIN = { x: 704, y: 176, w: 280, h: 320, t: 16 };

const FRAMES = [
  // [label, path]
  ["door-frame", ring(DOOR.x, DOOR.y, DOOR.w, DOOR.h, DOOR.t)],
  ["door-sash-left", ring(256, 132, 204, 592, 18)],
  ["door-sash-right", ring(440, 132, 204, 592, 18)],
  ["window-frame", ring(WIN.x, WIN.y, WIN.w, WIN.h, WIN.t)],
  ["window-sash-left", ring(720, 192, 130, 288, 12)],
  ["window-sash-right", ring(838, 192, 130, 288, 12)],
  ["window-sill", rect(692, 496, 304, 12)],
];
const GLASS = [
  [274, 150, 168, 556], [458, 150, 168, 556], // door panes
  [732, 204, 106, 264], [850, 204, 106, 264], // window panes
];

const tex = (name) => (/wood/i.test(name) ? "wood" : /anodi[sz]ed|alu/i.test(name) ? "alu" : "");

export default function finishes({ B, picture, sectionHead, btn, fmt }) {
  const { esc } = fmt;
  const { residential, commercial, swatches } = B.finishes;
  const names = Object.keys(swatches);
  const first = names[0];

  const where = (n) => {
    const r = residential.includes(n), c = commercial.includes(n);
    return r && c ? "residential and commercial" : r ? "residential" : c ? "commercial & curtain wall" : "";
  };

  const glass = GLASS.map(([x, y, w, h]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#fin-glass)"/>` +
    `<path d="M${x + 18} ${y + 70}l60 -60M${x + 18} ${y + 110}l96 -96" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round" fill="none"/>`).join("");

  const wall = `M0 0H1200V800H0Z ${rect(DOOR.x, DOOR.y, DOOR.w, DOOR.h)} ${rect(WIN.x, WIN.y, WIN.w, WIN.h)}`;

  const svg = `<svg class="fin-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="fin-svg-title" focusable="false">
  <title id="fin-svg-title">Sliding patio door and sliding window, shown in the selected frame finish</title>
  <defs>
    <linearGradient id="fin-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".30"/>
      <stop offset=".45" stop-color="#26A8E0" stop-opacity=".10"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".05"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".24"/>
    </linearGradient>
    <linearGradient id="fin-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBFAF8"/><stop offset=".85" stop-color="#F1EFEA"/><stop offset="1" stop-color="#E9E6E0"/>
    </linearGradient>
    <radialGradient id="fin-sun" cx=".3" cy=".25" r=".7">
      <stop offset="0" stop-color="#FFF7DE" stop-opacity=".7"/><stop offset="1" stop-color="#FFF7DE" stop-opacity="0"/>
    </radialGradient>
    <!-- Anodised: the brief's --alu-gradient (135deg) -->
    <linearGradient id="fin-alu" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F7F8FA"/><stop offset=".38" stop-color="#D9DEE4"/><stop offset=".52" stop-color="#FFFFFF"/>
      <stop offset=".70" stop-color="#C9CED6"/><stop offset="1" stop-color="#EEF0F3"/>
    </linearGradient>
    <!-- Wood: subtle grain drawn over the --frame base colour -->
    <pattern id="fin-wood" patternUnits="userSpaceOnUse" width="28" height="420">
      <path d="M4 0C8 90 1 190 6 280S3 380 5 420" stroke="#3B2314" stroke-opacity=".30" stroke-width="1.6" fill="none"/>
      <path d="M12 0C10 70 15 160 12 250S16 360 13 420" stroke="#C89A6E" stroke-opacity=".30" stroke-width="2.4" fill="none"/>
      <path d="M19 0C22 110 16 210 21 300S18 390 20 420" stroke="#3B2314" stroke-opacity=".18" stroke-width="1" fill="none"/>
      <path d="M25 0C24 60 27 150 24 240S27 350 25 420" stroke="#5E3A22" stroke-opacity=".22" stroke-width="1.3" fill="none"/>
    </pattern>
  </defs>
  ${glass}
  <path d="${wall}" fill="url(#fin-wall)" fill-rule="evenodd"/>
  <path d="${wall}" fill="url(#fin-sun)" fill-rule="evenodd"/>
  <path d="M0 744H1200V800H0Z" fill="#E6E1D9"/>
  <path d="M0 744H1200" stroke="#D6D0C6" stroke-width="2"/>
  <use href="#fin-geom" class="fin-shadow" transform="translate(7 9)"/>
  <g class="fin-frames" fill-rule="evenodd">
    <g id="fin-geom">
      ${FRAMES.map(([k, d]) => `<path class="fin-frame" data-part="${k}" d="${d}"/>`).join("\n      ")}
    </g>
  </g>
  <use href="#fin-geom" class="fin-tex fin-tex--wood" fill="url(#fin-wood)" fill-rule="evenodd"/>
  <use href="#fin-geom" class="fin-tex fin-tex--alu" fill="url(#fin-alu)" fill-rule="evenodd"/>
  <rect x="447" y="396" width="7" height="76" rx="3.5" fill="#2A3038" opacity=".85"/>
  <rect x="842" y="318" width="5" height="34" rx="2.5" fill="#2A3038" opacity=".8"/>
</svg>`;

  // No-JS fallback: CSS recolours instantly from the checked radio.
  const noJsCss = names.map((n) => {
    const t = tex(n);
    return `html:not(.js) .fin:has(.fin-sw__input[value="${n}"]:checked) .fin-stage{--frame:${swatches[n]}}` +
      (t ? `html:not(.js) .fin:has(.fin-sw__input[value="${n}"]:checked) .fin-tex--${t}{opacity:${t === "alu" ? 0.8 : 1}}` : "");
  }).join("");

  const swatch = (n, i) => {
    const t = tex(n);
    return `<label class="fin-sw${t ? ` fin-sw--${t}` : ""}" style="--sw:${swatches[n]}">
          <input class="fin-sw__input" type="radio" name="fin-finish" value="${esc(n)}" data-color="${swatches[n]}" data-tex="${t}" data-where="${esc(where(n))}"${i === 0 ? " checked" : ""}>
          ${i === 0 ? '<span class="fin-ring" aria-hidden="true"></span>' : ""}<span class="fin-sw__dot" aria-hidden="true"></span>
          <span class="fin-sw__name">${esc(n)}</span>
        </label>`;
  };

  const note = `Residential: ${residential.join(", ")}. Commercial &amp; curtain wall: ${commercial.join(", ")}.`;

  return `<section id="finishes" class="section fin" aria-labelledby="fin-title">
  <style>${noJsCss}</style>
  <div class="container">
    ${sectionHead({
      num: "03",
      eyebrow: "Finishes",
      title: "Choose your frame finish",
      id: "fin-title",
      intro: "Tap a finish to see it on a sliding patio door and window.",
    })}
    <div class="fin-layout">
      <figure class="fin-stage" style="--frame:${swatches[first]}" data-reveal>
        <div class="fin-photo" aria-hidden="true">${picture("photo-interior-living-sliding-doors-pool", {
          alt: "",
          sizes: "(min-width: 1024px) 860px, 100vw",
          imgClass: "fin-photo__img",
        })}</div>
        ${svg}
      </figure>

      <div class="fin-panel glass" data-light data-reveal>
        <p class="fin-panel__label" id="fin-sw-label">Frame finish</p>
        <div class="fin-swatches" role="radiogroup" aria-labelledby="fin-sw-label">
        ${names.map(swatch).join("\n        ")}
        </div>
        <p class="fin-current" aria-live="polite" data-fin-info><strong data-fin-name>${esc(first)}</strong><span data-fin-where>${where(first) ? `: available for ${esc(where(first))} frames.` : ""}</span></p>
        <hr class="hairline">
        <p class="fin-note">${note}</p>
        ${btn("Quote in this finish", { href: "#quote", variant: "glass", attrs: "data-fin-quote" })}
      </div>
    </div>
  </div>
</section>`;
}
