// Site intro (client request): when the site opens, the business's own clip of
// a profile being cut plays first, the logo fades in, then the video frame
// flies into the hero's video panel and the site appears. Plays on every visit.
// Save-Data skips it; reduced motion keeps the video but swaps the flight for a
// fade; if autoplay is blocked (e.g. iPhone Low Power Mode) a play button shows.
import { logoSVG } from "../header/logo.js";

export default function intro({ B, fmt }) {
  return `<div class="intro" id="intro" aria-hidden="true">
  <div class="intro__backdrop"></div>
  <div class="intro__frame" data-intro-frame>
    <video class="intro__video" muted playsinline preload="auto" poster="/video/intro-poster.webp" disablepictureinpicture>
      <source src="/video/intro.webm" type="video/webm">
      <source src="/video/intro.mp4" type="video/mp4">
    </video>
  </div>
  <div class="intro__brand">
    ${logoSVG({ className: "intro__logo", tone: "white" })}
    <p class="intro__tag">${fmt.esc(B.strapline.split("·").slice(0, 3).map((s) => s.trim()).join(" · "))}</p>
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
