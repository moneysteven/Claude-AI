// Section 05 behaviour (BRIEF §6.7): frosted glass strips over each comparison
// row slide away and fade out row by row as the table scrolls in (opacity +
// transform only, never filter). Plus ±6% scrubbed parallax on the side photo
// and a slow drift on the section number. Reduced motion: no strips, no motion.
export default function init(ctx) {
  const root = document.getElementById("why");
  if (!root) return;
  const { gsap, reduced, EASE } = ctx;
  if (reduced) return; // content is fully visible without the strips

  const strips = [...root.querySelectorAll(".why-frost")];
  const table = root.querySelector(".why-table");
  if (strips.length && table) {
    root.classList.add("is-frost");
    // Scrubbed: each row clears in turn between the table entering and its middle reaching mid-screen.
    const tl = gsap.timeline({
      defaults: { ease: EASE.ui },
      scrollTrigger: { trigger: table, start: "top 80%", end: "bottom 55%", scrub: 0.6 },
    });
    strips.forEach((s, i) => {
      tl.fromTo(s, { opacity: 1, xPercent: 0 }, { opacity: 0, xPercent: 14, duration: 1 }, i * 0.45);
    });
    // Once fully clear, drop the strips from rendering (no backdrop cost while scrolling).
    let gone = false;
    tl.eventCallback("onUpdate", () => {
      const done = tl.progress() >= 1;
      if (done !== gone) { gone = done; strips.forEach((s) => (s.style.visibility = done ? "hidden" : "")); }
    });
  }

  const img = root.querySelector(".why__side-img");
  if (img) {
    gsap.fromTo(img, { yPercent: -6, scale: 1.14 }, {
      yPercent: 6, ease: "none",
      scrollTrigger: { trigger: root.querySelector(".why__side-frame"), start: "top bottom", end: "bottom top", scrub: true },
    });
  }

  const num = root.querySelector("[data-drift]");
  if (num) {
    gsap.fromTo(num, { yPercent: 20 }, {
      yPercent: -20, ease: "none",
      scrollTrigger: { trigger: num.closest(".section-head"), start: "top bottom", end: "bottom top", scrub: true },
    });
  }
}
