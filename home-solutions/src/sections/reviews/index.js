// Section 09 behaviour: review carousel on top of native scroll-snap.
//  - prev/next buttons step one card (disabled at the ends, hidden if nothing overflows)
//  - mouse drag-to-scroll (touch/pen use native swipe), snaps on release
//  - ←/→ on the focused track step one card; Home/End jump to the ends
//  - trackpad sideways swipes are kept away from Lenis (vertical wheel still smooth-scrolls the page)
export default function init(ctx) {
  const root = document.getElementById("reviews");
  const track = root?.querySelector(".rev-track");
  if (!track) return;
  const { reduced } = ctx;
  const cards = [...track.querySelectorAll(".rev-card")];
  const controls = root.querySelector("[data-rev-controls]");
  const prev = root.querySelector("[data-rev-prev]");
  const next = root.querySelector("[data-rev-next]");
  const behavior = reduced ? "auto" : "smooth";

  const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
  const go = (dir) => track.scrollBy({ left: dir * step(), behavior });

  function update() {
    const max = track.scrollWidth - track.clientWidth;
    controls.hidden = max <= 4;
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft >= max - 4;
  }
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  let raf = 0;
  track.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(update).observe(track);
  update();

  track.addEventListener("keydown", (e) => {
    if (e.target !== track) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { e.preventDefault(); track.scrollTo({ left: 0, behavior }); }
    else if (e.key === "End") { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior }); }
  });

  // Horizontal-dominant wheel/trackpad gestures: native scroll, hidden from Lenis.
  track.addEventListener("wheel", (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.stopPropagation(); }, { passive: true });

  // Mouse drag (touch scrolls natively).
  let down = false, x0 = 0, s0 = 0, moved = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    down = true; moved = false; x0 = e.clientX; s0 = track.scrollLeft;
  });
  track.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - x0;
    if (!moved && Math.abs(dx) > 4) { moved = true; track.classList.add("is-drag"); try { track.setPointerCapture(e.pointerId); } catch {} }
    if (moved) track.scrollLeft = s0 - dx;
  });
  const end = () => {
    if (!down) return;
    down = false;
    if (!moved) return;
    // Re-enable snapping from the dragged position, then settle on the nearest card.
    const left = track.scrollLeft;
    track.classList.remove("is-drag");
    track.scrollLeft = left;
    // A short drag (>= 1/5 card, max 80px) moves one card in the drag direction; the
    // target is clamped to the real scroll range (when the last card is only partly
    // hidden, rounding by card width alone would snap a valid drag straight back).
    const st = step(), max = track.scrollWidth - track.clientWidth, delta = left - s0;
    const i0 = s0 >= max - 4 ? Math.ceil(max / st) : Math.round(s0 / st); // at the end: the last "page"
    const i = Math.abs(delta) >= Math.min(80, st * 0.2) ? i0 + Math.sign(delta) : i0;
    track.scrollTo({ left: Math.max(0, Math.min(i * st, max)), behavior });
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  track.addEventListener("lostpointercapture", end);
  // Swallow the click that ends a drag so text selection/links don't fire.
  track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}
