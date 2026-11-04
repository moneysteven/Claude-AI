// Site intro (client request): when the site opens, the business's own clip of
// a profile being cut plays first while the tagline "Everything your home
// needs in one place" writes itself in script; then the navy stage parts like
// sliding glass doors and the video frame settles into the hero's video panel. Plays on every visit.
// Save-Data skips it; reduced motion keeps the video but swaps the flight for a
// fade; if autoplay is blocked (e.g. iPhone Low Power Mode) a play button shows.
import { logoSVG } from "../header/logo.js";

export default function intro({ B, fmt }) {
  const tag1 = "Everything your home", tag2 = "needs in one place";
  return `<div class="intro" id="intro" aria-hidden="true">
  <!-- navy stage = two sliding "doors" that part to reveal the site -->
  <div class="intro__door intro__door--l"><span class="intro__stile"></span><span class="intro__handle"></span></div>
  <div class="intro__door intro__door--r"><span class="intro__stile"></span><span class="intro__handle"></span></div>
  <div class="intro__beam"></div>
  <div class="intro__bloom"></div>
  <div class="intro__copy">
    <div class="intro__brand">
      ${logoSVG({ className: "intro__logo", tone: "white" })}
    </div>
    <p class="intro__script" aria-label="${fmt.esc(`${tag1} ${tag2}`)}">
      <span class="intro__line" data-intro-line aria-hidden="true">${fmt.esc(tag1)}</span>
      <span class="intro__line intro__line--2" data-intro-line aria-hidden="true">${fmt.esc(tag2)}</span>
      <span class="intro__nib" aria-hidden="true"></span>
    </p>
    <p class="intro__tag">${fmt.esc(B.strapline.split("·").slice(0, 3).map((s) => s.trim()).join(" · "))}</p>
  </div>
  <div class="intro__frame" data-intro-frame>
    <video class="intro__video" muted playsinline preload="auto" poster="/video/intro-poster.webp" disablepictureinpicture>
      <source src="/video/intro.webm" type="video/webm">
      <source src="/video/intro.mp4" type="video/mp4">
    </video>
  </div>
  <button type="button" class="intro__play" data-intro-play hidden aria-label="Play intro video"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button>
  <button type="button" class="intro__skip" data-intro-skip>Skip intro</button>
</div>
<script>(function(){var d=document.documentElement,el=document.getElementById("intro"),s=false;
try{s=!!(navigator.connection&&navigator.connection.saveData)}catch(e){}
if(s){el.remove();return}
/* Cover the page straight away (before first paint); index.js runs the intro.
   Safety net: if the app script never takes over, uncover the site. */
d.classList.add("intro-on","door-skip");
setTimeout(function(){if(!window.__hsIntro&&el.isConnected){d.classList.remove("intro-on");el.remove()}},6000);})()</script>`;
}
