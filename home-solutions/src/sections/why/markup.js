// Section 05 "Why aluminium or uPVC: Hurricane · Security · Energy" (BRIEF §4.05, §6.7).
// Build-time markup. Facts come ONLY from BUSINESS (B) or the brief's own §4.05 table.
// No impact ratings / wind-load claims: hurricane line is exactly "Ask us about storm-ready options."
// index.js enhances: frosted glass strips over each table row clear row by row on scroll,
// scrubbed parallax on the side image, section number drift.

const ICON = {
  lock: `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="7" y="14" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 14v-3.5a5 5 0 0 1 10 0V14" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="20" r="1.8" fill="currentColor"/><path d="M16 21.5v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  wave: `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M3 12c3 0 3-2.5 6.5-2.5S13 12 16 12s3-2.5 6.5-2.5S26 12 29 12M3 19c3 0 3-2.5 6.5-2.5S13 19 16 19s3-2.5 6.5-2.5S26 19 29 19M3 26c3 0 3-2.5 6.5-2.5S13 26 16 26s3-2.5 6.5-2.5S26 26 29 26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  quiet: `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="11" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 3v2M11 17v2M3 11h2M17 11h2M5.3 5.3l1.4 1.4M15.3 15.3l1.4 1.4M5.3 16.7l1.4-1.4M15.3 6.7l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 19v8M24.5 21v4M28 22.5v1M17.5 21v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  storm: `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M9 21a6 6 0 1 1 1.6-11.8A8 8 0 0 1 26 12a5 5 0 0 1-1 9.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 18l-3 5h5l-3 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg class="why-check" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.4l3.2 3.2L17 8.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ask: `<svg class="why-check why-check--ask" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/></svg>`,
};

export default function why(ctx) {
  const { B, picture, sectionVideo, sectionHead, btn, fmt } = ctx;
  const { esc } = fmt;

  // Facts pulled from BUSINESS so they stay in sync with the catalogue.
  const prod = (id) => B.products.find((p) => p.id === id);
  const heavy = prod("upvc-heavy");
  const lockSpec = (heavy?.spec || "").split(",")[0].trim() || "Multi-point lock + deadbolt";
  const heavyName = heavy?.name || "Exterior Heavy Series Swing Door";
  // Railing posts: "316 marine-grade stainless" (B.products railing spec, BRIEF §4.05).
  const rail316 = /316 marine-grade/i.test(prod("railing")?.spec || "");
  const finishes = [...new Set([...(B.finishes?.residential || []), ...(B.finishes?.commercial || [])])];

  // Frame sizes (2¼" aluminium, 3⅛" uPVC) are from BRIEF §4.05 / config.js product comments.
  // TODO(business): confirm frame depths per series before launch (L-Series is 3", Heavy Series door 2.625").
  const cards = [
    {
      photo: "frame-door-lock", pos: "50% 92%",
      alt: "Close-up of a deadbolt lock with keys in a bronze-framed door, a Home Solutions installation",
      icon: ICON.lock, label: "Security", stat: esc(lockSpec), unit: "",
      text: `On our uPVC ${esc(heavyName)}.`,
    },
    {
      photo: "frame-balcony-sea", pos: "50% 34%",
      alt: "Frameless glass balcony railing on steel posts overlooking a white house and the sea, a Home Solutions installation",
      icon: ICON.wave, label: "Coastal", stat: rail316 ? "316" : "", unit: rail316 ? "marine-grade stainless" : "",
      text: `uPVC is coastal-weather and termite resistant${rail316 ? ", and our frameless glass railings stand on 316 marine-grade stainless posts" : ""}.`,
    },
    {
      photo: "frame-upvc-window-blind", pos: "50% 58%",
      alt: "White uPVC sliding window with a roller blind above it, a Home Solutions installation",
      icon: ICON.quiet, label: "Energy &amp; quiet", stat: "3⅛″", unit: "uPVC frame",
      text: "uPVC is energy efficient, with sound insulation built into the thicker frame.",
    },
  ];

  // Crops for 364x740 portrait stills: pos = desktop square thumb, posM = mobile 4:3 strip (arM overrides the ratio),
  // zoom/origin = desktop-only zoom onto a detail (frame-bronze-door: the bronze jamb, lock and lever, not the glass reflection).
  // BRIEF §4.05 comparison table: exact 7 rows. pick:null = "Ask us" (not a material pick).
  const rows = [
    { photo: "frame-balcony-sea-2", pos: "50% 32%", posM: "50% 30%", alt: "Glass balcony railing on a coastal home with the sea beyond, a Home Solutions installation", cat: "Salt air / coastal", pick: "uPVC", why: "Coastal-weather resistant, won’t corrode" },
    { photo: "frame-building-grid-windows", pos: "50% 45%", posM: "50% 26%", alt: "White grid-pattern windows set in a rendered two-storey building, a Home Solutions installation", cat: "Termites", pick: "uPVC", why: "Termite resistant" },
    { photo: "photo-bedroom-floor-to-ceiling-windows", pos: "50% 50%", posM: "50% 50%", alt: "Bright bedroom with floor-to-ceiling windows", cat: "Energy &amp; noise", pick: "uPVC", why: "Thicker 3⅛″ frame, energy efficient, sound insulating" },
    { photo: "frame-glass-french-doors", pos: "50% 48%", posM: "50% 14%", arM: "1 / 1", alt: "White-framed glass French doors standing open, a Home Solutions installation", cat: "Slim sightlines / large glass", pick: "Aluminium", why: "Slim 2¼″ frames, maximum glass area" },
    { photo: "project-storefront-glazing", pos: "50% 35%", posM: "50% 25%", alt: "Glazed commercial storefront, a Home Solutions installation", cat: "Commercial storefronts &amp; curtain wall", pick: "Aluminium", why: "Storefront &amp; curtain wall systems" },
    { photo: "frame-bronze-door", pos: "50% 88%", posM: "50% 8%", zoom: 2, origin: "24% 80%", alt: "Bronze-finish aluminium door frame with frosted glass and a lever handle, a Home Solutions installation", cat: "Finish options", pick: "Aluminium", why: esc(finishes.join(", ")) },
    // Brief says "Prices TBC per size": TBC is never shown, so it reads "Price on request".
    // TODO(business): confirm pricing approach for aluminium vs uPVC.
    { photo: "frame-measuring-profile", pos: "50% 28%", posM: "50% 34%", alt: "Hand measuring a Home Solutions branded frame profile with a tape measure and pencil", cat: "Budget", pick: null, why: "Priced per size: price on request" },
  ];

  // Photos: client's own job stills (frame-* are 364px portrait, so boxes stay <= ~420px wide) + one stock image.
  const card = (c) => `<li class="why-card glass" data-light>
    <div class="why-card__media" style="--pos:${c.pos}">${picture(c.photo, { alt: c.alt, sizes: "(min-width: 768px) 30vw, 420px", className: "why-card__pic", imgClass: "why-card__img" })}</div>
    <span class="why-card__icon">${c.icon}</span>
    <p class="why-card__label">${c.label}</p>
    <p class="why-card__stat">${c.stat ? `<span class="why-card__num">${c.stat}</span>` : ""}${c.unit ? `<span class="why-card__unit">${c.unit}</span>` : ""}</p>
    <p class="why-card__text">${c.text}</p>
  </li>`;

  // Row header holds only the category name (it is re-announced on every cell), so the photo lives in the
  // "Why" cell. CSS places it beside the category on desktop and first in the card on mobile.
  const row = (r, i) => `<tr class="why-row" style="--i:${i}">
          <th scope="row" class="why-row__cat"><span class="why-frost" aria-hidden="true"></span><span class="why-row__name">${r.cat}</span></th>
          <td class="why-row__pick"><span class="why-pick${r.pick ? "" : " why-pick--ask"}">${r.pick ? ICON.check : ICON.ask}<span>${r.pick || "Ask us"}</span></span></td>
          <td class="why-row__why"><span class="why-thumb" style="--pos:${r.pos};--pos-m:${r.posM}${r.arM ? `;--ar-m:${r.arM}` : ""}${r.zoom ? `;--zoom:${r.zoom};--origin:${r.origin}` : ""}">${picture(r.photo, { alt: r.alt, sizes: "(min-width: 768px) 72px, 340px", className: "why-thumb__pic", imgClass: "why-thumb__img" })}</span><span class="why-row__reason">${r.why}</span></td>
        </tr>`;

  return `<section id="why" class="section why" aria-labelledby="why-title">
  <div class="why__bg" aria-hidden="true">
    <div class="why__bg-stick">
      ${sectionVideo("band-security", { poster: "photo-modern-house-exterior-glazing", className: "bg-video why__video" })}
      <div class="why__wash"></div>
    </div>
  </div>
  <div class="container">
    <div class="why__top">
      <div class="why__lead">
        ${sectionHead({
          num: "05",
          eyebrow: "Hurricane · Security · Energy",
          title: "Why aluminium or uPVC",
          intro: "Two frame systems, each with its own strengths. Here is where each one shines, so you can choose with confidence for your home or business.",
          id: "why-title",
        })}
        <div class="why-storm glass" data-reveal>
          <span class="why-storm__icon">${ICON.storm}</span>
          <div class="why-storm__copy">
            <p class="why-storm__label">Hurricane season</p>
            <p class="why-storm__text">Ask us about storm-ready options.</p>
          </div>
          ${btn("Book a free site visit", { href: "#contact", variant: "primary", attrs: "data-booking-open", className: "why-storm__btn" })}
        </div>
      </div>
      <figure class="why__side" data-reveal>
        <div class="why__side-frame">
          ${picture("photo-sheer-curtains-open-patio", { alt: "Sheer white curtains drawn back from open glass patio doors onto a sunny terrace", sizes: "(min-width: 1024px) 40vw, 100vw", className: "why__side-pic", imgClass: "why__side-img" })}
        </div>
      </figure>
    </div>

    <ul class="why-cards" role="list" data-reveal-stagger>
      ${cards.map(card).join("\n      ")}
    </ul>

    <div class="why-compare glass" data-reveal>
      <table class="why-table">
        <caption class="why-table__cap">
          <span class="why-table__title">Aluminium or uPVC? The best pick for each need</span>
          <span class="why-table__note">Each row shows our recommended material.</span>
        </caption>
        <thead>
          <tr><th scope="col">Category</th><th scope="col">Best pick</th><th scope="col">Why</th></tr>
        </thead>
        <tbody>
        ${rows.map(row).join("\n        ")}
        </tbody>
      </table>
    </div>
  </div>
</section>`;
}
