// Site audit:  npm run check
//
// 1. Every image on the site, and proof that each one comes from the four allowed photo files.
// 2. Every "[Owner to fill in: …]" still on the site, with where to find it.
// 3. Links, alt text and other basics.
//
// Reads the built files directly; if Playwright is installed it also opens the page in a
// browser and inspects what is really drawn (including CSS background images).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ALLOWED = ['logo-clean', 'exterior-clean', 'lounge-clean', 'bar-clean'];
const read = (p) => readFile(join(ROOT, p), 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };

// Which of the four source files does an image path come from?
function sourceOf(url) {
  const clean = url.split('?')[0].replace(/^\.?\//, '');
  const direct = clean.match(/^images\/([a-z-]+)\.(jpe?g|png|webp)$/i);
  if (direct && ALLOWED.includes(direct[1])) return direct[1];
  const variant = clean.match(/^images\/opt\/([a-z-]+)-\d+\.(avif|webp|jpg)$/i);
  if (variant && ALLOWED.includes(variant[1])) return variant[1];
  return null;
}

/* ------------------------------------------------------------ 1. images */
console.log('\n1. IMAGES\n');
const pages = ['index.html', '404.html'].filter((p) => existsSync(join(ROOT, p)));
const manifest = JSON.parse(await read('images/manifest.json'));
console.log('  The four allowed source files:');
for (const name of ALLOWED) {
  const m = manifest[name] || {};
  console.log(`    images/${name}.jpg   ${m.present ? `in the project${m.placed ? `, ${m.width}x${m.height}` : ' (kept as the reference for the SVG logo; not shown as a photo)'}` : 'NOT IN THE PROJECT YET'}`);
}

for (const page of pages) {
  const html = await read(page);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)];
  const sources = [...html.matchAll(/<source\b[^>]*>/g)];
  console.log(`\n  ${page}: ${imgs.length} <img>, ${sources.length} <source>`);
  for (const m of imgs) {
    const tag = m[0];
    const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || '';
    const srcset = (tag.match(/\ssrcset="([^"]*)"/) || [])[1] || '';
    const alt = tag.match(/\salt="([^"]*)"/);
    const urls = [src, ...srcset.split(',').map((s) => s.trim().split(/\s+/)[0])].filter(Boolean);
    const from = new Set(urls.map(sourceOf));
    const ok = urls.length && !from.has(null) && from.size === 1;
    console.log(`    line ${String(lineOf(html, m.index)).padStart(4)}  ${ok ? 'OK  ' : 'FAIL'}  <img src="${src}">  ->  ${ok ? `images/${[...from][0]}.jpg` : 'NOT ONE OF THE FOUR FILES'}  (${urls.length} sizes)`);
    if (!ok) fail(`${page} line ${lineOf(html, m.index)}: <img> does not come from the four allowed files`);
    if (!alt) fail(`${page} line ${lineOf(html, m.index)}: <img> has no alt text`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) fail(`${page} line ${lineOf(html, m.index)}: <img> has no width/height`);
  }
  for (const m of sources) {
    const srcset = (m[0].match(/\ssrcset="([^"]*)"/) || [])[1] || '';
    const urls = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
    if (urls.some((u) => !sourceOf(u))) fail(`${page} line ${lineOf(html, m.index)}: <source> points outside the four allowed files`);
  }
  const standIns = [...html.matchAll(/class="stand-in__tag">([^<]*)</g)].map((m) => m[1]);
  if (standIns.length) {
    console.log(`\n    ${standIns.length} photo slot(s) are showing a brand-colour panel because the file is missing:`);
    const counts = {};
    standIns.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    for (const [label, n] of Object.entries(counts)) console.log(`      ${label}  (${n} slot${n > 1 ? 's' : ''})`);
  }
  const inlineBg = [...html.matchAll(/style="[^"]*url\(([^)]*)\)/g)];
  if (inlineBg.length) inlineBg.forEach((m) => fail(`${page}: inline background image ${m[1]}`));
}

const css = await read('css/styles.css');
const cssUrls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
const cssImages = cssUrls.filter((u) => !/\.woff2$/.test(u));
console.log(`\n  css/styles.css: ${cssUrls.length} url() in total, ${cssUrls.length - cssImages.length} of them font files, ${cssImages.length} background image files`);
cssImages.forEach((u) => { if (!sourceOf(u.replace(/^\.\.\//, ''))) fail(`css background image ${u} is not one of the four files`); });

const headImages = [...(await read('index.html')).matchAll(/<(?:meta|link)\b[^>]*(?:content|href)="([^"]+\.(?:png|jpe?g|svg|webp))"[^>]*>/g)].map((m) => m[1]);
console.log('\n  Not photographs (brand marks drawn from the SVG logo, for browser tabs and link previews):');
[...new Set(headImages)].forEach((u) => console.log(`    ${u}`));
console.log('    inline SVG: the logo, the nav mark, the martini glass and the line icons are drawn in code');

/* ------------------------------------------------------------ 2. owner placeholders */
console.log('\n2. STILL TO FILL IN\n');
const TODO = /\[Owner to fill in:[^\]]*\]/g;
let total = 0;
const seenInData = new Set();
for (const file of ['data/menu.json', 'data/specials.json', 'data/site.json']) {
  const text = await read(file);
  const found = [...text.matchAll(TODO)].filter((m) => !text.slice(text.lastIndexOf('\n', m.index), m.index).includes('_how_to_edit'));
  if (file === 'data/menu.json') {
    const prices = (text.match(/"price":\s*null/g) || []).length;
    if (prices) { console.log(`  ${file}  ${prices} prices are still empty ("price": null)`); total += 1; }
  }
  if (file === 'data/site.json') {
    const site = JSON.parse(text);
    for (const key of ['whatsappNumber', 'enquiryEmail']) if (!site[key]) { console.log(`  ${file}  "${key}" is empty`); total += 1; }
  }
  const counts = {};
  found.forEach((m) => { counts[m[0]] = counts[m[0]] || { n: 0, line: lineOf(text, m.index) }; counts[m[0]].n += 1; seenInData.add(m[0]); });
  for (const [label, info] of Object.entries(counts)) { console.log(`  ${file}:${info.line}  ${label}${info.n > 1 ? `  (x${info.n})` : ''}`); total += 1; }
}
{
  const html = await read('index.html');
  // Skip what the build stamped in from the data files; those are listed above.
  const body = html.replace(/<!-- build:(menu|specials) -->[\s\S]*?<!-- \/build:\1 -->/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of body.matchAll(TODO)) { console.log(`  index.html:${lineOf(body, m.index)}  ${m[0]}`); total += 1; }
  if (/YOUR-ADDRESS/.test(html)) { console.log(`  index.html:${lineOf(html, html.indexOf('YOUR-ADDRESS'))}  website address (for canonical link and absolute preview-image links), once the site has a domain`); }
}
const missing = ALLOWED.filter((n) => !(manifest[n] || {}).present);
if (missing.length) console.log(`\n  Photos still to add: ${missing.map((n) => `images/${n}.jpg`).join(', ')}`);

/* ------------------------------------------------------------ 3. basics */
console.log('\n3. BASICS\n');
{
  const html = await read('index.html');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/<a\b[^>]*\shref="#([^"]+)"/g)].map((m) => m[1]);
  const broken = [...new Set(anchors.filter((a) => !ids.has(a)))];
  console.log(`  in-page links: ${anchors.length}, broken: ${broken.length ? broken.join(', ') : 'none'}`);
  broken.forEach((b) => fail(`link to #${b} has no matching section`));
  const blank = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].filter((m) => !/rel="[^"]*noopener/.test(m[0]));
  console.log(`  new-tab links without rel="noopener": ${blank.length}`);
  blank.forEach(() => fail('a new-tab link is missing rel="noopener"'));
  const tels = [...new Set([...html.matchAll(/href="(tel:[^"]+)"/g)].map((m) => m[1]))];
  console.log(`  click-to-call numbers: ${tels.join(', ')}`);
  const h = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const jumps = h.filter((level, i) => i > 0 && level - h[i - 1] > 1).length;
  console.log(`  headings: ${h.length} (one h1: ${h.filter((x) => x === 1).length === 1}), skipped levels: ${jumps}`);
  if (jumps) fail('a heading level is skipped');
  try { JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]); console.log('  JSON-LD: parses'); } catch (e) { fail(`JSON-LD does not parse: ${e.message}`); }
}

/* ------------------------------------------------------------ live check in a browser (optional) */
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* fine: static checks only */ }
if (chromium) {
  const port = 4800 + Math.floor(Math.random() * 100);
  const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(/google\.[a-z.]+\/maps/, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  await page.goto(`http://localhost:${port}/?intro=0`);
  await page.evaluate(() => document.fonts.ready);
  const live = await page.evaluate(() => {
    const bg = new Set();
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const value = getComputedStyle(el, pseudo).backgroundImage;
        for (const m of value.matchAll(/url\("?([^")]+)"?\)/g)) bg.add(m[1]);
      }
    }
    return {
      backgrounds: [...bg],
      imgs: Array.from(document.images).map((i) => i.getAttribute('src')),
      svgImages: document.querySelectorAll('svg image').length,
      videos: document.querySelectorAll('video').length,
      todos: document.querySelectorAll('.todo').length,
    };
  });
  await browser.close();
  server.kill();
  console.log('\n  In the browser (desktop, page fully rendered):');
  console.log(`    <img> elements drawn: ${live.imgs.length}; CSS background image files: ${live.backgrounds.length}; SVG <image>: ${live.svgImages}; <video>: ${live.videos}`);
  live.backgrounds.forEach((u) => fail(`background image file in use: ${u}`));
  live.imgs.forEach((u) => { if (!sourceOf(u || '')) fail(`<img src="${u}"> is not from the four allowed files`); });
  console.log(`    visible "[Owner to fill in]" markers on the page: ${live.todos}`);
}

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll checks passed.\n');
process.exitCode = failures ? 1 : 0;
