// Section 02 "What we make": Catalogue (BRIEF §4.02, §6.6, §7).
// Build-time markup: every product is real HTML (all visible without JS).
// index.js enhances: filter pills + sliding thumb (Flip), "See all" expansion,
// category tile shortcuts, Add-to-quote buttons.

const TILE_PHOTOS = {
  windows: "photo-bedroom-floor-to-ceiling-windows",
  doors: "photo-patio-doors-garden",
  showers: "photo-glass-shower-modern-bathroom",
  railings: "photo-modern-house-glass-balconies",
  blinds: "photo-roller-blinds-kitchen",
  commercial: "photo-commercial-glass-facade",
};

// TODO(business): supply product photos for items without `img` (they show an SVG line illustration until then).
// TODO(business): supply spec lines for products without `spec` (no spec line is shown rather than inventing one).
// TODO(business): confirm current JMD prices (archived Feb 2025) and prices for every "Price on request" item.
export const FIRST = 8; // cards shown before "See all"

const PLUS = `<svg class="cat-add__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path class="cat-add__plus" d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="cat-add__check" d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function catalogue(ctx) {
  const { B, picture, imageInfo, sectionVideo, sectionHead, btn, fmt, icons } = ctx;
  const { esc } = fmt;
  const products = B.products;
  const catLabel = Object.fromEntries(fmt.CATEGORIES.map((c) => [c.id, c.label]));
  const countOf = (id) => products.filter((p) => p.cat === id).length;
  const cats = fmt.CATEGORIES.filter((c) => countOf(c.id) > 0);
  const plural = (n) => `${n} product${n === 1 ? "" : "s"}`;

  // p.img is "/assets/own/product-x.jpg" -> manifest name "product-x"
  const imgName = (p) => (p.img ? p.img.split("/").pop().replace(/\.[a-z0-9]+$/i, "") : null);

  const media = (p) => {
    const name = imgName(p);
    if (name && imageInfo(name)) {
      // 300×300 originals: shown at ≤300px CSS on a white studio tile, never upscaled.
      return picture(name, { alt: `${p.name}, product photo`, sizes: "(min-width: 640px) 300px, 112px", className: "cat-card__pic", imgClass: "cat-card__img" });
    }
    return icons.productIcon(icons.iconTypeFor(p), { size: 120, className: "cat-card__icon" });
  };

  const card = (p) => `<li class="cat-card" data-cat="${esc(p.cat)}" data-id="${esc(p.id)}">
  <article class="cat-card__inner" data-light aria-labelledby="cat-n-${esc(p.id)}">
    <span class="cat-card__ring" aria-hidden="true"></span>
    <div class="cat-card__media${imgName(p) ? " cat-card__media--photo" : ""}">${media(p)}</div>
    <div class="cat-card__body">
      <p class="cat-card__meta">${p.material ? `<span class="cat-card__tag">${esc(p.material)}</span>` : ""}<span class="cat-card__cat">${esc(catLabel[p.cat] || p.cat)}</span></p>
      <h3 class="cat-card__name" id="cat-n-${esc(p.id)}">${esc(p.name)}</h3>
      ${p.spec ? `<p class="cat-card__spec">${esc(p.spec)}</p>` : ""}
      <div class="cat-card__foot">
        <p class="cat-card__price${typeof p.priceJMD === "number" ? " is-priced tnum" : ""}">${esc(fmt.priceLabel(p))}</p>
        <button type="button" class="cat-add" data-add="${esc(p.id)}">${PLUS}<span class="cat-add__label">Add<span class="visually-hidden"> ${esc(p.name)}</span> to quote</span></button>
      </div>
    </div>
  </article>
</li>`;

  const pill = (id, label, n, on) =>
    `<button type="button" class="cat-pill" data-filter="${id}" aria-pressed="${on}">${on ? '<span class="cat-thumb" aria-hidden="true"></span>' : ""}<span class="cat-pill__label">${esc(label)}</span><span class="cat-pill__count tnum" aria-hidden="true">${n}</span><span class="visually-hidden">, ${plural(n)}</span></button>`;

  const tile = (c) => `<li class="cat-tile">
  <a class="cat-tile__link" href="#cat-filters" data-cat-tile="${c.id}">
    <span class="cat-tile__media">${picture(TILE_PHOTOS[c.id], { alt: "", sizes: "(min-width: 1200px) 220px, (min-width: 768px) 33vw, 50vw", imgClass: "cat-tile__img" })}</span>
    <span class="cat-tile__text"><span class="cat-tile__label">${esc(c.label)}</span><span class="cat-tile__count">${plural(countOf(c.id))}</span></span>
    <span class="cat-tile__go" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </a>
</li>`;

  const first = products.slice(0, FIRST), rest = products.slice(FIRST);

  return `<section id="products" class="section cat" aria-labelledby="cat-title" data-first="${FIRST}">
  <div class="cat-band">
    <div class="cat-band__media" aria-hidden="true">${sectionVideo("band-windows", { poster: "photo-window-wall-natural-light", className: "bg-video cat-band__video" })}</div>
    <div class="cat-band__wash" aria-hidden="true"></div>
    <div class="container cat-band__inner">
      <div class="cat-band__panel glass">
        ${sectionHead({
          num: "02",
          eyebrow: "Windows & Doors",
          title: "What we make",
          id: "cat-title",
          intro: "Aluminium and uPVC windows and doors, steel and wrought-iron doors, frameless glass showers and railings, and shades and blinds. For commercial, domestic and industrial projects.",
        })}
      </div>
    </div>
  </div>

  <div class="container cat-body">
    <h3 class="visually-hidden">Browse by category</h3>
    <ul class="cat-tiles" role="list" data-reveal-stagger>
      ${cats.map(tile).join("\n")}
    </ul>

    <div class="cat-filters" id="cat-filters" tabindex="-1">
      <div class="cat-pills" role="group" aria-label="Filter products by category">
        ${pill("all", "All", products.length, true)}
        ${cats.map((c) => pill(c.id, c.label, countOf(c.id), false)).join("\n        ")}
      </div>
      <p class="cat-status" role="status" aria-live="polite" aria-atomic="true">All ${plural(products.length)} shown</p>
    </div>

    <div class="cat-results" id="cat-grid">
      <ul class="cat-grid cat-grid--first" role="list">
        ${first.map(card).join("\n")}
      </ul>
      <div class="cat-more" id="cat-more">
        <div class="cat-more__inner">
          <ul class="cat-grid cat-grid--rest" role="list">
            ${rest.map(card).join("\n")}
          </ul>
        </div>
      </div>
    </div>

    <div class="cat-after">
      <button type="button" class="btn btn--glass cat-toggle" aria-controls="cat-grid" aria-expanded="false" hidden><span class="btn__label">See all ${products.length} products</span><svg class="cat-toggle__chev" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      ${btn("Get a quote", { href: "#quote", variant: "primary" })}
    </div>
    <p class="cat-source">Prices: ${esc(B.priceSource)}</p>
    <p class="visually-hidden" aria-live="polite" data-cat-live></p>
  </div>
</section>`;
}
