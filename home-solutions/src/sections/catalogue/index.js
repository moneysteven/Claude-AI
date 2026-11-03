// Section 02 Catalogue behaviour: filter pills with a sliding sky thumb (Flip),
// Flip-animated grid reflow, "See all / Show less" expansion (grid-rows 0fr→1fr
// container + staggered cards), category tile shortcuts, Add-to-quote.
export default function init(ctx) {
  const root = document.getElementById("products");
  if (!root) return;
  const { B, gsap, Flip, ScrollTrigger, reduced, EASE, quote, getLenis } = ctx;

  const FIRST = Number(root.dataset.first) || 8;
  const $ = (s) => root.querySelector(s);
  const gridA = $(".cat-grid--first"), gridB = $(".cat-grid--rest"), more = $(".cat-more");
  const toggle = $(".cat-toggle"), toggleLabel = toggle.querySelector(".btn__label");
  const status = $(".cat-status"), live = $("[data-cat-live]"), filters = $("#cat-filters");
  const pills = [...root.querySelectorAll(".cat-pill")];
  const thumb = $(".cat-thumb");
  const cards = [...root.querySelectorAll(".cat-card")]; // B.products order
  const byId = new Map(B.products.map((p) => [p.id, p]));
  const labelOf = (id) => pills.find((p) => p.dataset.filter === id)?.querySelector(".cat-pill__label").textContent || "";

  let filter = "all", expanded = false, seq = null, flip = null;

  const matchFor = (f) => cards.filter((c) => f === "all" || c.dataset.cat === f);
  const shownFor = (f, exp) => { const m = matchFor(f); return exp ? m : m.slice(0, FIRST); };
  const isShown = (c) => !c.hidden && (expanded || c.parentElement === gridA);

  /** Apply state to the DOM (no animation). */
  function layout() {
    const match = matchFor(filter);
    const extra = match.length > FIRST;
    if (!extra) expanded = false;
    cards.forEach((c) => { c.hidden = !match.includes(c); });
    match.forEach((c, i) => (i < FIRST ? gridA : gridB).appendChild(c));
    more.classList.toggle("is-open", expanded);
    toggle.hidden = !extra;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.classList.toggle("is-less", expanded);
    toggleLabel.textContent = expanded ? "Show less" : `See all ${match.length} products`;
    const shown = expanded ? match.length : Math.min(FIRST, match.length);
    const scope = filter === "all" ? "" : `${labelOf(filter)}: `;
    const msg = shown === match.length
      ? (match.length === 1 ? "1 product shown" : `all ${match.length} products shown`)
      : `${shown} of ${match.length} products shown`;
    status.textContent = scope ? scope + msg : msg[0].toUpperCase() + msg.slice(1);
  }

  const refresh = () => ScrollTrigger.refresh();
  more.addEventListener("transitionend", (e) => { if (e.target === more) refresh(); });

  function finish() {
    seq?.progress(1).kill(); seq = null;
    flip?.progress(1).kill(); flip = null;
    gsap.killTweensOf(cards);
    gsap.set(cards, { clearProps: "opacity,transform" });
  }

  /** Change state with motion: leaving cards fade, staying cards glide (Flip), new cards stagger in. */
  function update(next) {
    finish();
    const before = cards.filter(isShown);
    const after = shownFor(next.filter, next.expanded);
    filter = next.filter; expanded = next.expanded;
    if (reduced) { layout(); refresh(); return; }
    const leave = before.filter((c) => !after.includes(c));
    const stay = before.filter((c) => after.includes(c));
    const enter = after.filter((c) => !before.includes(c));
    seq = gsap.timeline();
    if (leave.length) seq.to(leave, { opacity: 0, scale: 0.96, duration: 0.22, ease: "power2.in" });
    seq.add(() => {
      const state = Flip.getState(stay);
      layout();
      if (leave.length) gsap.set(leave, { clearProps: "opacity,transform" });
      if (stay.length) flip = Flip.from(state, { duration: 0.6, ease: "power3.inOut", onComplete: refresh });
      if (enter.length) {
        gsap.fromTo(enter, { opacity: 0, y: 24 }, {
          opacity: 1, y: 0, duration: 0.7, ease: EASE.out, stagger: 0.06, delay: stay.length ? 0.18 : 0.05,
          clearProps: "opacity,transform", onComplete: refresh,
        });
      }
    });
  }

  function moveThumb(pill) {
    if (!thumb || thumb.parentElement === pill) return;
    const state = Flip.getState(thumb);
    pill.prepend(thumb);
    if (!reduced) Flip.from(state, { duration: 0.45, ease: "power3.inOut" });
  }

  function setFilter(f) {
    const pill = pills.find((p) => p.dataset.filter === f);
    if (!pill) return;
    pills.forEach((p) => p.setAttribute("aria-pressed", String(p === pill)));
    moveThumb(pill);
    if (f !== filter) update({ filter: f, expanded: false });
  }

  pills.forEach((p) => p.addEventListener("click", () => setFilter(p.dataset.filter)));

  // Category tiles: the link scrolls to #cat-filters (motion.js handles the
  // smooth scroll + focus); we select the matching filter.
  root.querySelectorAll("[data-cat-tile]").forEach((a) => a.addEventListener("click", () => setFilter(a.dataset.catTile)));

  toggle.addEventListener("click", () => {
    const collapsing = expanded;
    update({ filter, expanded: !expanded });
    if (collapsing && filters.getBoundingClientRect().top < 0) {
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(filters, { offset: -88, duration: 0.9 });
      else filters.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
  });

  // Add to quote ---------------------------------------------------------
  const announce = (msg) => { live.textContent = ""; requestAnimationFrame(() => { live.textContent = msg; }); };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    const p = byId.get(b.dataset.add);
    if (!p) return;
    quote.add({ productId: p.id, name: p.name, material: p.material || "", cat: p.cat, priceJMD: p.priceJMD, qty: 1 });
    const n = quote.count();
    announce(`${p.name} added to your quote. ${n} item${n === 1 ? "" : "s"} in your quote.`);
    const label = b.querySelector(".cat-add__label");
    if (!b.dataset.html) b.dataset.html = label.innerHTML;
    label.innerHTML = `Added<span class="visually-hidden"> ${p.name.replace(/[<&]/g, "")}</span>`;
    b.classList.add("is-added");
    if (!reduced) gsap.fromTo(b, { scale: 0.9 }, { scale: 1, duration: 0.45, ease: "back.out(3)", clearProps: "transform" });
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.classList.remove("is-added"); label.innerHTML = b.dataset.html; }, 1800);
  });

  // Initial enhanced state: 8 cards, toggle visible, status count.
  layout();

  // Scrubbed parallax (±6%) on tile photos and the band video.
  if (!reduced) {
    const para = (el, trigger) => gsap.fromTo(el, { yPercent: -6, scale: 1.14 }, {
      yPercent: 6, ease: "none", scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true },
    });
    root.querySelectorAll(".cat-tile__media img").forEach((img) => para(img, img.closest(".cat-tile")));
    const band = $(".cat-band__media");
    if (band) para(band, $(".cat-band"));
  }
}
