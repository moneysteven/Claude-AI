// Section 01 hero, "Light Through the Door" (BRIEF §0, §4.01, §6.1).
// The door intro is pure CSS so it starts before the JS bundle arrives; a tiny
// inline script decides synchronously (before paint) whether to play it:
//   - only with JS (html.js), once per session (sessionStorage "hs-door"),
//   - never with prefers-reduced-motion (panels start open = not rendered).
// Background: a still photo with a slow 12s zoom and a one-time light sweep (CSS only).

export default function hero({ B, btn, fmt }) {
  const n = B.branches.length;
  // "Windows · Doors · Glass · Commercial, Domestic, Industrial" -> eyebrow + sectors
  const parts = B.strapline.split("·").map((s) => s.trim());
  const sectors = parts[parts.length - 1].split(",").map((s) => s.trim()).filter(Boolean);
  const eyebrow = parts.slice(0, -1).join(" · ");
  // "We Build for Your Comfort" -> two lines
  const words = B.tagline.replace(/\.$/, "").split(" ");
  const cut = Math.ceil(words.length / 2);
  const lines = [words.slice(0, cut).join(" "), words.slice(cut).join(" ") + "."];
  const chips = [`Since ${B.founded}`, `${n} Branches`, ...sectors];

  return `<section class="hero" id="top" aria-labelledby="hero-title">
  <div class="hero__media" aria-hidden="true">
    <!-- Client request: hero = living room with sliding glass doors + pool (no roof/aerial shots).
         Desktop 1920w landscape (object-position 70% keeps the doors and pool on the right);
         phones get a 1080x1920 crop centred on the glass doors. -->
    <picture class="hero__photo">
      <source media="(max-width: 767.98px)" srcset="/img/hero-living-doors-1080.webp" width="1080" height="1920">
      <img src="/img/hero-living-doors-1920.webp" alt="" width="1920" height="1282" fetchpriority="high" decoding="async">
    </picture>
    <span class="hero__sweep"></span>
    <script>(function(){var d=document.documentElement,r=false;try{r=matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}
try{if(r||sessionStorage.getItem("hs-door"))d.classList.add("door-skip");else sessionStorage.setItem("hs-door","1")}catch(e){d.classList.add("door-skip")}})()</script>
    <div class="hero__wash"></div>
  </div>

  <div class="hero__door" aria-hidden="true">
    <div class="hero__pane hero__pane--l"><span class="hero__handle"></span></div>
    <div class="hero__pane hero__pane--r"><span class="hero__handle"></span></div>
    <div class="hero__beam"></div>
  </div>

  <div class="hero__inner container">
    <div class="hero__panel">
      <p class="eyebrow hero__rise" style="--i:0">${fmt.esc(eyebrow)}</p>
      <h1 class="hero__title" id="hero-title">${lines.map((l, i) => `<span class="hero__line"><span class="hero__line-in" style="--i:${i}">${fmt.esc(l)}</span></span>`).join(" ")}</h1>
      <p class="hero__sub hero__rise" style="--i:2">Aluminium &amp; uPVC windows, doors, frameless glass showers and railings, made for Jamaica's sun, salt air and storms. ${n} branches across western &amp; central Jamaica.</p>
      <div class="hero__ctas hero__rise" style="--i:3">
        ${btn("Get a quote", { href: "#quote" })}
        ${btn("Find your nearest branch", { href: "#branches", variant: "glass" })}
      </div>
    </div>
    <ul class="hero__chips hero__rise" style="--i:4" aria-label="At a glance">
      ${chips.map((c) => `<li class="hero__chip">${fmt.esc(c)}</li>`).join("")}
    </ul>
  </div>

  <a class="hero__cue" href="#products" aria-label="Scroll to products"><span class="hero__cue-line" aria-hidden="true"><span class="hero__cue-dot"></span></span><span class="hero__cue-label" aria-hidden="true">Scroll</span></a>
</section>`;
}
