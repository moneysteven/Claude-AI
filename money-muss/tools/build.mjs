// Money Muss build step:  npm run build
//
// The site is plain HTML/CSS/JS and can be hosted as-is. This script only refreshes
// the generated parts, and it is safe to run as often as you like:
//
//   1. Photos   images/<name>-clean.(jpg|jpeg|png|webp)  ->  images/opt/*.avif|webp|jpg
//               (auto-rotated, gently colour graded, several widths for srcset)
//   2. HTML     the blocks between  <!-- build:... -->  and  <!-- /build:... -->
//               in index.html and 404.html (logo sprite, photo slots, menu, specials)
//   3. Brand    favicon / touch icons / Open Graph image, drawn from the SVG logo
//
// Everything outside those marked blocks is left exactly as written.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { menuHTML, specialsHTML, esc } from '../js/templates.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMG = join(ROOT, 'images');
const OPT = join(IMG, 'opt');

// The only photographs this site may use. Drop the files into /images with these names.
const PHOTOS = ['logo-clean', 'exterior-clean', 'lounge-clean', 'bar-clean'];
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const WIDTHS = [480, 768, 1080, 1440, 1920];

// Gentle grade: a touch more colour and contrast so the photos look vivid but natural.
// Tune per photo here if one comes out too strong (1 = unchanged).
const GRADE = {
  default: { saturation: 1.08, brightness: 1.02, contrast: 1.04 },
  'logo-clean': { saturation: 1, brightness: 1, contrast: 1 },
};

const log = (...a) => console.log(...a);

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

function graded(input, name) {
  const g = { ...GRADE.default, ...(GRADE[name] || {}) };
  let img = sharp(input, { failOn: 'none' }).rotate(); // respect the phone's orientation tag
  if (g.saturation !== 1 || g.brightness !== 1) img = img.modulate({ saturation: g.saturation, brightness: g.brightness });
  if (g.contrast !== 1) img = img.linear(g.contrast, -(128 * g.contrast) + 128); // pivot contrast around mid grey
  return img;
}

// Which photos do the pages actually place? Only those need web-sized copies.
async function photosInUse() {
  const used = new Set();
  for (const page of ['index.html', '404.html']) {
    const file = join(ROOT, page);
    if (!existsSync(file)) continue;
    const html = await readFile(file, 'utf8');
    for (const m of html.matchAll(/<!-- build:photo (\{.*?\}) -->/g)) {
      try { used.add(JSON.parse(m[1]).img); } catch { /* reported later, when the block is rendered */ }
    }
  }
  return used;
}

async function buildPhotos() {
  await mkdir(OPT, { recursive: true });
  const used = await photosInUse();
  const manifest = {};
  for (const name of PHOTOS) {
    const src = await findSource(name);
    if (!src) {
      manifest[name] = { present: false };
      continue;
    }
    if (!used.has(name)) {
      // Kept in /images as the reference, but no page shows it (the logo is drawn as SVG instead).
      manifest[name] = { present: true, source: src.rel, placed: false };
      log(`  photo  ${src.rel}  kept as the source file; not placed on a page, so no web copies are made`);
      continue;
    }
    const input = await readFile(src.file);
    const meta = await sharp(input).rotate().metadata();
    const srcStat = await stat(src.file);
    // After .rotate() sharp reports the oriented size via autoOrient on newer versions; work it out safely.
    const swap = [5, 6, 7, 8].includes(meta.orientation || 1);
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    const widths = WIDTHS.filter((w) => w <= width);
    if (!widths.length || widths[widths.length - 1] < Math.min(width, WIDTHS[WIDTHS.length - 1])) {
      if (!widths.includes(width) && width < WIDTHS[WIDTHS.length - 1]) widths.push(width); // never upscale
    }
    widths.sort((a, b) => a - b);
    const stamp = `${srcStat.size}-${Math.round(srcStat.mtimeMs)}-${JSON.stringify(GRADE[name] || GRADE.default)}`;
    const stampFile = join(OPT, `${name}.stamp`);
    const fresh = existsSync(stampFile) && (await readFile(stampFile, 'utf8')) === stamp;
    if (!fresh) {
      for (const w of widths) {
        const base = () => graded(input, name).resize({ width: w, withoutEnlargement: true });
        await base().avif({ quality: 52, effort: 6 }).toFile(join(OPT, `${name}-${w}.avif`));
        await base().webp({ quality: 78, effort: 5 }).toFile(join(OPT, `${name}-${w}.webp`));
        await base().jpeg({ quality: 80, mozjpeg: true }).toFile(join(OPT, `${name}-${w}.jpg`));
      }
      await writeFile(stampFile, stamp);
    }
    // A tiny average colour to paint the frame while the photo loads.
    const { dominant } = await graded(input, name).resize(32).stats();
    const hex = '#' + [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('');
    manifest[name] = { present: true, source: src.rel, placed: true, width, height, widths, colour: hex };
    log(`  photo  ${src.rel}  ${width}x${height}  ->  ${widths.join(', ')}px  (avif, webp, jpg)${fresh ? '  [unchanged]' : ''}`);
  }
  await writeFile(join(IMG, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const srcset = (name, widths, ext) => widths.map((w) => `images/opt/${name}-${w}.${ext} ${w}w`).join(', ');

// One photo slot. If the photo file is not in /images yet, a brand-colour panel stands in.
function photoHTML(spec, manifest) {
  const m = manifest[spec.img];
  const pos = spec.pos || '50% 50%';
  if (!m || !m.present) {
    const tone = spec.tone || 'crimson';
    const label = `Photo to add: ${spec.img}.jpg`;
    return `<div class="stand-in stand-in--${tone}" role="img" aria-label="${esc(label)}. ${esc(spec.alt)}">
<svg class="stand-in__pattern" aria-hidden="true" focusable="false"><rect width="100%" height="100%" fill="url(#pat-glass)"/></svg>
<svg class="stand-in__ring" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false"><use href="#p-ring"/></svg>
<span class="stand-in__tag">${esc(label)}</span>
</div>`;
  }
  const fallbackW = m.widths.includes(1080) ? 1080 : m.widths[m.widths.length - 1];
  const attrs = spec.eager
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : 'loading="lazy" decoding="async"';
  const zoom = spec.zoom ? ` data-zoom="${esc(spec.zoom)}"` : '';
  const style = `object-position:${esc(pos)}${spec.zoom ? `;--zoom:${esc(spec.zoom)};transform-origin:${esc(pos)}` : ''}`;
  return `<picture>
<source type="image/avif" srcset="${srcset(spec.img, m.widths, 'avif')}" sizes="${esc(spec.sizes)}">
<source type="image/webp" srcset="${srcset(spec.img, m.widths, 'webp')}" sizes="${esc(spec.sizes)}">
<img class="photo${spec.zoom ? ' photo--zoom' : ''}" src="images/opt/${spec.img}-${fallbackW}.jpg" srcset="${srcset(spec.img, m.widths, 'jpg')}" sizes="${esc(spec.sizes)}" width="${m.width}" height="${m.height}" alt="${esc(spec.alt)}" ${attrs} data-source="${esc(m.source)}"${zoom} style="${style}">
</picture>`;
}

/* ---------------------------------------------------------------- sprite */

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
<pattern id="pat-glass" width="72" height="96" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8 12h26L21 27zM21 27v15M14 42h14"/><path d="M44 60h26L57 75zM57 75v15M50 90h14"/></g></pattern>
</defs>
<symbol id="mm-logo" viewBox="0 0 1024 1024"><circle cx="514.5" cy="510" r="506" fill="${NAVY}"/><use href="#p-ring" fill="#F3EBD6"/><use href="#p-plum" fill="#4A3B40"/><use href="#p-money" fill="url(#g-script)"/><use href="#p-muss" fill="url(#g-script)"/><use href="#p-glass-line" fill="none" stroke="${ROSE}" stroke-width="5" stroke-linejoin="round"/><use href="#p-glass-fill" fill="${ROSE}"/><use href="#p-glass-stem" fill="${ROSE}"/><use href="#p-rules" fill="${ROSE}"/><use href="#p-caps" fill="url(#g-caps)"/></symbol>
<symbol id="mm-mark" viewBox="0 0 1024 1024"><circle cx="514.5" cy="510" r="506" fill="${NAVY}"/><use href="#p-ring-clean" fill="#F3EBD6"/><g transform="${MARK_T}" fill="url(#g-script)" stroke="url(#g-script)" stroke-width="7" stroke-linejoin="round"><use href="#p-money"/><use href="#p-muss"/></g></symbol>
${icon('i-phone', '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>')}
${icon('i-menu', '<path d="M4 8h16M4 16h16"/>')}
${icon('i-close', '<path d="M6 6l12 12M18 6L6 18"/>')}
${icon('i-arrow', '<path d="M5 12h14M13 6l6 6-6 6"/>')}
${icon('i-out', '<path d="M8 16L17 7M9 7h8v8"/>')}
${icon('i-prev', '<path d="M15 5l-7 7 7 7"/>')}
${icon('i-next', '<path d="M9 5l7 7-7 7"/>')}
${icon('i-pin', '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')}
${icon('i-clock', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}
${icon('i-chat', '<path d="M4 19l1.5-4A8 8 0 1 1 9 18.3z"/>')}
</svg>`;
}

/* ---------------------------------------------------------------- html */

function replaceBlocks(html, name, render) {
  const re = new RegExp(`(<!-- build:${name}( [^>]*?)? -->)[\\s\\S]*?(<!-- /build:${name} -->)`, 'g');
  let count = 0;
  const out = html.replace(re, (_, open, arg, close) => {
    count += 1;
    return `${open}\n${render((arg || '').trim())}\n${close}`;
  });
  return { out, count };
}

async function buildHTML(manifest) {
  const sprite = await spriteHTML();
  const menu = JSON.parse(await readFile(join(ROOT, 'data', 'menu.json'), 'utf8'));
  const specials = JSON.parse(await readFile(join(ROOT, 'data', 'specials.json'), 'utf8'));
  for (const page of ['index.html', '404.html']) {
    const file = join(ROOT, page);
    if (!existsSync(file)) continue;
    let html = await readFile(file, 'utf8');
    const counts = {};
    let r = replaceBlocks(html, 'sprite', () => sprite);
    html = r.out; counts.sprite = r.count;
    r = replaceBlocks(html, 'photo', (arg) => {
      let spec;
      try { spec = JSON.parse(arg); } catch (e) { throw new Error(`Bad photo block in ${page}: ${arg}\n${e.message}`); }
      if (!PHOTOS.includes(spec.img)) throw new Error(`Photo block in ${page} uses "${spec.img}", which is not one of: ${PHOTOS.join(', ')}`);
      return photoHTML(spec, manifest);
    });
    html = r.out; counts.photo = r.count;
    r = replaceBlocks(html, 'menu', () => menuHTML(menu));
    html = r.out; counts.menu = r.count;
    r = replaceBlocks(html, 'specials', () => specialsHTML(specials));
    html = r.out; counts.specials = r.count;
    // Lets the page know which photos exist without a network request.
    html = html.replace(/(<html[^>]*data-photos=")[^"]*(")/, `$1${PHOTOS.filter((n) => manifest[n].present).join(' ')}$2`);
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
const missing = PHOTOS.filter((n) => !manifest[n].present);
await buildHTML(manifest);
await buildBrand();
if (missing.length) {
  log(`\n  Still waiting on ${missing.length} photo(s). Add these to /images and run "npm run build" again:`);
  for (const n of missing) log(`    images/${n}.jpg`);
}
log('Done.');
