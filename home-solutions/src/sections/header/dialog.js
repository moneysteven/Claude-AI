// Shared modal helper for the header menu sheet, the call sheet (mobilebar) and
// the booking modal. Uses native <dialog>.showModal(): the rest of the page is
// inert (focus stays inside), Esc fires "cancel". We add: animated open/close
// (transform + opacity only), Lenis/scroll lock, backdrop-click close, a Tab
// wrap (so focus cycles inside the panel), and focus return to the opener.

let locks = 0;
function lockScroll(ctx, on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  const l = ctx.getLenis?.();
  if (locks > 0) { l?.stop(); document.documentElement.style.overflow = "hidden"; }
  else { l?.start(); document.documentElement.style.overflow = ""; }
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

/**
 * modal(dialog, ctx, { panel, from = { y: 24 }, onOpen, onClose })
 *  -> { open(detail?), close(instant?), isOpen() }
 */
export function modal(dialog, ctx, { panel = dialog.firstElementChild, from = { y: 24 }, onOpen, onClose } = {}) {
  const { gsap, reduced } = ctx;
  let opener = null;
  let closing = false;

  function open(detail) {
    if (dialog.open) return;
    opener = document.activeElement;
    closing = false;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    lockScroll(ctx, true);
    onOpen?.(detail);
    gsap.killTweensOf(panel);
    if (reduced) gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.15 });
    else gsap.fromTo(panel, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, duration: 0.45, ease: ctx.EASE.out, clearProps: "transform" });
  }

  function finish() {
    if (dialog.open) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
    lockScroll(ctx, false);
    closing = false;
    onClose?.();
    const back = visible(opener) ? opener : null;
    back?.focus({ preventScroll: true });
    opener = null;
  }

  function close(instant = false) {
    if (!dialog.open || closing) return;
    closing = true;
    gsap.killTweensOf(panel);
    if (instant || reduced) { gsap.set(panel, { opacity: 1, clearProps: "transform" }); finish(); return; }
    gsap.to(panel, { opacity: 0, ...from, duration: 0.25, ease: ctx.EASE.ui, onComplete: () => { gsap.set(panel, { opacity: 1, clearProps: "transform" }); finish(); } });
  }

  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  // Click on the dialog itself (outside the panel) = backdrop click.
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...dialog.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  dialog.querySelectorAll("[data-dialog-close]").forEach((b) => b.addEventListener("click", () => close()));

  return { open, close, isOpen: () => dialog.open, setOpener: (el) => { opener = el; } };
}
