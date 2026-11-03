// Client entry: fonts + styles (all section CSS is bundled statically so the
// page is styled without JS), then motion and each section's behaviour.
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { BUSINESS } from "./config.js";
import * as motion from "./lib/motion.js";
import * as quote from "./lib/quote.js";

// Section styles (eager, ordered by filename is fine — sections don't share selectors).
import.meta.glob("./sections/*/style.css", { eager: true });
const inits = import.meta.glob("./sections/*/index.js", { eager: true });

const ORDER = ["header", "hero", "catalogue", "finishes", "estimator", "why", "beforeafter", "gallery", "showers", "reviews", "branches", "faq", "cta", "footer", "booking", "mobilebar"];

const ctx = { B: BUSINESS, ...motion, quote };

function boot() {
  motion.initMotion();
  motion.initCursorLight(document);
  for (const name of ORDER) {
    const mod = inits[`./sections/${name}/index.js`];
    if (!mod?.default) continue;
    try { mod.default(ctx); } catch (err) { console.error(`[${name}] init failed`, err); }
  }
  motion.ScrollTrigger.refresh();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
