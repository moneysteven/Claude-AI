// Generates the static design assets used by the page:
//  - the gold "POSSESSIONS / Book Store" wordmark, outlined to SVG paths
//    (crisp at any resolution, no font download, no layout shift)
//  - the rotating ring text, outlined along a circle
//  - the sheen mask for the wordmark
//  - paper-grain tiles (AVIF / WebP / PNG)
//  - favicon
// Output goes to src/generated (snippets) and src/static (files copied to dist).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gen = path.join(root, 'src/generated');
const stat = path.join(root, 'src/static');
await fs.mkdir(gen, { recursive: true });
await fs.mkdir(path.join(stat, 'img'), { recursive: true });

const loadFont = async (pkg, file) => {
  const b = await fs.readFile(path.join(root, 'node_modules/@fontsource', pkg, 'files', file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const r1 = n => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- wordmark
const capsFont = await loadFont('playfair-display', 'playfair-display-latin-600-normal.woff');
const scriptFont = await loadFont('pinyon-script', 'pinyon-script-latin-400-normal.woff');

const CAP = 200;
const capsOpts = { letterSpacing: 0.075, kerning: true };
let p = capsFont.getPath('POSSESSIONS', 0, 0, CAP, capsOpts);
let bb = p.getBoundingBox();
const capsW = bb.x2 - bb.x1;
const capsH = bb.y2 - bb.y1;
const capsPath = capsFont.getPath('POSSESSIONS', -bb.x1, -bb.y1, CAP, capsOpts);
const capsD = capsPath.toPathData(1);

// Script: sized to ~54% of the caps width, centred, tucked under the caps
let sp = scriptFont.getPath('Book Store', 0, 0, 100);
let sb = sp.getBoundingBox();
const sSize = 100 * (capsW * 0.5) / (sb.x2 - sb.x1);
sp = scriptFont.getPath('Book Store', 0, 0, sSize);
sb = sp.getBoundingBox();
const sTop = capsH * 0.84;
const sx = capsW / 2 - (sb.x1 + sb.x2) / 2;
const sy = sTop - sb.y1;
const scriptPath = scriptFont.getPath('Book Store', sx, sy, sSize);
const scriptD = scriptPath.toPathData(1);
const scBox = scriptPath.getBoundingBox();
const totalH = scBox.y2;

// Hero wordmark viewBox with room for extrusion + shadow
const pad = { l: 24, r: 24, t: 20, b: 34 };
const vbW = r1(capsW + pad.l + pad.r);
const vbH = r1(Math.max(totalH, capsH) + pad.t + pad.b);
const EXTRUDE = 7; // layers of depth, 1 unit each

const extrude = Array.from({ length: EXTRUDE }, (_, i) => {
  const k = EXTRUDE - i; // draw deepest first
  const t = i / (EXTRUDE - 1);
  // deep umber -> burnished gold
  const c = mix([34, 20, 6], [120, 82, 28], t);
  return `<use href="#wm-caps" transform="translate(${r1(k * 0.55)} ${r1(k * 1)})" fill="rgb(${c.join(',')})"/>`;
}).join('');
const extrudeS = Array.from({ length: 3 }, (_, i) => {
  const k = 3 - i;
  const c = mix([34, 20, 6], [110, 76, 26], i / 2);
  return `<use href="#wm-script" transform="translate(${r1(k * 0.5)} ${r1(k * 0.9)})" fill="rgb(${c.join(',')})"/>`;
}).join('');

function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

const heroSvg = `<svg class="wm__svg" viewBox="0 0 ${vbW} ${vbH}" width="${Math.round(vbW)}" height="${Math.round(vbH)}" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="wm-face" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${r1(capsH)}">
<stop offset="0" stop-color="#fff4cf"/><stop offset=".16" stop-color="#f3d993"/><stop offset=".4" stop-color="#d2a650"/><stop offset=".52" stop-color="#9c6d27"/><stop offset=".6" stop-color="#c79a46"/><stop offset=".78" stop-color="#f4dc9c"/><stop offset="1" stop-color="#b98b3c"/>
</linearGradient>
<linearGradient id="wm-sface" gradientUnits="userSpaceOnUse" x1="0" y1="${r1(scBox.y1)}" x2="0" y2="${r1(scBox.y2)}">
<stop offset="0" stop-color="#fff1c4"/><stop offset=".35" stop-color="#e9c983"/><stop offset=".6" stop-color="#b8883a"/><stop offset=".8" stop-color="#f0d592"/><stop offset="1" stop-color="#a87a30"/>
</linearGradient>
<filter id="wm-bevel" x="-2%" y="-10%" width="104%" height="125%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="b"/>
<feSpecularLighting in="b" surfaceScale="5" specularConstant="1.05" specularExponent="20" lighting-color="#fff3d2" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>
<feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3=".9" k4="0"/>
</filter>
<filter id="wm-soft" x="-5%" y="-30%" width="110%" height="170%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<g transform="translate(${pad.l} ${pad.t})">
<use href="#wm-caps" transform="translate(4 16)" fill="#000" opacity=".55" filter="url(#wm-soft)"/>
<use href="#wm-script" transform="translate(3 12)" fill="#000" opacity=".5" filter="url(#wm-soft)"/>
${extrude}
<use href="#wm-caps" fill="url(#wm-face)" filter="url(#wm-bevel)"/>
<use href="#wm-caps" fill="none" stroke="#fff6d8" stroke-opacity=".28" stroke-width=".9"/>
<use href="#wm-script" fill="none" stroke="#0b2018" stroke-opacity=".9" stroke-width="9" stroke-linejoin="round"/>
${extrudeS}
<use href="#wm-script" fill="url(#wm-sface)" filter="url(#wm-bevel)"/>
</g>
</svg>`;

// Shared sprite: paths + icons. Hidden but NOT display:none (gradients need rendering)
const icons = {
  phone: '<path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a11.5 11.5 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6c0 1.1-.9 2-2 2C10.3 19.4 4.6 13.7 4.6 5.5c0-1.1.9-2 2-2Z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.6"/><path d="m4 6.5 8 6.2 8-6.2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M12 6.8C10.2 5.4 7.4 4.8 3.8 5v13c3.6-.2 6.4.4 8.2 1.8 1.8-1.4 4.6-2 8.2-1.8V5c-3.6-.2-6.4.4-8.2 1.8Z"/><path d="M12 6.8v13"/>',
  workbook: '<rect x="5" y="3.5" width="14" height="17" rx="1.4"/><path d="M8.5 3.5v17M11.5 8h4.5M11.5 11h4.5M11.5 14h3"/>',
  pencil: '<path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z"/><path d="m12.5 7.5 4 4"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18v-.5M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  directions: '<path d="M12 2.8 21.2 12 12 21.2 2.8 12 12 2.8Z"/><path d="M9 14v-2.5a1 1 0 0 1 1-1h5M13 8.5l2 2-2 2"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.5 1.2 1.2 2-2.4M3.5 12l1.2 1.2 2-2.4M4 17.5h1.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'sub-math': '<path d="M5 7.5h5.5M7.75 4.75v5.5M13.5 7.5H19M5.5 15l4.5 4.5M10 15l-4.5 4.5M13.5 15.5H19M13.5 18.5H19"/>',
  'sub-english': '<path d="M19.5 4.5C13 5 8.5 9.5 7 16l-1.5 3.5"/><path d="M19.5 4.5c-.5 5-3.5 9-9.5 11"/><path d="M10 11.5h4.5"/>',
  'sub-science': '<path d="M9.5 3.5h5M10.5 3.5v6L5.3 18a1.7 1.7 0 0 0 1.5 2.5h10.4a1.7 1.7 0 0 0 1.5-2.5l-5.2-8.5v-6"/><path d="M7.5 15h9"/>',
  'sub-social': '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5s1.1-6.2 3.5-8.5Z"/>',
  'sub-business': '<path d="M4 20h16M6.5 16.5v-4M11 16.5V8M15.5 16.5v-6M20 4.5l-5 4-3.5-2.5L5 10"/>',
  'sub-mixed': '<path d="M4 19.5h16M5 15.5h14v4H5zM6.5 11.5h11v4h-11zM8 7.5h8v4H8z"/>',
};
const sprite = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">
<defs>
<path id="wm-caps" d="${capsD}"/>
<path id="wm-script" d="${scriptD}"/>
<linearGradient id="gold-flat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4dc9c"/><stop offset=".55" stop-color="#c99f52"/><stop offset="1" stop-color="#e9cd8a"/></linearGradient>
${Object.entries(icons).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('\n')}
</defs>
</svg>`;

// Sheen mask (same geometry as the hero svg's visible letters)
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}"><g transform="translate(${pad.l} ${pad.t})"><path d="${capsD}"/><path d="${scriptD}"/></g></svg>`;

// ---------------------------------------------------------------- ring text
const jost = await loadFont('jost', 'jost-latin-500-normal.woff');
const ringText = 'TEXTBOOKS · WORKBOOKS · STATIONERY · BACK TO SCHOOL · ';
const R = 78, C = 100; // radius of text baseline, centre (viewBox 200)
const fs0 = 13.2;
const track = 2.6; // extra tracking, units
const glyphs = jost.stringToGlyphs(ringText);
const adv = glyphs.map(g => (g.advanceWidth / jost.unitsPerEm) * fs0 + track);
const total = adv.reduce((a, b) => a + b, 0);
const scaleAdv = (2 * Math.PI * R) / total; // spread evenly around the circle
let acc = 0;
let ringD = '';
glyphs.forEach((g, i) => {
  const w = adv[i] * scaleAdv;
  const mid = acc + w / 2;
  const ang = mid / R - Math.PI / 2; // start at 12 o'clock
  const gp = g.getPath(0, 0, fs0);
  const gw = (g.advanceWidth / jost.unitsPerEm) * fs0;
  // transform each command: centre glyph on its slot, rotate onto circle
  const cos = Math.cos(ang + Math.PI / 2), sin = Math.sin(ang + Math.PI / 2);
  const ox = C + R * Math.cos(ang), oy = C + R * Math.sin(ang);
  const tf = (x, y) => {
    const lx = x - gw / 2, ly = y + 4.6; // baseline sits slightly outside so caps are centred on R
    return [r1(ox + lx * cos - ly * sin), r1(oy + lx * sin + ly * cos)];
  };
  for (const c of gp.commands) {
    if (c.type === 'M' || c.type === 'L') ringD += c.type + tf(c.x, c.y).join(' ');
    else if (c.type === 'Q') ringD += 'Q' + [...tf(c.x1, c.y1), ...tf(c.x, c.y)].join(' ');
    else if (c.type === 'C') ringD += 'C' + [...tf(c.x1, c.y1), ...tf(c.x2, c.y2), ...tf(c.x, c.y)].join(' ');
    else if (c.type === 'Z') ringD += 'Z';
  }
  acc += w;
});
const ringSvg = `<svg class="ring__svg" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true" focusable="false"><path d="${ringD}" fill="currentColor"/></svg>`;

// ---------------------------------------------------------------- grain
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
async function grain(name, N, seed, alphaMax, bias) {
  const rand = rng(seed);
  const buf = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const light = rand() < bias;
    const v = light ? 255 : 20;
    const a = Math.floor(Math.pow(rand(), 2.2) * alphaMax);
    buf[i * 4] = v; buf[i * 4 + 1] = light ? 246 : 14; buf[i * 4 + 2] = light ? 225 : 8; buf[i * 4 + 3] = a;
  }
  const img = sharp(buf, { raw: { width: N, height: N, channels: 4 } });
  await img.clone().png({ compressionLevel: 9, palette: true, colors: 24, dither: 0 }).toFile(path.join(stat, 'img', `${name}.png`));
  await img.clone().webp({ quality: 70, alphaQuality: 60, effort: 6 }).toFile(path.join(stat, 'img', `${name}.webp`));
  await img.clone().avif({ quality: 45, effort: 6 }).toFile(path.join(stat, 'img', `${name}.avif`));
}
await grain('grain', 256, 7, 46, 0.5);

// ---------------------------------------------------------------- favicon (an open-book glyph, not a logo)
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0e2a1f"/><g fill="none" stroke="#e2c27a" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"><path d="M32 20c-4.8-3.6-12-5-20-4.6v31c8-.4 15.2 1 20 4.6 4.8-3.6 12-5 20-4.6v-31c-8-.4-15.2 1-20 4.6Z"/><path d="M32 20v31"/></g></svg>`;

await fs.writeFile(path.join(stat, 'img', 'wm-mask.svg'), maskSvg);
await fs.writeFile(path.join(stat, 'favicon.svg'), favicon);
await fs.writeFile(path.join(gen, 'wordmark.html'), heroSvg);
await fs.writeFile(path.join(gen, 'sprite.html'), sprite);
await fs.writeFile(path.join(gen, 'ring.html'), ringSvg);
await fs.writeFile(path.join(gen, 'meta.json'), JSON.stringify({
  capsW: r1(capsW), capsH: r1(capsH), vbW, vbH, pad,
}, null, 2));
console.log('assets ok', { capsW: r1(capsW), capsH: r1(capsH), vbW, vbH, scriptTop: r1(scBox.y1), scriptBottom: r1(scBox.y2) });
