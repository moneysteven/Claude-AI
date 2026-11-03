// Header behaviour: glass/compact state after 40px, active nav link, quote
// basket badge ('quote:change'), mobile call -> 'callsheet:open', menu sheet.
import { modal } from "./dialog.js";

export default function initHeader(ctx) {
  const hdr = document.querySelector("[data-header]");
  if (!hdr) return;
  const { gsap, reduced, quote } = ctx;

  // 1. Scrolled state (transparent over hero -> frosted glass, 84 -> 64px)
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; hdr.classList.toggle("is-scrolled", window.scrollY > 40); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // 2. Active section in the centre nav
  const links = [...hdr.querySelectorAll(".hdr__link")];
  if ("IntersectionObserver" in window) {
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const a = byId.get(e.target.id);
        if (a && e.isIntersecting) { links.forEach((l) => l.removeAttribute("aria-current")); a.setAttribute("aria-current", "true"); }
        else if (a && !e.isIntersecting) a.removeAttribute("aria-current");
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  // 3. Quote basket badge
  const badge = hdr.querySelector("[data-hdr-count]");
  const basket = hdr.querySelector("[data-hdr-basket]");
  const setCount = (n, bump) => {
    badge.textContent = String(n);
    badge.hidden = !n;
    basket.setAttribute("aria-label", n ? `Your quote, ${n} item${n === 1 ? "" : "s"}` : "Your quote");
    if (bump && n && !reduced) gsap.fromTo(badge, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
  };
  setCount(quote.count(), false);
  window.addEventListener("quote:change", (e) => setCount(e.detail?.count ?? quote.count(), true));

  // 4. Call: on phones, open the "pick a branch" sheet (owned by mobilebar); desktop keeps tel:
  const small = matchMedia("(max-width: 767.98px)");
  document.querySelectorAll("[data-hdr-call]").forEach((a) => a.addEventListener("click", (e) => {
    if (!small.matches || !document.getElementById("callsheet")) return;
    e.preventDefault();
    if (sheet.isOpen()) { burger.focus({ preventScroll: true }); sheet.close(true); }
    window.dispatchEvent(new CustomEvent("callsheet:open"));
  }));

  // 5. Mobile menu sheet
  const dlg = document.getElementById("hdr-sheet");
  const burger = hdr.querySelector("[data-hdr-burger]");
  const sheet = modal(dlg, ctx, {
    panel: dlg.querySelector(".hdr-sheet__panel"),
    from: { x: 40 },
    onOpen: () => {
      burger.setAttribute("aria-expanded", "true");
      if (!reduced) gsap.fromTo(dlg.querySelectorAll(".hdr-sheet__links li, .hdr-sheet__actions > *"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: ctx.EASE.out, stagger: 0.05, delay: 0.08 });
    },
    onClose: () => burger.setAttribute("aria-expanded", "false"),
  });
  burger.addEventListener("click", () => sheet.open());
  // Links / booking CTA inside the sheet: close instantly, then let the
  // document-level handlers (anchor scroll, booking modal) do their work.
  // Capture phase: runs before the booking/call-sheet capture handlers and the
  // anchor-scroll handler in motion.js.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href^='#'], [data-booking-open]");
    if (!a || !dlg.contains(a) || !sheet.isOpen()) return;
    burger.focus({ preventScroll: true });
    sheet.setOpener(null);
    sheet.close(true);
  }, true);
  // Close the sheet if the viewport grows to desktop while it is open.
  matchMedia("(min-width: 1280px)").addEventListener?.("change", (m) => { if (m.matches) sheet.close(true); });
}
