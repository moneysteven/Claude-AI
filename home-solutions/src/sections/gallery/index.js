// Section 07 behaviour: lightbox for the masonry gallery + subtle image parallax.
// Lightbox = native modal <dialog> (rest of page inert) with an explicit Tab
// wrap, ←/→/Home/End/Esc keys, pointer swipe, captions, counter, and focus
// returned to the tile that opened it. Lenis is paused while open.
export default function init(ctx) {
  const root = document.getElementById("projects");
  const dlg = root?.querySelector(".gal-lb");
  if (!root || !dlg || typeof dlg.showModal !== "function") return; // no <dialog>: links open the image
  const { gsap, reduced, EASE, getLenis } = ctx;
  const links = [...root.querySelectorAll(".gal-link")];
  const img = dlg.querySelector("[data-lb-img]");
  const cap = dlg.querySelector("[data-lb-cap]");
  const tag = dlg.querySelector("[data-lb-tag]");
  const pos = dlg.querySelector("[data-lb-pos]");
  const stage = dlg.querySelector("[data-lb-stage]");
  let idx = 0, opener = null;

  function show(i, dir = 0) {
    idx = (i + links.length) % links.length;
    const a = links[idx];
    const swap = () => {
      img.removeAttribute("srcset");
      img.src = a.getAttribute("href");
      img.srcset = a.dataset.srcset;
      img.sizes = "(min-width: 1400px) 1400px, 100vw";
      img.width = +a.dataset.w; img.height = +a.dataset.h;
      img.alt = a.dataset.alt || "";
      cap.textContent = a.dataset.caption || "";
      tag.hidden = !a.dataset.inspo;
      pos.textContent = String(idx + 1);
    };
    if (!dir || reduced) { swap(); if (dir && reduced) gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.2 }); return; }
    gsap.to(img, { opacity: 0, x: -24 * dir, duration: 0.18, ease: EASE.ui, onComplete: () => {
      swap();
      gsap.fromTo(img, { opacity: 0, x: 24 * dir }, { opacity: 1, x: 0, duration: 0.35, ease: EASE.ui });
    } });
  }

  function open(i) {
    opener = links[i];
    show(i);
    dlg.showModal();
    getLenis()?.stop();
    document.documentElement.style.overflow = "hidden";
    dlg.querySelector("[data-lb-close]").focus();
    if (!reduced) gsap.fromTo(dlg.querySelector(".gal-lb__fig"), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.45, ease: EASE.out });
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener("close", () => {
    getLenis()?.start();
    document.documentElement.style.overflow = "";
    gsap.set(img, { clearProps: "opacity,transform" });
    opener?.focus({ preventScroll: true });
  });

  links.forEach((a, i) => a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
    e.preventDefault();
    open(i);
  }));
  dlg.querySelector("[data-lb-close]").addEventListener("click", close);
  dlg.querySelector("[data-lb-prev]").addEventListener("click", () => show(idx - 1, -1));
  dlg.querySelector("[data-lb-next]").addEventListener("click", () => show(idx + 1, 1));
  // Click on the empty area around the photo closes.
  stage.addEventListener("click", (e) => { if (e.target === stage && !swiped) close(); });

  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1, -1); }
    else if (e.key === "Home") { e.preventDefault(); show(0, -1); }
    else if (e.key === "End") { e.preventDefault(); show(links.length - 1, 1); }
    else if (e.key === "Tab") {
      // Focus trap (the modal dialog already makes the page inert; keep Tab cycling inside).
      const f = [...dlg.querySelectorAll("button:not([disabled])")];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    // Esc: native dialog "cancel" -> close event restores focus.
  });

  // Swipe (touch + pen + mouse drag) on the stage.
  let x0 = null, y0 = 0, swiped = false;
  stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; swiped = false; });
  stage.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; show(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); }
  });
  stage.addEventListener("pointercancel", () => { x0 = null; });

  // Parallax: photos drift ±6% inside their tiles (scrubbed, linear by design).
  const imgs = root.querySelectorAll(".gal-img");
  if (reduced) { gsap.set(imgs, { scale: 1 }); return; }
  imgs.forEach((el) => {
    gsap.fromTo(el, { yPercent: -6 }, { yPercent: 6, ease: "none",
      scrollTrigger: { trigger: el.closest(".gal-link"), start: "top bottom", end: "bottom top", scrub: true } });
  });
  // Tiles have fixed aspect ratios, so lazy image loads never shift trigger positions.
}
