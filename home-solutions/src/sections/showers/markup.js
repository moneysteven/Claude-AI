// Section 08 "Showers & Glass" feature band (BRIEF §4.08).
// Build-time markup. Every spec is read from BUSINESS.products (cat "showers" / "railings");
// headline stats are parsed out of those spec strings and simply omitted if a spec changes.
// Background: lazy bathroom clip (poster photo-glass-shower-bathtub) under a bright white wash.
// index.js enhances: "Add to quote" buttons (hidden without JS) and inset parallax.

export default function showers(ctx) {
  const { B, picture, imageInfo, sectionVideo, sectionHead, btn, fmt } = ctx;
  const { esc, priceLabel } = fmt;

  const list = B.products.filter((p) => p.cat === "showers" || p.cat === "railings");
  const byId = (id) => B.products.find((p) => p.id === id);
  const screen = byId("shower-screen")?.spec || "";
  const sliding = byId("shower-sliding")?.spec || "";
  const railing = byId("railing")?.spec || "";

  // Headline stats: only when the fact is present in config.
  const stats = [];
  const glass = screen.match(/(\d+\s?mm)\s+laminated glass/i);
  if (glass) stats.push({ big: glass[1].replace(/\s/g, ""), small: "laminated glass" });
  if (/stainless rollers/i.test(sliding)) stats.push({ big: "Stainless", small: "rollers on sliding doors" });
  if (/316 marine-grade/i.test(railing)) stats.push({ big: "316", small: "marine-grade stainless railing posts" });
  const maxPanel = railing.match(/(\d+\s?ft)\s+max/i);
  if (maxPanel) stats.push({ big: maxPanel[1], small: "max railing glass panel" });

  // Spec string -> chips ("a, b; c" -> ["a","b","c"]); "brushed" stays with its noun.
  const specItems = (s) => s.split(/;\s*/).flatMap((part) => part.split(/,(?!\s*brushed\b)\s*/i)).map((x) => x.trim()).filter(Boolean);

  const thumb = (p) => {
    const name = p.img ? p.img.split("/").pop().replace(/\.[a-z]+$/i, "") : null;
    if (!name || !imageInfo(name)) return `<span class="shw-prod__thumb shw-prod__thumb--empty" aria-hidden="true"></span>`;
    return `<span class="shw-prod__thumb">${picture(name, { alt: "", sizes: "72px", className: "shw-prod__pic" })}</span>`;
  };

  const prod = (p) => `<li class="shw-prod">
        ${thumb(p)}
        <div class="shw-prod__body">
          <h3 class="shw-prod__name">${esc(p.name)}</h3>
          ${p.spec ? `<ul class="shw-prod__spec">${specItems(p.spec).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          <p class="shw-prod__price">${esc(priceLabel(p))}</p>
        </div>
        <button type="button" class="shw-add" data-shw-add="${esc(p.id)}" hidden>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span class="shw-add__label">Add<span class="visually-hidden"> ${esc(p.name)} to quote</span></span>
        </button>
      </li>`;

  return `<section id="showers" class="section shw" aria-labelledby="shw-title">
  <div class="shw-bg" aria-hidden="true">
    ${sectionVideo("band-showers", { poster: "photo-glass-shower-bathtub", className: "bg-video shw-video" })}
    <span class="shw-wash"></span>
  </div>
  <div class="container shw-grid">
    <div class="shw-panel glass" data-light>
      ${sectionHead({
        num: "08",
        eyebrow: "Showers & Glass",
        title: "Frameless glass, clear as daylight",
        intro: "Frameless glass shower screens and doors, plus glass railings on marine-grade stainless posts. Tell us your opening and we’ll price it for you.",
        id: "shw-title",
      })}
      ${stats.length ? `<ul class="shw-stats" role="list" data-reveal-stagger>
        ${stats.map((s) => `<li class="shw-stat"><span class="shw-stat__big tnum">${esc(s.big)}</span><span class="shw-stat__small">${esc(s.small)}</span></li>`).join("")}
      </ul>` : ""}
      <ul class="shw-prods" role="list" data-reveal-stagger>
      ${list.map(prod).join("\n      ")}
      </ul>
      <p class="shw-live visually-hidden" aria-live="polite" data-shw-live></p>
      <div class="shw-ctas">
        ${btn("Get a quote", { href: "#quote", variant: "primary" })}
        ${btn("Book a free site visit", { href: "#contact", variant: "glass", attrs: 'data-booking-open data-need="showers"' })}
      </div>
    </div>
    <figure class="shw-inset" data-reveal>
      <span class="shw-inset__frame">
        <span class="tag-inspo">Inspiration</span>
        ${picture("photo-frameless-corner-shower", { alt: "Modern bathroom with a frameless glass shower enclosure", sizes: "(min-width: 1024px) 480px, 100vw", className: "shw-inset__pic", imgClass: "shw-inset__img" })}
      </span>
      <figcaption class="shw-inset__cap">Inspiration photo. Ask us about frameless glass for your bathroom.</figcaption>
    </figure>
  </div>
</section>`;
}
