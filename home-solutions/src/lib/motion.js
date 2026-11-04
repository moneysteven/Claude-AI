// Motion system (BRIEF §5): Lenis smooth scroll synced to GSAP ScrollTrigger,
// shared reveal helper, lazy section videos, and reduced-motion handling.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, Flip);

export { gsap, ScrollTrigger, Flip };

export const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const saveData = typeof navigator !== "undefined" && !!navigator.connection?.saveData;
export const finePointer = typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches;

export const EASE = { out: "power3.out", ui: "power2.out", big: "power4.inOut" };

let lenis = null;
export const getLenis = () => lenis;

export function initMotion() {
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // Same-page anchors go through Lenis (header offset handled by scroll-margin in CSS).
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").length < 2) return;
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    scrollToEl(target);
    history.replaceState(null, "", a.getAttribute("href"));
  });
  initReveals(document);
  initLazyVideos(document);
}

export function scrollToEl(el, offset = -72) {
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.2 });
  else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  // Move focus for keyboard/screen-reader users without a second jump.
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * Elements with [data-reveal] rise 24px + fade in at top 85%, once.
 * [data-reveal-stagger] reveals its direct children with a 0.07s stagger.
 * Reduced motion: instant opacity only.
 */
export function initReveals(root) {
  root.querySelectorAll("[data-reveal]").forEach((el) => {
    if (reduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, clearProps: "transform", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
  });
  root.querySelectorAll("[data-reveal-stagger]").forEach((el) => {
    const kids = [...el.children];
    if (reduced) { gsap.set(kids, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(kids, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, stagger: 0.07, clearProps: "transform", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
  });
}

/**
 * <video data-lazy> elements: sources live in data-src until the video nears
 * the viewport; they pause when off-screen. Reduced motion / Save-Data keep
 * the poster only.
 */
export function initLazyVideos(root) {
  const vids = [...root.querySelectorAll("video[data-lazy]")];
  if (reduced || saveData || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting) {
        if (!v.dataset.loaded) {
          v.querySelectorAll("source[data-src]").forEach((s) => { s.src = s.dataset.src; });
          v.load(); v.dataset.loaded = "1";
        }
        v.play().catch(() => {});
      } else if (v.dataset.loaded) v.pause();
    }
  }, { rootMargin: "300px 0px" });
  // Hold section videos until the site intro has handed over (one video at a
  // time keeps phones' in-app browsers well inside their memory limits).
  const html = document.documentElement;
  if (html.classList.contains("intro-on")) {
    const mo = new MutationObserver(() => {
      if (!html.classList.contains("intro-on")) { mo.disconnect(); vids.forEach((v) => io.observe(v)); }
    });
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
  } else vids.forEach((v) => io.observe(v));
}

/** Soft "sunlight" that follows the cursor over [data-light] cards (desktop only). */
export function initCursorLight(root = document) {
  if (!finePointer || reduced) return;
  let raf = 0, last = null;
  root.addEventListener("pointermove", (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const card = last.target.closest?.("[data-light]");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--lx", `${last.clientX - r.left}px`);
      card.style.setProperty("--ly", `${last.clientY - r.top}px`);
    });
  }, { passive: true });
}
