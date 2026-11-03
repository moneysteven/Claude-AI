// Section 07 "Projects gallery" (BRIEF §4.07).
// Build-time markup: a CSS-columns masonry grid. Every tile is a real link to a
// large rendition of the photo, so the gallery works without JS; index.js turns
// the links into a lightbox (<dialog>, keyboard ←/→/Esc, swipe, focus trap,
// captions, counter, focus returned to the tile).
//
// Captions: only the brief's captions + honest generic ones for our own photos.
// Never invent locations, clients or dates.
// TODO(business): supply more real project photos (with permission to publish, location/type
// of job) to replace the Inspiration stock tiles over time.
// TODO(business): confirm the West Isle images may be published as a Home Solutions project
// (gate and house images are architectural renders, captioned as such).

const OWN = [
  { img: "project-west-isle-aerial", caption: "West Isle housing development", alt: "Aerial view of the West Isle housing development under construction, rows of new single-storey homes surrounded by trees", shape: "wide" },
  { img: "project-storefront-glazing", caption: "Commercial storefront glazing", alt: "Bright yellow building with a long run of white-framed glass doors and windows opening onto a lawn", shape: "tall" },
  { img: "project-west-isle-house-render", caption: "West Isle, render", alt: "Architectural render of a single-storey West Isle house with sliding windows and a glazed side door", shape: "" },
  { img: "project-kitchen-interior", caption: "Kitchen interior", alt: "Bright white kitchen with a breakfast bar, bubble-glass pendant lights and a window over the sink", shape: "tall" },
  { img: "project-west-isle-gate", caption: "West Isle development, gate (render)", alt: "Architectural render of the West Isle entrance with a black horizontal-slat sliding gate and gatehouse", shape: "" },
];

// Clearly-labelled inspiration stock (Pexels). Not our installs: tagged "Inspiration".
const INSPO = [
  { img: "photo-modern-house-exterior-glazing", alt: "Modern house with panoramic windows and full-height glass doors opening onto a courtyard lawn", shape: "" },
  { img: "photo-frameless-corner-shower", alt: "Modern bathroom with a frameless glass shower enclosure", shape: "tall" },
  { img: "photo-terrace-glass-doors-railing", alt: "Contemporary seaside house with large glass doors and an ocean view", shape: "" },
  { img: "photo-commercial-curtain-wall", alt: "Close-up of a modern glass curtain-wall facade with reflections", shape: "tall" },
  { img: "photo-glass-shower-modern-bathroom", alt: "Minimalist bathroom with a glass-walled shower beside a vanity and mirror", shape: "" },
  { img: "photo-caribbean-hillside-villa", alt: "Tropical hillside villas with a private pool near the beach", shape: "wide" },
];

export default function gallery(ctx) {
  const { B, picture, imgSrc, imageInfo, sectionHead, btn, fmt } = ctx;
  const { esc } = fmt;
  const sizes = "(min-width: 1024px) 400px, (min-width: 600px) 50vw, 100vw";

  // Interleave own work with inspiration so the masonry reads naturally,
  // keeping our own photos first in each pair.
  const items = [];
  const n = Math.max(OWN.length, INSPO.length);
  for (let i = 0; i < n; i++) {
    if (OWN[i]) items.push({ ...OWN[i], inspo: false });
    if (INSPO[i]) items.push({ ...INSPO[i], inspo: true });
  }

  const tile = (it, i) => {
    const info = imageInfo(it.img);
    const srcset = info.widths.map((w) => `/img/${it.img}-${w}.webp ${w}w`).join(", ");
    // Lightbox caption: brief/honest caption for own work, "Inspiration" + description for stock.
    const lbCaption = it.inspo ? `Inspiration (stock photo): ${it.alt}` : it.caption;
    const label = it.inspo ? `Inspiration photo: ${it.alt}` : `${it.caption}: open larger photo`;
    return `<li class="gal-item${it.shape ? ` gal-item--${it.shape}` : ""}" data-reveal>
      <figure class="gal-fig">
        <a class="gal-link" href="${imgSrc(it.img, 1600)}" data-gal-index="${i}" data-srcset="${srcset}"
           data-w="${info.w}" data-h="${info.h}" data-caption="${esc(lbCaption)}" data-alt="${esc(it.alt)}"
           ${it.inspo ? 'data-inspo="1"' : ""} aria-label="${esc(label)}">
          ${it.inspo ? '<span class="tag-inspo" aria-hidden="true">Inspiration</span>' : ""}
          <span class="gal-media">
            ${picture(it.img, { alt: it.alt, sizes, className: "gal-pic", imgClass: "gal-img", attrs: 'draggable="false"' })}
          </span>
          <span class="gal-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </a>
        ${it.inspo ? "" : `<figcaption class="gal-cap">${esc(it.caption)}</figcaption>`}
      </figure>
    </li>`;
  };

  const ig = B.social?.instagram;
  const igHandle = ig ? "@" + ig.replace(/\/+$/, "").split("/").pop() : "";

  return `<section id="projects" class="section gal" aria-labelledby="gal-title">
  <div class="container">
    ${sectionHead({
      num: "07",
      eyebrow: "Projects",
      title: "Our work, and what’s possible",
      intro: "A look at jobs from our own files, alongside photos tagged “Inspiration” that show the kind of glass and frames we supply. Tap any photo to see it larger.",
      id: "gal-title",
    })}
    <ul class="gal-grid" role="list">
      ${items.map(tile).join("\n      ")}
    </ul>
    <p class="gal-note">Photos tagged “Inspiration” are stock imagery, not Home Solutions installs.</p>
    ${ig ? `<div class="gal-cta" data-reveal>
      ${btn(`See more on ${igHandle}`, { href: ig, variant: "glass", attrs: 'target="_blank" rel="noopener"', className: "gal-ig" })
        .replace("</span>", '<span class="visually-hidden"> (opens Instagram in a new tab)</span></span>')}
    </div>` : ""}
  </div>

  <dialog class="gal-lb" aria-labelledby="gal-lb-title" aria-describedby="gal-lb-cap">
    <h2 id="gal-lb-title" class="visually-hidden">Project photo viewer</h2>
    <div class="gal-lb__bar">
      <p class="gal-lb__count tnum" aria-live="polite"><span data-lb-pos>1</span> / <span data-lb-total>${items.length}</span></p>
      <button type="button" class="gal-lb__btn gal-lb__close" data-lb-close aria-label="Close photo viewer">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="gal-lb__stage" data-lb-stage>
      <figure class="gal-lb__fig">
        <span class="tag-inspo gal-lb__tag" data-lb-tag hidden>Inspiration</span>
        <img class="gal-lb__img" data-lb-img alt="" decoding="async" draggable="false">
        <figcaption id="gal-lb-cap" class="gal-lb__cap" data-lb-cap></figcaption>
      </figure>
    </div>
    <button type="button" class="gal-lb__btn gal-lb__nav gal-lb__prev" data-lb-prev aria-label="Previous photo">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" class="gal-lb__btn gal-lb__nav gal-lb__next" data-lb-next aria-label="Next photo">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </dialog>
</section>`;
}
