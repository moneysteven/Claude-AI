// BUILD-TIME ONLY (runs in Node inside vite.config.js): emits <picture> and
// <video> markup from public/img/manifest.json. Do not import from client code.
import fs from "node:fs";
import { esc } from "./format.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../../public/img/manifest.json", import.meta.url), "utf8"));

/**
 * picture("photo-patio-doors-garden", { alt, sizes, className, imgClass, eager, priority, width })
 *  - alt is REQUIRED (pass "" for decorative images).
 *  - width/height attributes come from the manifest (prevents CLS).
 *  - lazy by default; `eager:true` for above-the-fold, `priority:true` adds fetchpriority=high.
 */
export function picture(name, { alt, sizes = "100vw", className = "", imgClass = "", eager = false, priority = false, attrs = "" } = {}) {
  const m = manifest[name];
  if (!m) throw new Error(`picture(): unknown image "${name}"`);
  if (alt === undefined) throw new Error(`picture(): alt text required for "${name}"`);
  const set = (ext, ws) => ws.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(", ");
  const largest = m.widths[m.widths.length - 1];
  const fallbackW = m.widths.find((w) => w >= 1024) || largest;
  const h = Math.round((m.h * largest) / m.w);
  return `<picture${className ? ` class="${className}"` : ""}>` +
    (m.avif.length ? `<source type="image/avif" srcset="${set("avif", m.avif)}" sizes="${sizes}">` : "") +
    `<source type="image/webp" srcset="${set("webp", m.widths)}" sizes="${sizes}">` +
    `<img src="/img/${name}-${fallbackW}.webp" alt="${esc(alt)}" width="${largest}" height="${h}"` +
    `${imgClass ? ` class="${imgClass}"` : ""} decoding="async"${eager ? "" : ' loading="lazy"'}${priority ? ' fetchpriority="high"' : ""}${attrs ? " " + attrs : ""}></picture>`;
}

/** Path of one rendition, e.g. for CSS backgrounds / video posters. */
export function imgSrc(name, minWidth = 1024) {
  const m = manifest[name];
  if (!m) throw new Error(`imgSrc(): unknown image "${name}"`);
  const w = m.widths.find((x) => x >= minWidth) || m.widths[m.widths.length - 1];
  return `/img/${name}-${w}.webp`;
}

export const imageInfo = (name) => manifest[name];

/**
 * Lazy section video (BRIEF §0 secondary clips): 720p mp4 + webm, sources in
 * data-src until near the viewport (see motion.initLazyVideos). Muted, looped,
 * inline, decorative (aria-hidden). The poster shows for reduced motion / Save-Data / no JS.
 */
export function sectionVideo(base, { poster, className = "" } = {}) {
  return `<video class="${className}" data-lazy muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"` +
    `${poster ? ` poster="${imgSrc(poster, 1024)}"` : ""}>` +
    `<source data-src="/video/${base}.webm" type="video/webm">` +
    `<source data-src="/video/${base}.mp4" type="video/mp4"></video>`;
}
