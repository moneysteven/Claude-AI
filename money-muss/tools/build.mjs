// Money Muss build step:  npm run build
//
// The site is plain HTML/CSS/JS and can be hosted as-is. This script only refreshes
// the generated parts, and it is safe to run as often as you like:
//
//   1. Photos    images/<name>.(jpg|jpeg|png|webp)  ->  images/opt/*.avif|webp|jpg
//                All nine named photos (tools/photos.mjs). Auto-rotated, one shared warm
//                grade with a light vignette, several widths for srcset.
//   2. Colours   the step yellow and facade olive, sampled from exterior-clean
//   3. Textures  brand/grain.png and brand/paper.webp, drawn from noise (not photographs)
//   4. HTML      the blocks between  <!-- build:... -->  and  <!-- /build:... -->
//                in index.html and 404.html (logo sprite, photos, menu, favourites,
//                weekly nights, marquee; the hero photo's preload; the 404 page's own
//                fonts, icon links and way home)
//   5. Brand     favicon / touch icons / Open Graph image, drawn from the SVG logo
//   6. Address   SITE_URL (just below) fills the canonical link, og:url, the absolute
//                preview-image links, the structured data, sitemap.xml and robots.txt
//
// Everything outside those marked blocks is left exactly as written.
// A photo that is not in /images yet is simply left out of the page: there is no
// stand-in panel. "npm run check" fails until every photo is there.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { menuHTML, favouritesHTML, specialsHTML, marqueeHTML, countPhrase, seasonValue, seasonGreeting, esc } from '../js/templates.js';
import { PHOTOS, VARIANTS, EXTENSIONS, WIDTHS } from './photos.mjs';

// THE WEBSITE'S ADDRESS. Replace {{SITE_URL}} with the real one once the domain is known,
// for example 'https://www.example.com' (no slash on the end), then run "npm run build".
// Until then the pages carry no canonical link or og:url, and the sitemap line in
// robots.txt stays commented out, so nothing points at a made-up address.
const SITE_URL = '{{SITE_URL}}';
const SITE_KNOWN = /^https?:\/\/[^{}\s]+$/.test(SITE_URL);
const site = (path = '') => `${SITE_URL.replace(/\/+$/, '')}/${path}`;

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMG = join(ROOT, 'images');
const OPT = join(IMG, 'opt');

// One warm grade for every photo: blacks lifted a little, a touch of red-orange warmth,
// a light vignette. Change the numbers here and every photo is rebuilt to match.
const GRADE = {
  version: 4,
  saturation: 1.06,
  gain: [0.945, 0.93, 0.895],      // red, green, blue: slightly lower contrast, blue held back for warmth
  lift: [15, 12, 10],              // lifted blacks, warm in the shadows
  vignette: 0.26,                  // corner darkening, 0 = none
};
// The logo artwork keeps its true brand colours.
const UNGRADED = new Set(['logo-clean']);

// Crimson two-tone for the photo behind the big type in the bar section. The lightest
// tone is capped so cream text laid over the photo always passes AA (4.5:1 or better).
const DUO = { stops: [[0, [0x1c, 0x0a, 0x0c]], [0.55, [0x8e, 0x1b, 0x1b]], [1, [0xb5, 0x33, 0x2d]]], vignette: 0.42 };

// Accent colours taken from the building. These stand until exterior-clean is in /images.
const ACCENT_DEFAULTS = { yellow: '#E9B949', olive: '#5E6B3A' };

const log = (...a) => console.log(...a);

/* ---------------------------------------------------------------- colour helpers */

const hex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}

/* ---------------------------------------------------------------- photos */

async function findSource(name) {
  for (const ext of EXTENSIONS) {
    for (const candidate of [`${name}.${ext}`, `${name}.${ext.toUpperCase()}`]) {
      const file = join(IMG, candidate);
      if (existsSync(file)) return { file, rel: `images/${candidate}` };
    }
  }
  return null;
}

// Step 1 of the grade: turn the photo the right way up, size it, warm it. Returns raw pixels.
async function warmed(input, name, width) {
  let img = sharp(input, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true });
  if (!UNGRADED.has(name)) img = img.modulate({ saturation: GRADE.saturation }).linear(GRADE.gain, GRADE.lift);
  return img.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
}

const vignette = (w, h, strength) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="0.55" stop-color="#1a0d0a" stop-opacity="0"/><stop offset="1" stop-color="#1a0d0a" stop-opacity="${strength}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`,
);

// Two-tone: brightness only, stretched to use the whole ramp, then mapped onto the crimson stops.
function duotone(data) {
  const grey = new Uint8Array(data.length / 3);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 1) {
    const g = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    grey[p] = g; hist[g] += 1;
  }
  const at = (share) => { let seen = 0; const goal = grey.length * share; for (let v = 0; v < 256; v += 1) { seen += hist[v]; if (seen >= goal) return v; } return 255; };
  const lo = at(0.01), hi = Math.max(lo + 1, at(0.99));
  const lut = new Array(256);
  for (let v = 0; v < 256; v += 1) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))) ** 0.92;
    let k = 0; while (k < DUO.stops.length - 2 && t > DUO.stops[k + 1][0]) k += 1;
    const [t0, c0] = DUO.stops[k], [t1, c1] = DUO.stops[k + 1];
    const f = (t - t0) / (t1 - t0);
    lut[v] = c0.map((c, n) => Math.round(c + (c1[n] - c) * f));
  }
  const out = Buffer.alloc(data.length);
  for (let p = 0, i = 0; p < grey.length; p += 1, i += 3) { const c = lut[grey[p]]; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; }
  return out;
}

async function writeFormats(pixels, info, strength, base) {
  const finished = () => {
    const img = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 3 } });
    return strength ? img.composite([{ input: vignette(info.width, info.height, strength) }]) : img;
  };
  await finished().avif({ quality: 52, effort: 4 }).toFile(`${base}.avif`);
  await finished().webp({ quality: 78, effort: 5 }).toFile(`${base}.webp`);
  await finished().jpeg({ quality: 80, mozjpeg: true }).toFile(`${base}.jpg`);
}

async function buildPhotos() {
  await mkdir(OPT, { recursive: true });
  const manifest = {};
  for (const name of PHOTOS) {
    const src = await findSource(name);
    if (!src) { manifest[name] = { present: false }; continue; }
    const input = await readFile(src.file);
    const srcStat = await stat(src.file);
    const upright = await sharp(input, { failOn: 'none' }).rotate().toBuffer({ resolveWithObject: true });
    const { width, height } = upright.info;
    const widths = WIDTHS.filter((w) => w <= width);
    if (width < WIDTHS[WIDTHS.length - 1] && !widths.includes(width)) widths.push(width);      // never upscale
    widths.sort((a, b) => a - b);
    const variants = VARIANTS[name] || [];
    const graded = !UNGRADED.has(name);
    const stamp = JSON.stringify({ size: srcStat.size, time: Math.round(srcStat.mtimeMs), grade: graded ? GRADE : 'none', duo: variants.includes('duo') ? DUO : null, widths });
    const stampFile = join(OPT, `${name}.stamp`);
    const fresh = existsSync(stampFile) && (await readFile(stampFile, 'utf8')) === stamp;
    if (!fresh) {
      for (const w of widths) {
        const { data, info } = await warmed(input, name, w);
        await writeFormats(data, info, graded ? GRADE.vignette : 0, join(OPT, `${name}-${w}`));
        if (variants.includes('duo')) await writeFormats(duotone(data), info, DUO.vignette, join(OPT, `${name}-duo-${w}`));
      }
      await writeFile(stampFile, stamp);
    }
    // A tiny average colour to paint the frame while the photo loads.
    const small = await warmed(input, name, 32);
    const { dominant } = await sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 3 } }).stats();
    manifest[name] = { present: true, source: src.rel, width, height, widths, colour: hex([dominant.r, dominant.g, dominant.b]), formats: ['avif', 'webp', 'jpg'], ...(variants.length ? { variants } : {}) };
    log(`  photo  ${src.rel}  ${width}x${height}  ->  ${widths.join(', ')}px  (avif, webp, jpg${variants.length ? `; also ${variants.join(', ')}` : ''})${fresh ? '  [unchanged]' : ''}`);
  }
  await writeFile(join(IMG, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const srcset = (stem, widths, ext) => widths.map((w) => `images/opt/${stem}-${w}.${ext} ${w}w`).join(', ');

// One photo. When the file is not in /images yet this returns nothing at all: the page
// hides the empty frame (see [data-needs] in the stylesheet) and "npm run check" fails.
function photoHTML(spec, manifest) {
  const m = manifest[spec.img];
  if (!m || !m.present) return '';
  const stem = spec.variant ? `${spec.img}-${spec.variant}` : spec.img;
  if (spec.variant && !(m.variants || []).includes(spec.variant)) throw new Error(`"${spec.img}" has no "${spec.variant}" version (see VARIANTS in tools/photos.mjs)`);
  const pos = spec.pos || '50% 50%';
  const fallbackW = m.widths.includes(1080) ? 1080 : m.widths[m.widths.length - 1];
  const attrs = spec.eager ? 'loading="eager" fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  const style = `object-position:${esc(pos)};background-color:${m.colour}`;
  return `<picture>
<source type="image/avif" srcset="${srcset(stem, m.widths, 'avif')}" sizes="${esc(spec.sizes)}">
<source type="image/webp" srcset="${srcset(stem, m.widths, 'webp')}" sizes="${esc(spec.sizes)}">
<img class="photo" src="images/opt/${stem}-${fallbackW}.jpg" srcset="${srcset(stem, m.widths, 'jpg')}" sizes="${esc(spec.sizes)}" width="${m.width}" height="${m.height}" alt="${esc(spec.alt || '')}" ${attrs} data-source="${esc(m.source)}" style="${style}">
</picture>`;
}

/* ---------------------------------------------------------------- colours from the building */

// Looks for the yellow of the steps and the olive of the facade in exterior-clean and
// writes them into the stylesheet. Each is nudged, if needed, so it still passes AA
// where the site uses it (yellow on crimson, olive on paper).
async function sampleAccents(manifest) {
  const out = { ...ACCENT_DEFAULTS };
  let note = 'defaults; they are re-sampled from images/exterior-clean once that photo is in /images';
  const m = manifest['exterior-clean'];
  if (m && m.present) {
    const { data } = await sharp(join(ROOT, m.source), { failOn: 'none' }).rotate().resize({ width: 240 }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const bins = { yellow: [], olive: [] };
    for (let i = 0; i < data.length; i += 3) {
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const [h, s, l] = toHsl(rgb);
      if (h >= 36 && h <= 58 && s >= 0.45 && l >= 0.38 && l <= 0.8) bins.yellow.push(rgb);
      else if (h >= 58 && h <= 105 && s >= 0.12 && s <= 0.62 && l >= 0.16 && l <= 0.5) bins.olive.push(rgb);
    }
    const total = data.length / 3;
    const found = [];
    for (const key of ['yellow', 'olive']) {
      const px = bins[key];
      if (px.length / total < 0.004) { found.push(`${key}: too little of it in the photo, default kept`); continue; }
      // The middle of the cluster, channel by channel, ignores stray highlights and shadows.
      const mid = [0, 1, 2].map((c) => px.map((p) => p[c]).sort((a, b) => a - b)[Math.floor(px.length / 2)]);
      out[key] = hex(mid);
      found.push(`${key} ${out[key]} from ${(100 * px.length / total).toFixed(1)}% of the photo`);
    }
    note = `sampled from ${m.source} (${found.join('; ')})`;
  }
  // Guards: keep the accents usable as ink.
  const nudge = (colour, against, want, step) => {
    let rgb = unhex(colour);
    for (let n = 0; n < 60 && contrast(rgb, unhex(against)) < want; n += 1) rgb = rgb.map((v) => Math.max(0, Math.min(255, v + step)));
    return hex(rgb);
  };
  out.yellow = nudge(out.yellow, '#8E1B1B', 4.6, 3);      // lighter until it reads on crimson
  out.olive = nudge(out.olive, '#EFE6C8', 4.6, -3);       // darker until it reads on cream
  return { ...out, note };
}

async function writeAccents(accents) {
  const file = join(ROOT, 'css', 'styles.css');
  const css = await readFile(file, 'utf8');
  const block = `/* build:accents */\n/* Step yellow and facade olive: ${accents.note}. */\n:root { --yellow: ${accents.yellow}; --olive: ${accents.olive}; }\n/* /build:accents */`;
  const re = /\/\* build:accents \*\/[\s\S]*?\/\* \/build:accents \*\//;
  if (!re.test(css)) throw new Error('css/styles.css has lost its  /* build:accents */ ... /* /build:accents */  block');
  const next = css.replace(re, block);
  if (next !== css) await writeFile(file, next);
  log(`  colour yellow ${accents.yellow}, olive ${accents.olive}  (${accents.note})`);
}

/* ---------------------------------------------------------------- textures (drawn from noise, not photographs) */

async function turbulence(size, frequency, octaves, seed) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><filter id="n" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  return { data, mean: sum / data.length };
}

async function buildTextures() {
  const brand = join(ROOT, 'brand');
  // Grain: the same feTurbulence noise as the live overlay in index.html, frozen into a small
  // repeating tile for phones. Each pixel is black or white ink, stronger away from mid grey.
  const G = 128;
  const noise = await turbulence(G, 0.82, 2, 11);
  const grain = Buffer.alloc(G * G * 2);
  for (let i = 0; i < noise.data.length; i += 1) {
    const d = (noise.data[i] - noise.mean) / 255;
    grain[i * 2] = d < 0 ? 0 : 255;
    grain[i * 2 + 1] = Math.round(Math.min(0.62, Math.abs(d) * 3.4) * 8) * 32;
  }
  await sharp(grain, { raw: { width: G, height: G, channels: 2 } }).png({ compressionLevel: 9, palette: true, colours: 16, effort: 10 }).toFile(join(brand, 'grain.png'));

  // Paper: long soft fibres and a little mottling, as faint warm-brown ink for the off-white sections.
  const P = 480;
  const fibres = await turbulence(P, '0.006 0.42', 2, 5);
  const cross = await turbulence(P, '0.5 0.008', 1, 9);
  const mottle = await turbulence(P, 0.008, 2, 3);
  const paper = Buffer.alloc(P * P * 4);
  for (let i = 0; i < P * P; i += 1) {
    const a = Math.max(0, (fibres.data[i] - fibres.mean) / 255 - 0.07);
    const b = Math.max(0, (cross.data[i] - cross.mean) / 255 - 0.12);
    const m = Math.max(0, (mottle.data[i] - mottle.mean) / 255);
    const ink = Math.min(1, a * 1.15 + b * 0.85 + m * 0.14);
    paper[i * 4] = 0x7a; paper[i * 4 + 1] = 0x5c; paper[i * 4 + 2] = 0x34;
    paper[i * 4 + 3] = Math.round(ink * 255 * 0.26);
  }
  await sharp(paper, { raw: { width: P, height: P, channels: 4 } }).webp({ quality: 40, alphaQuality: 50, effort: 6 }).toFile(join(brand, 'paper.webp'));
  const sizes = await Promise.all(['grain.png', 'paper.webp'].map(async (f) => `${f} ${((await stat(join(brand, f))).size / 1024).toFixed(1)} KB`));
  log(`  paper  brand/${sizes.join(', brand/')}  (drawn from noise)`);
}

/* ---------------------------------------------------------------- sprite */

function starPath(cx, cy, outer, inner, points = 6) {
  let d = '';
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }
  return `${d}Z`;
}

async function spriteHTML() {
  const p = JSON.parse(await readFile(join(ROOT, 'brand', 'logo-parts.json'), 'utf8'));
  const NAVY = '#2B2F3A';
  const ROSE = '#C0697A';
  // Mark (nav, favicon): the script only, enlarged and centred inside a clean ring.
  const MARK_T = 'translate(514.5 514) scale(1.2) translate(-479 -446)';
  const icon = (id, body, extra = '') =>
    `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</symbol>`;
  return `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="g-script" gradientUnits="userSpaceOnUse" x1="150" y1="250" x2="800" y2="590"><stop offset="0" stop-color="#D9C290"/><stop offset=".26" stop-color="#EFE6C8"/><stop offset=".5" stop-color="#F8F2E2"/><stop offset=".74" stop-color="#ECDFBC"/><stop offset="1" stop-color="#D6BE8B"/></linearGradient>
<linearGradient id="g-caps" gradientUnits="userSpaceOnUse" x1="200" y1="700" x2="832" y2="768"><stop offset="0" stop-color="#F5EDD8"/><stop offset=".38" stop-color="#E6D7B2"/><stop offset=".62" stop-color="#F5EDD8"/><stop offset="1" stop-color="#DECB9F"/></linearGradient>
<path id="p-ring" fill-rule="evenodd" d="${p.ring}"/>
<path id="p-ring-clean" fill-rule="evenodd" d="${p.ring_clean}"/>
<path id="p-plum" fill-rule="evenodd" d="${p.plum}"/>
<path id="p-money" fill-rule="evenodd" d="${p.money}"/>
<path id="p-muss" fill-rule="evenodd" d="${p.muss}"/>
<path id="p-caps" fill-rule="evenodd" d="${p.caps}"/>
<path id="p-glass-line" d="${p.glass_outline}"/>
<path id="p-glass-fill" d="${p.glass_fill}"/>
<path id="p-glass-stem" d="${p.glass_stem}"/>
<path id="p-rules" d="M231 673.3h566v2.4H231zM231 792.1h559v2.4H231z"/>
</defs>
<symbol id="mm-logo" viewBox="0 0 1024 1024"><circle cx="514.5" cy="510" r="506" fill="${NAVY}"/><use href="#p-ring" fill="#F3EBD6"/><use href="#p-plum" fill="#4A3B40"/><use href="#p-money" fill="url(#g-script)"/><use href="#p-muss" fill="url(#g-script)"/><use href="#p-glass-line" fill="none" stroke="${ROSE}" stroke-width="5" stroke-linejoin="round"/><use href="#p-glass-fill" fill="${ROSE}"/><use href="#p-glass-stem" fill="${ROSE}"/><use href="#p-rules" fill="${ROSE}"/><use href="#p-caps" fill="url(#g-caps)"/></symbol>
<symbol id="mm-mark" viewBox="0 0 1024 1024"><circle cx="514.5" cy="510" r="506" fill="${NAVY}"/><use href="#p-ring-clean" fill="#F3EBD6"/><g transform="${MARK_T}" fill="url(#g-script)" stroke="url(#g-script)" stroke-width="7" stroke-linejoin="round"><use href="#p-money"/><use href="#p-muss"/></g></symbol>
<symbol id="mm-script" viewBox="130 214 698 460"><use href="#p-money"/><use href="#p-muss"/></symbol>
<symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" d="${starPath(12, 12, 11, 4.3)}"/></symbol>
<symbol id="i-glass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M3.5 4h17L12 13.5zM12 13.5V20M7.5 20.5h9"/><path d="M6.6 7.4h10.8L12 13.5z" fill="currentColor" stroke="none"/></symbol>
${icon('i-phone', '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>')}
${icon('i-menu', '<path d="M4 8h16M4 16h16"/>')}
${icon('i-close', '<path d="M6 6l12 12M18 6L6 18"/>')}
${icon('i-arrow', '<path d="M4 12h15M13 6l6 6-6 6"/>')}
${icon('i-out', '<path d="M8 16L17 7M9 7h8v8"/>')}
${icon('i-prev', '<path d="M15 5l-7 7 7 7"/>')}
${icon('i-next', '<path d="M9 5l7 7-7 7"/>')}
${icon('i-pin', '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')}
${icon('i-chat', '<path d="M4 19l1.5-4A8 8 0 1 1 9 18.3z"/>')}
</svg>`;
}

/* ---------------------------------------------------------------- address, sharing and search */

// Canonical link, og:url and absolute preview images, once the address is known.
function seoHTML() {
  if (SITE_KNOWN) {
    return `<link rel="canonical" href="${site()}">
<meta property="og:url" content="${site()}">
<meta property="og:image" content="${site('brand/og-image.jpg')}">
<meta name="twitter:image" content="${site('brand/og-image.jpg')}">`;
  }
  return `<!-- {{SITE_URL}} is not set yet. Put the website address in SITE_URL at the top of tools/build.mjs and run "npm run build":
     the canonical link, og:url and absolute preview-image links are then written here. -->
<meta property="og:image" content="brand/og-image.jpg">
<meta name="twitter:image" content="brand/og-image.jpg">`;
}

// The first photo a visitor sees is fetched early; every other photo is lazy.
function preloadHTML(html, manifest) {
  for (const m of html.matchAll(/<!-- build:photo (\{.*?\}) -->/g)) {
    let spec;
    try { spec = JSON.parse(m[1]); } catch { continue; }
    if (!spec.eager) continue;
    const photo = manifest[spec.img];
    if (!photo || !photo.present) return '';
    return `<link rel="preload" as="image" type="image/avif" imagesrcset="${srcset(spec.img, photo.widths, 'avif')}" imagesizes="${esc(spec.sizes)}" fetchpriority="high">`;
  }
  return '';
}

// The structured data keeps its facts in index.html; only the address-dependent fields are filled in here.
function structuredData(html) {
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (all, open, body, close) => {
    const data = JSON.parse(body);
    const out = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'url') continue;
      out[key] = value;
      if (key === 'alternateName' && SITE_KNOWN) out.url = site();
    }
    out.image = SITE_KNOWN ? site('brand/og-image.jpg') : 'brand/og-image.jpg';
    out.logo = SITE_KNOWN ? site('brand/logo.svg') : 'brand/logo.svg';
    return `${open}\n${JSON.stringify(out, null, 2)}\n${close}`;
  });
}

async function buildSearchFiles() {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site()}</loc>
  </url>
</urlset>
`;
  const robots = SITE_KNOWN
    ? `User-agent: *\nAllow: /\n\nSitemap: ${site('sitemap.xml')}\n`
    : `User-agent: *\nAllow: /\n\n# Sitemap: {{SITE_URL}}/sitemap.xml\n# The line above is switched on by "npm run build" once SITE_URL is set at the top of tools/build.mjs.\n`;
  await writeFile(join(ROOT, 'sitemap.xml'), sitemap);
  await writeFile(join(ROOT, 'robots.txt'), robots);
  log(`  search sitemap.xml, robots.txt  (${SITE_KNOWN ? SITE_URL : 'SITE_URL is still the {{SITE_URL}} placeholder'})`);
}

// The 404 page has to work from any address, at any depth, so it carries its own fonts.
async function inlineFontsHTML() {
  const face = async (family, file, weight) => {
    const data = (await readFile(join(ROOT, 'fonts', file))).toString('base64');
    return `@font-face { font-family: "${family}"; src: url("data:font/woff2;base64,${data}") format("woff2"); font-weight: ${weight}; font-style: normal; font-display: swap; }`;
  };
  return `<style>\n${await face('Gloock', 'gloock.woff2', '400')}\n${await face('DM Mono', 'dm-mono.woff2', '500')}\n</style>`;
}

/* ---------------------------------------------------------------- html */

function replaceBlocks(html, name, render) {
  const re = new RegExp(`(<!-- build:${name}( [^>]*?)? -->)[\\s\\S]*?(<!-- /build:${name} -->)`, 'g');
  let count = 0;
  const out = html.replace(re, (_, open, arg, close) => {
    count += 1;
    const body = render((arg || '').trim());
    return body ? `${open}\n${body}\n${close}` : `${open}\n${close}`;
  });
  return { out, count };
}

async function buildHTML(manifest) {
  const sprite = await spriteHTML();
  const inlineFonts = await inlineFontsHTML();
  const menu = JSON.parse(await readFile(join(ROOT, 'data', 'menu.json'), 'utf8'));
  const specials = JSON.parse(await readFile(join(ROOT, 'data', 'specials.json'), 'utf8'));
  const settings = JSON.parse(await readFile(join(ROOT, 'data', 'site.json'), 'utf8'));
  for (const page of ['index.html', '404.html']) {
    const file = join(ROOT, page);
    if (!existsSync(file)) continue;
    let html = await readFile(file, 'utf8');
    const counts = {};
    const run = (name, render) => { const r = replaceBlocks(html, name, render); html = r.out; counts[name] = r.count; };
    run('sprite', () => sprite);
    run('photo', (arg) => {
      let spec;
      try { spec = JSON.parse(arg); } catch (e) { throw new Error(`Bad photo block in ${page}: ${arg}\n${e.message}`); }
      if (!PHOTOS.includes(spec.img)) throw new Error(`Photo block in ${page} uses "${spec.img}", which is not one of: ${PHOTOS.join(', ')}`);
      if (!spec.sizes) throw new Error(`Photo block in ${page} for "${spec.img}" has no "sizes"`);
      return photoHTML(spec, manifest);
    });
    run('menu', () => menuHTML(menu));
    run('favourites', () => favouritesHTML(menu));
    run('specials', () => specialsHTML(specials));
    run('marquee', () => marqueeHTML(specials, seasonGreeting(settings.christmas)));
    run('count', () => countPhrase(specials));
    run('seo', () => seoHTML());
    const preload = preloadHTML(html, manifest);
    run('preload', () => preload);
    run('fonts-inline', () => inlineFonts);
    // On the 404 page, the icons and the way home have to work from any address: the full site address
    // once SITE_URL is known, the top of the domain until then.
    const at = (path = '') => (SITE_KNOWN ? site(path) : `/${path}`);
    run('icons', () => `<link rel="icon" href="${at('brand/favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${at('brand/favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${at('brand/apple-touch-icon.png')}">`);
    run('home', () => `    <a class="stubbtn" href="${at()}"><span class="stubbtn__paper"><span class="stubbtn__main">Back to the front</span><span class="stubbtn__stub" aria-hidden="true"><b>Admit</b><b>one</b></span></span></a>`);
    html = structuredData(html);
    // Lets the stylesheet know which photos exist, so a frame without its photo is never drawn.
    html = html.replace(/(<html[^>]*data-photos=")[^"]*(")/, `$1${PHOTOS.filter((n) => manifest[n].present).join(' ')}$2`);
    // When the Christmas touches show ("christmas" in data/site.json): the head of the page reads this before it first draws.
    html = html.replace(/(<html[^>]*data-xmas=")[^"]*(")/, `$1${seasonValue(settings.christmas)}$2`);
    await writeFile(file, html);
    log(`  html   ${page}  ` + Object.entries(counts).filter(([, c]) => c).map(([k, c]) => `${k}:${c}`).join('  '));
  }
}

/* ---------------------------------------------------------------- brand rasters */

async function buildBrand() {
  const brand = join(ROOT, 'brand');
  const mark = await readFile(join(brand, 'favicon.svg'));
  const logo = await readFile(join(brand, 'logo.svg'));
  const png = (svg, size) => sharp(svg, { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png({ compressionLevel: 9 });
  // Touch icons want a square with no transparency: sit the round mark on the navy.
  const onNavy = async (svg, size, pad) => {
    const inner = Math.round(size * (1 - pad * 2));
    const art = await png(svg, inner).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#2B2F3A' } })
      .composite([{ input: art, gravity: 'centre' }])
      .png({ compressionLevel: 9 });
  };
  await png(mark, 32).toFile(join(brand, 'favicon-32.png'));
  await (await onNavy(mark, 180, 0.06)).toFile(join(brand, 'apple-touch-icon.png'));
  await (await onNavy(mark, 192, 0.06)).toFile(join(brand, 'icon-192.png'));
  await (await onNavy(logo, 512, 0.06)).toFile(join(brand, 'icon-512.png'));
  // Open Graph card, 1200x630: the logo on the brand navy.
  const art = await png(logo, 540).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#2B2F3A' } })
    .composite([{ input: art, gravity: 'centre' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(brand, 'og-image.jpg'));
  log('  brand  favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.jpg');
}

/* ---------------------------------------------------------------- run */

log('Money Muss build');
const manifest = await buildPhotos();
await writeAccents(await sampleAccents(manifest));
await buildTextures();
await buildHTML(manifest);
await buildSearchFiles();
await buildBrand();
const missing = PHOTOS.filter((n) => !manifest[n].present);
if (missing.length) {
  const bar = '!'.repeat(72);
  log(`\n${bar}\n  ${missing.length} OF ${PHOTOS.length} PHOTOS ARE NOT IN /images YET.\n  Their frames are left off the page (no stand-ins), and "npm run check" will fail\n  until they are added. Put these files in money-muss/images and run the build again:\n`);
  for (const n of missing) log(`      images/${n}.jpg`);
  log(`${bar}\n`);
}
log('Done.');
