// Intro hand-off: when the clip ends (or Skip), the frame flies onto the hero's
// video panel (FLIP via the Web Animations API), the navy stage fades, and the
// hero entrance animations resume. The inline script in markup.js starts the
// video and guarantees the overlay never sticks if this never runs.
export default function initIntro(ctx) {
  const st = window.__hsIntro;
  if (!st || st.handled || !st.el.isConnected) return;
  const { el, video } = st;
  const lenis = ctx.getLenis?.();
  lenis?.stop();
  const skip = el.querySelector("[data-intro-skip]");
  skip.tabIndex = 0;

  let leaving = false;
  function finish() {
    st.handled = 1;
    document.documentElement.classList.remove("intro-on");
    el.remove();
    lenis?.start();
    ctx.ScrollTrigger?.refresh();
    document.querySelector("#top .hero__reel-video")?.play?.().catch(() => {});
  }
  function leave() {
    if (leaving || st.handled) return;
    leaving = true;
    st.handled = 1; // stop the inline safety timers from yanking the overlay mid-flight
    el.classList.add("is-leaving");
    const frame = el.querySelector("[data-intro-frame]");
    const target = document.querySelector("#top .hero__reel");
    const backdrop = el.querySelector(".intro__backdrop");
    const from = frame.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    const opts = { duration: 1100, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" };
    // The hero becomes visible underneath while the frame travels.
    document.documentElement.classList.remove("intro-on");
    if (to && to.width > 0 && to.bottom > 0) {
      const sx = to.width / from.width, sy = to.height / from.height;
      frame.animate([
        { transform: "translate(0,0) scale(1,1)", borderRadius: getComputedStyle(frame).borderRadius },
        { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})`, borderRadius: "28px" },
      ], opts);
      frame.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { ...opts, easing: "linear" });
    } else {
      frame.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.04)" }], opts);
    }
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: "ease-out", fill: "forwards" })
      .finished.then(() => {}, () => {});
    setTimeout(finish, opts.duration + 40);
  }
  skip.addEventListener("click", leave);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") leave(); });
  video.addEventListener("ended", leave, { once: true });
  // If the clip is shorter/longer than expected or stalls, hand over anyway.
  const remaining = Math.max(400, 3000 - (Date.now() - st.t0));
  setTimeout(leave, Number.isFinite(video.duration) && video.duration > 0 ? Math.max(remaining, (video.duration - video.currentTime) * 1000 + 200) : remaining);
}
