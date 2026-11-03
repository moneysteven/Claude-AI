// Mobile action bar: hide on scroll down / show on scroll up, hide while a
// form field is focused (never covers inputs). Owns the call sheet
// ('callsheet:open' event or [data-callsheet-open] clicks).
import { modal } from "../header/dialog.js";
import { openStatus } from "../../lib/hours.js";

export default function initMobilebar(ctx) {
  const bar = document.querySelector("[data-mbar]");
  const dlg = document.getElementById("callsheet");
  if (!bar || !dlg) return;

  // 1. Scroll direction
  let lastY = window.scrollY, ticking = false, scrollHidden = false, kbHidden = false;
  const apply = () => bar.classList.toggle("is-hidden", scrollHidden || kbHidden);
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY, dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      scrollHidden = dy > 0 && y > 160;
      lastY = y;
      apply();
    });
  }, { passive: true });

  // 2. Hide while any field is focused (on-screen keyboard)
  const isField = (el) => el?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), select, textarea");
  document.addEventListener("focusin", (e) => { kbHidden = isField(e.target); apply(); });
  document.addEventListener("focusout", (e) => { if (!isField(e.relatedTarget)) { kbHidden = false; apply(); } });

  // 3. Call sheet
  const status = dlg.querySelector("[data-csheet-status]");
  const sheet = modal(dlg, ctx, {
    panel: dlg.querySelector(".csheet__panel"),
    from: { y: 60 },
    onOpen: () => {
      // TODO(business): hours are one set for all branches until per-branch hours are confirmed.
      const s = openStatus(ctx.B.hours);
      status.textContent = s.label;
      status.classList.toggle("is-open", s.open);
    },
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-callsheet-open]");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation(); // keep motion.js from scrolling to the no-JS fallback (#branches)
    sheet.open();
  }, true);
  window.addEventListener("callsheet:open", () => sheet.open());
}
