// Site intro controller. The inline script in markup.js only covers the page
// early (html.intro-on); everything else happens here so it also works where
// inline scripts are restricted.
//   load -> play (muted) -> tagline writes itself (pen-nib glow) ->
//   on end/Skip: light sweep, the navy "doors" part, a bloom of light, and the
//   video frame settles onto the hero video panel -> site revealed.
// Never traps the visitor: Skip/Esc always work, blocked autoplay shows a play
// button, and hard timeouts uncover the site. Reduced motion: calm crossfade.
import "@fontsource/great-vibes/latin-400.css";

// The intro plays EVERY time the site is opened. In-app viewers (e.g. the
// Claude app) may load the page in the background for a preview card and then
// show that same, already-loaded page when it is tapped, so a fresh load is
// not guaranteed. Therefore the intro is re-playable without a reload:
//  - it never starts while the page is hidden; it waits until it is visible;
//  - it replays when the page comes back after being hidden, when the viewport
//    changes size a lot (small preview -> full screen), and on bfcache restore.
const REPLAY_AREA_CHANGE = 0.45; // >=45% change in viewport area counts as "opened"

export default function initIntro(ctx) {
  const root = document.documentElement;
  const first = document.getElementById("intro");
  if (!first) { root.classList.remove("intro-on"); return; }
  if (navigator.connection?.saveData) { root.classList.remove("intro-on"); first.remove(); return; }
  const tpl = first.cloneNode(true); // pristine copy for replays
  const parent = first.parentNode, anchor = first.nextSibling;
  window.__hsIntro = { pending: true }; // disables the inline safety net while we wait

  const state = { running: false, lastSize: area(), hiddenAt: 0, done: false };
  function area() { return Math.max(1, innerWidth * innerHeight); }

  function start(el) {
    state.running = true;
    state.lastSize = area();
    runIntro(ctx, el, () => { state.running = false; state.done = true; state.lastSize = area(); });
  }
  function replay() {
    if (state.running || !state.done || document.visibilityState !== "visible") return;
    const el = tpl.cloneNode(true);
    parent.insertBefore(el, anchor && anchor.parentNode === parent ? anchor : parent.firstChild);
    const lenis = ctx.getLenis?.();
    if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
    document.querySelector("#top .hero__reel-video")?.pause?.();
    start(el);
  }

  // first run: only once the page is actually visible
  if (document.visibilityState === "visible") start(first);
  else {
    const onVis = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", onVis); start(first); } };
    document.addEventListener("visibilitychange", onVis);
  }

  // replays
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") state.hiddenAt = Date.now();
    else if (state.hiddenAt && Date.now() - state.hiddenAt > 1500) replay();
  });
  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const a = area(), change = Math.abs(a - state.lastSize) / Math.max(a, state.lastSize);
      if (change >= REPLAY_AREA_CHANGE) replay();
      else if (!state.running) state.lastSize = a;
    }, 300);
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) replay(); });
}

function runIntro(ctx, el, onDone) {
  const root = document.documentElement;
  // Add #debug to the URL to see what the intro is doing on a device.
  const dbgEl = /debug/.test(location.hash) ? (() => {
    const d = document.createElement("pre");
    d.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:90vw;margin:0;padding:8px 10px;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.75);border-radius:8px;white-space:pre-wrap;pointer-events:none";
    document.body.appendChild(d); return d; })() : null;
  const t0 = performance.now();
  function dbg(msg) { if (dbgEl) dbgEl.textContent += `${((performance.now() - t0) / 1000).toFixed(2)}s ${msg}\n`; }
  dbg(`intro start; visible=${document.visibilityState}; ${innerWidth}x${innerHeight}; UA ${navigator.userAgent.slice(0, 80)}`);
  const st = (window.__hsIntro = { el, handled: false });
  let doneCalled = false;
  const done = () => { if (!doneCalled) { doneCalled = true; onDone?.(); } };
  const $ = (s) => el.querySelector(s);
  const video = $("video"), frame = $("[data-intro-frame]"), playBtn = $("[data-intro-play]"), skip = $("[data-intro-skip]");
  const lines = [...el.querySelectorAll("[data-intro-line]")], nib = $(".intro__nib"), script = $(".intro__script");
  const { reduced } = ctx;
  const lenis = ctx.getLenis?.();
  const anims = [];

  root.classList.add("intro-on", "door-skip");
  el.removeAttribute("aria-hidden");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Home Solutions intro video");
  lenis?.stop();

  let leaving = false, started = false, endTimer = 0;

  // ---- handwriting -------------------------------------------------------
  // Each line is revealed left-to-right with clip-path while a glowing "nib"
  // travels along it with a slight up/down wobble, so it reads as written.
  async function writeTagline(totalMs) {
    if (reduced) return;
    try { await Promise.race([document.fonts.load('60px "Great Vibes"'), new Promise((r) => setTimeout(r, 600))]); } catch { /* fallback font */ }
    if (leaving) return;
    const base = script.getBoundingClientRect();
    const weights = lines.map((l) => l.textContent.length);
    const sum = weights.reduce((a, b) => a + b, 0);
    let t = 0;
    const gap = 140;
    lines.forEach((line, i) => {
      const dur = Math.max(500, (totalMs - gap) * (weights[i] / sum));
      const r = line.getBoundingClientRect();
      const x0 = r.left - base.left + r.width * 0.02, x1 = r.left - base.left + r.width * 0.97;
      const yMid = r.top - base.top + r.height * 0.58, amp = r.height * 0.16;
      anims.push(line.animate([{ clipPath: "inset(-20% 100% -30% -5%)" }, { clipPath: "inset(-20% -5% -30% -5%)" }],
        { duration: dur, delay: t, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "forwards" }));
      const steps = 14;
      const kf = Array.from({ length: steps + 1 }, (_, k) => ({
        transform: `translate(${x0 + (x1 - x0) * (k / steps)}px, ${yMid + (k % 2 ? -amp : amp * 0.6) * (k && k < steps ? 1 : 0)}px)`,
        opacity: k === 0 || k === steps ? 0 : 1,
      }));
      anims.push(nib.animate(kf, { duration: dur, delay: t, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "forwards" }));
      t += dur + gap;
    });
    el.style.setProperty("--tag-delay", `${(t + 150) / 1000}s`);
  }

  // ---- hand-off ----------------------------------------------------------
  function finish() {
    root.classList.remove("intro-on");
    el.remove();
    done();
    lenis?.start();
    ctx.ScrollTrigger?.refresh();
    const reel = document.querySelector("#top .hero__reel-video");
    if (reel) { if (reel.dataset.deferred) { reel.preload = "auto"; reel.autoplay = true; } reel.play?.().catch(() => {}); }
  }

  function leave() {
    if (leaving) return;
    leaving = st.handled = true;
    clearTimeout(endTimer);
    anims.forEach((a) => a.finish?.());
    el.classList.add("is-leaving");
    const doorL = $(".intro__door--l"), doorR = $(".intro__door--r");
    const beam = $(".intro__beam"), bloom = $(".intro__bloom"), copy = $(".intro__copy");

    if (reduced || !started) {
      root.classList.remove("intro-on");
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 550, easing: "ease-out", fill: "forwards" });
      setTimeout(finish, 580);
      return;
    }

    const E = "cubic-bezier(.65,0,.35,1)";
    const wide = matchMedia("(min-width: 900px)").matches;
    if (!wide) {
      // Full-screen video: frosted glass doors slide shut over it (light sweep),
      // a bloom of daylight fills the gap, then the doors part onto the site.
      const CLOSE = 520, HOLD = 120, OPEN_T = 950;
      [doorL, doorR].forEach((d) => d.classList.add("is-glass"));
      bloom.classList.add("is-front");
      beam.animate([{ opacity: 0, transform: "translateX(-40%)" }, { opacity: 1, offset: 0.35 }, { opacity: 0, transform: "translateX(40%)" }],
        { duration: 900, easing: E, fill: "forwards" });
      copy.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-24px)" }], { duration: 420, easing: "ease-in", fill: "forwards" });
      doorL.animate([{ transform: "translateX(-102%)" }, { transform: "translateX(0)" }], { duration: CLOSE, easing: E, fill: "forwards" });
      doorR.animate([{ transform: "translateX(102%)" }, { transform: "translateX(0)" }], { duration: CLOSE, easing: E, fill: "forwards" });
      setTimeout(() => {
        frame.style.opacity = "0";
        root.classList.remove("intro-on");
        bloom.animate([{ opacity: 0, transform: "scale(.1)" }, { opacity: 0.95, transform: "scale(.45)", offset: 0.3 }, { opacity: 0, transform: "scale(1.1)" }],
          { duration: 1000, easing: "ease-out", fill: "forwards" });
        doorL.animate([{ transform: "translateX(0)" }, { transform: "translateX(-102%)" }], { duration: OPEN_T, easing: E, fill: "forwards" });
        doorR.animate([{ transform: "translateX(0)" }, { transform: "translateX(102%)" }], { duration: OPEN_T, easing: E, fill: "forwards" });
        setTimeout(finish, OPEN_T + 60);
      }, CLOSE + HOLD);
      return;
    }
    const T = 1500;            // whole hand-off
    const OPEN = 260;          // doors start parting after the light hits
    // 1. light sweep across the glass + tagline lifts away
    beam.animate([{ opacity: 0, transform: "translateX(-40%)" }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: "translateX(40%)" }],
      { duration: 900, easing: E, fill: "forwards" });
    copy.animate([{ opacity: 1, transform: getComputedStyle(copy).transform === "none" ? "translateY(0)" : getComputedStyle(copy).transform },
      { opacity: 0, transform: `${getComputedStyle(copy).transform === "none" ? "" : getComputedStyle(copy).transform} translateY(-28px)` }],
      { duration: 520, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    // 2. the site appears behind the doors, a bloom of daylight through the gap
    setTimeout(() => root.classList.remove("intro-on"), OPEN);
    bloom.animate([{ opacity: 0, transform: "scale(.15)" }, { opacity: 0.9, transform: "scale(.6)", offset: 0.35 }, { opacity: 0, transform: "scale(1.15)" }],
      { duration: 1100, delay: OPEN, easing: "ease-out", fill: "forwards" });
    // 3. the doors slide apart
    doorL.animate([{ transform: "translateX(0)" }, { transform: "translateX(-102%)" }], { duration: T - OPEN, delay: OPEN, easing: E, fill: "forwards" });
    doorR.animate([{ transform: "translateX(0)" }, { transform: "translateX(102%)" }], { duration: T - OPEN, delay: OPEN, easing: E, fill: "forwards" });
    // 4. the video frame settles onto the hero video panel
    const target = document.querySelector("#top .hero__reel");
    const from = frame.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    if (to && to.width > 0 && to.bottom > 0) {
      const s = to.width / from.width;
      frame.animate([{ transform: "translate(0,0) scale(1)", borderRadius: getComputedStyle(frame).borderRadius },
        { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`, borderRadius: `${28 / s}px` }],
        { duration: T, easing: E, fill: "forwards" });
      frame.animate([{ opacity: 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], { duration: T + 120, easing: "linear", fill: "forwards" });
    } else {
      frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: OPEN, easing: "ease-out", fill: "forwards" });
    }
    setTimeout(finish, T + 160);
  }

  // ---- playback ----------------------------------------------------------
  // The intro never depends on video autoplay: if the clip has not started
  // within ~1.2s (in-app browsers often block autoplay), an animated WebP of
  // the same clip plays instead, and the tagline + door hand-off run anyway.
  const INTRO_MS = 4270;
  function begin(ms) {
    if (started || leaving) return;
    started = true;
    el.classList.add("is-playing");
    playBtn.hidden = true;
    dbg(`begin (${mode}), ${Math.round(ms)}ms`);
    writeTagline(Math.max(1200, ms - 1100)); // tagline finishes ~0.5s before the clip ends
    endTimer = setTimeout(leave, ms + 600);
  }
  function onPlaying() {
    const left = Number.isFinite(video.duration) && video.duration > 0 ? (video.duration - video.currentTime) * 1000 : INTRO_MS;
    begin(left);
  }
  let mode = "video";
  function useAnimatedFallback(reason) {
    if (started || leaving || mode === "image") return;
    mode = "image";
    dbg(`video fallback: ${reason}`);
    try { video.pause(); } catch { /* ignore */ }
    video.style.display = "none";
    const img = document.createElement("img");
    img.className = "intro__video intro__anim";
    img.alt = "";
    img.decoding = "async";
    // new URL each run so the animation restarts from frame 1 on replays
    img.src = "/video/intro-anim.webp?r=" + Date.now();
    frame.appendChild(img);
    const go = () => begin(INTRO_MS);
    if (img.complete && img.naturalWidth) go();
    else { img.addEventListener("load", go, { once: true }); img.addEventListener("error", () => { dbg("anim image failed"); go(); }, { once: true }); }
    setTimeout(go, 2500); // slow network: run the tagline over the poster anyway
  }

  video.addEventListener("playing", () => { if (mode === "video") onPlaying(); });
  video.addEventListener("ended", () => { if (mode === "video") leave(); }, { once: true });
  video.addEventListener("error", () => useAnimatedFallback("video error"), { once: true });
  playBtn.addEventListener("click", () => { video.play().then(onPlaying, () => useAnimatedFallback("play refused")); });
  skip.addEventListener("click", leave);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") leave(); });

  video.muted = true;
  video.setAttribute("muted", "");
  video.playsInline = true;
  let attempt;
  try { attempt = video.play(); } catch (e) { useAnimatedFallback("play threw " + e.name); }
  if (attempt?.then) attempt.then(() => dbg("video.play() resolved"), (e) => useAnimatedFallback("play rejected " + (e?.name || "")));
  setTimeout(() => { if (!started) useAnimatedFallback("not started after 1.2s"); }, 1200);
  setTimeout(() => { if (!started && !leaving) leave(); }, 12000);
}
