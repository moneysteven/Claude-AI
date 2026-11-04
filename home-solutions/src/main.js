// Client entry: fonts + styles (all section CSS is bundled statically so the
// page is styled without JS), then motion and each section's behaviour.
import "./styles/base-entry.js";
import "./styles/sections-entry.js";
import { BUSINESS } from "./config.js";
import * as motion from "./lib/motion.js";
import * as quote from "./lib/quote.js";

const inits = import.meta.glob("./sections/*/index.js", { eager: true });

const ORDER = ["intro", "header", "hero", "catalogue", "finishes", "estimator", "why", "beforeafter", "gallery", "showers", "reviews", "branches", "faq", "cta", "footer", "booking", "mobilebar"];

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
