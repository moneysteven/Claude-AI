// Site intro controller. The inline script in markup.js only covers the page
// early (html.intro-on); everything else happens here so it works even where
// inline scripts are restricted:
//   load -> play (muted) -> logo fades in -> on end/Skip the frame flies onto the
//   hero video panel (fade only with reduced motion) -> site is revealed.
// Never traps the visitor: Skip/Esc always work, a stalled load or blocked
// autoplay falls back to a play button, and hard timeouts uncover the site.
export default function initIntro(ctx) {
  const el = document.getElementById("intro");
  const root = document.documentElement;
  if (!el) { root.classList.remove("intro-on"); return; }
  if (navigator.connection?.saveData) { root.classList.remove("intro-on"); el.remove(); return; }

  const st = (window.__hsIntro = { el, handled: false });
  const video = el.querySelector("video");
  const frame = el.querySelector("[data-intro-frame]");
  const playBtn = el.querySelector("[data-intro-play]");
  const skip = el.querySelector("[data-intro-skip]");
  const { reduced } = ctx;
  const lenis = ctx.getLenis?.();

  root.classList.add("intro-on", "door-skip");
  el.removeAttribute("aria-hidden");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Home Solutions intro video");
  lenis?.stop();

  let leaving = false, started = false, endTimer = 0;

  function finish() {
    root.classList.remove("intro-on");
    el.remove();
    lenis?.start();
    ctx.ScrollTrigger?.refresh();
    document.querySelector("#top .hero__reel-video")?.play?.().catch(() => {});
  }

  function leave() {
    if (leaving) return;
    leaving = st.handled = true;
    clearTimeout(endTimer);
    el.classList.add("is-leaving");
    root.classList.remove("intro-on"); // hero becomes visible underneath
    const backdrop = el.querySelector(".intro__backdrop");
    const target = document.querySelector("#top .hero__reel");
    const from = frame.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    const dur = reduced ? 500 : 1100;
    const opts = { duration: dur, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" };
    if (!reduced && started && to && to.width > 0 && to.bottom > 0) {
      frame.animate([
        { transform: "translate(0,0) scale(1,1)" },
        { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})` },
      ], opts);
      frame.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { ...opts, easing: "linear" });
    } else {
      frame.animate([{ opacity: 1 }, { opacity: 0 }], opts);
    }
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(dur, 700), easing: "ease-out", fill: "forwards" });
    setTimeout(finish, dur + 40);
  }

  function onPlaying() {
    if (started) return;
    started = true;
    el.classList.add("is-playing");
    playBtn.hidden = true;
    // Hand over when the clip ends; backup timer in case "ended" never fires.
    const left = Number.isFinite(video.duration) && video.duration > 0 ? (video.duration - video.currentTime) * 1000 : 3000;
    endTimer = setTimeout(leave, left + 600);
  }

  function showPlayButton() {
    if (started || leaving) return;
    el.classList.add("is-blocked");
    playBtn.hidden = false;
  }

  video.addEventListener("playing", onPlaying);
  video.addEventListener("ended", leave, { once: true });
  video.addEventListener("error", leave, { once: true });
  playBtn.addEventListener("click", () => { video.play().then(onPlaying, leave); });
  skip.addEventListener("click", leave);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") leave(); });

  video.muted = true; // required for autoplay on every browser
  const attempt = video.play();
  if (attempt?.catch) attempt.catch(showPlayButton);

  // Slow connection: keep the branded stage up while it loads (logo visible),
  // offer the play button after 4s, and uncover the site if nothing happens.
  setTimeout(showPlayButton, 4000);
  setTimeout(() => { if (!started && !leaving) leave(); }, 12000);
}
