// Section 06 behaviour: before/after comparison slider.
// Pointer + touch drag anywhere on the frame (touch-action: pan-y keeps vertical
// page scrolling), keyboard on the role="slider" handle (arrows ±2, Shift/PageUp/
// PageDown ±10, Home/End). Position is a CSS variable driving clip-path on the
// "before" layer and translateX on the handle track (no layout properties).
export default function init(ctx) {
  const root = document.getElementById("before-after");
  const frame = root?.querySelector(".ba-frame");
  const handle = root?.querySelector(".ba-handle");
  if (!frame || !handle) return;
  const { gsap, reduced, EASE } = ctx;

  let pos = 50, raf = 0, touched = false, hint = null;
  const clamp = (v) => Math.min(100, Math.max(0, v));

  function render() {
    raf = 0;
    frame.style.setProperty("--ba-pos", `${pos}%`);
    frame.classList.toggle("is-min", pos < 14);
    frame.classList.toggle("is-max", pos > 86);
  }
  function set(v, { announce = true } = {}) {
    pos = Math.round(clamp(v) * 10) / 10;
    if (announce) {
      const n = Math.round(pos);
      handle.setAttribute("aria-valuenow", String(n));
      handle.setAttribute("aria-valuetext", `${n}% before, ${100 - n}% after`);
    }
    if (!raf) raf = requestAnimationFrame(render);
  }
  function stopHint() { touched = true; if (hint) { hint.kill(); hint = null; } }

  // Pointer / touch drag
  let dragging = false, rect = null;
  const fromEvent = (e) => ((e.clientX - rect.left) / rect.width) * 100;
  frame.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    stopHint();
    rect = frame.getBoundingClientRect();
    dragging = true;
    frame.classList.add("is-drag");
    try { frame.setPointerCapture(e.pointerId); } catch {}
    set(fromEvent(e));
    if (e.pointerType === "mouse") { e.preventDefault(); handle.focus({ preventScroll: true }); }
  });
  frame.addEventListener("pointermove", (e) => { if (dragging) set(fromEvent(e)); });
  const end = () => { if (!dragging) return; dragging = false; frame.classList.remove("is-drag"); };
  frame.addEventListener("pointerup", end);
  frame.addEventListener("pointercancel", end);
  frame.addEventListener("lostpointercapture", end);

  // Keyboard
  handle.addEventListener("keydown", (e) => {
    const big = e.shiftKey ? 10 : 2;
    const map = { ArrowLeft: -big, ArrowDown: -big, ArrowRight: big, ArrowUp: big, PageDown: -10, PageUp: 10 };
    let v;
    if (e.key in map) v = pos + map[e.key];
    else if (e.key === "Home") v = 0;
    else if (e.key === "End") v = 100;
    else return;
    e.preventDefault();
    stopHint();
    set(v);
  });

  // One-time affordance: a gentle nudge when the slider first comes into view.
  if (!reduced) {
    const o = { v: 50 };
    hint = gsap.timeline({
      paused: true,
      onUpdate: () => set(o.v, { announce: false }),
      onComplete: () => { hint = null; set(50); },
    })
      .to(o, { v: 38, duration: 0.7, ease: EASE.ui })
      .to(o, { v: 60, duration: 0.8, ease: "power2.inOut" })
      .to(o, { v: 50, duration: 0.6, ease: EASE.out });
    ctx.ScrollTrigger.create({
      trigger: frame, start: "top 70%", once: true,
      onEnter: () => { if (!touched && hint) hint.play(); },
    });
  }
}
