// Site intro (client request): when the site opens, the business's own clip of
// a profile being cut plays first, the logo fades in, then the video frame
// flies into the hero's video panel and the site appears. Once per session.
// Skipped with prefers-reduced-motion, Save-Data, no JS, or if autoplay fails.
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
  <button type="button" class="intro__skip" data-intro-skip tabindex="-1">Skip intro</button>
</div>
<script>(function(){var d=document.documentElement,el=document.getElementById("intro"),r=false,s=false,seen=false;
try{r=matchMedia("(prefers-reduced-motion: reduce)").matches;s=!!(navigator.connection&&navigator.connection.saveData)}catch(e){}
try{seen=!!sessionStorage.getItem("hs-intro")}catch(e){seen=true}
if(r||s||seen||!d.classList.contains("js")){el.remove();return}
try{sessionStorage.setItem("hs-intro","1");sessionStorage.setItem("hs-door","1")}catch(e){}
d.classList.add("intro-on","door-skip");el.removeAttribute("aria-hidden");el.setAttribute("role","presentation");
var v=el.querySelector("video");window.__hsIntro={el:el,video:v,t0:Date.now()};
function done(){if(window.__hsIntro&&!window.__hsIntro.handled){window.__hsIntro.handled=1;d.classList.remove("intro-on");el.remove()}}
var p=v.play();if(p&&p.catch)p.catch(done);
/* safety nets: if the video never starts, or the app script never takes over */
setTimeout(function(){if(v.paused||v.currentTime===0)done()},2500);setTimeout(done,9000);})()</script>`;
}
