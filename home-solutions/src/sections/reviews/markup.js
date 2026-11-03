// Section 09 "Reviews" (BRIEF §4.09).
// Build-time markup: glass review cards from BUSINESS.reviews.quotes in a native
// horizontal scroll-snap track (works without JS, touch-swipe native).
// index.js enhances: prev/next buttons, mouse drag, arrow-key card stepping.
//
// TODO(business): the quotes are Google reviews as shown on wanderlog.com — get the business's OK
// (and ideally the reviewers' first names) before publishing.
// TODO(business): B.reviews.googleRating (3.9) / googleCount (63) are NOT shown because they are not
// confirmed current. Re-check on Google before launch; only then consider displaying them.

const GOOGLE_QUERY = "Home Solutions & Hardware Ltd Negril";

export default function reviews(ctx) {
  const { B, sectionHead, stars, btn, fmt } = ctx;
  const { esc, monthYear } = fmt;
  const quotes = B.reviews?.quotes || [];
  if (!quotes.length) return ""; // never render placeholder testimonials

  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(GOOGLE_QUERY)}`;

  const card = (q) => `<li class="rev-card glass" data-light>
        <figure class="rev-fig">
          ${stars(q.stars)}
          <blockquote class="rev-quote"><p>${esc(q.text)}</p></blockquote>
          <figcaption class="rev-meta">
            <span class="rev-author">${esc(q.author)}</span>
            <span class="rev-dot" aria-hidden="true">·</span>
            <time datetime="${esc(q.date)}">${esc(monthYear(q.date))}</time>
            <span class="rev-src">Google review</span>
          </figcaption>
        </figure>
      </li>`;

  const arrow = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `<section id="reviews" class="section section--light rev" aria-labelledby="rev-title">
  <div class="container">
    <div class="rev-top">
      ${sectionHead({
        num: "09",
        eyebrow: "Reviews",
        title: "Kind words from customers",
        intro: "A few of the reviews customers have left for us on Google.",
        id: "rev-title",
      })}
      <div class="rev-controls" data-rev-controls hidden>
        <button type="button" class="icon-btn rev-btn" data-rev-prev aria-controls="rev-track" aria-label="Previous review">${arrow("M15 5l-7 7 7 7")}</button>
        <button type="button" class="icon-btn rev-btn" data-rev-next aria-controls="rev-track" aria-label="Next review">${arrow("M9 5l7 7-7 7")}</button>
      </div>
    </div>
  </div>
  <div id="rev-track" class="rev-track" role="region" aria-roledescription="carousel" aria-label="Customer reviews (scroll sideways for more)" tabindex="0" data-reveal>
    <ul class="rev-list" role="list">
      ${quotes.map(card).join("\n      ")}
    </ul>
  </div>
  <div class="container">
    <p class="rev-more" data-reveal>
      ${btn("Read reviews on Google", { href: googleUrl, variant: "link", arrow: true, attrs: 'target="_blank" rel="noopener"' })
        .replace("</span>", '<span class="visually-hidden"> (opens in a new tab)</span></span>')}
    </p>
  </div>
</section>`;
}
