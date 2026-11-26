// Site audit:  npm run check
//
// 1. Every image on the site, with proof that each one comes from the nine real photo files
//    or from one of the owner's own video clips (tools/clips.mjs).
//    A photo that is missing from /images FAILS the check, loudly. There are no stand-ins.
// 2. Every "[Owner to fill in: …]" and "[Owner to confirm …]" still on the site, and where it is.
// 3. Links, alt text, headings and other basics.
// 4. The redesign guard: the old templated patterns must stay gone.
// 5. The location and motion guard: the old address stays gone, and motion uses only the shared tokens.
// 6. The Christmas touches (pepper lights over the opening video, a greeting in the red strip): drawn in code,
//    switched by data/site.json, and out of the page out of season.
//
// Reads the built files directly; if Playwright is installed it also opens the page in a
// browser and inspects what is really drawn (including CSS background images).
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTOS, VARIANTS, EXTENSIONS, TEXTURES } from './photos.mjs';
import { CLIPS, CLIP_NAMES } from './clips.mjs';
import { seasonValue, seasonGreeting, esc } from '../js/templates.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFile(join(ROOT, p), 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// Which of the nine source files does an image path come from? (null = none of them)
function sourceOf(url) {
  const clean = String(url || '').split('?')[0].replace(/^(\.\.\/|\.\/|\/)+/, '');
  const direct = clean.match(/^images\/([a-z-]+)\.(jpe?g|png|webp)$/i);
  if (direct && PHOTOS.includes(direct[1])) return direct[1];
  const cut = clean.match(/^images\/opt\/([a-z-]+?)(?:-(duo))?-\d+\.(avif|webp|jpg)$/i);
  if (cut && PHOTOS.includes(cut[1]) && (!cut[2] || (VARIANTS[cut[1]] || []).includes(cut[2]))) return cut[1];
  // The owner's logo, cut round by the build step: brand/logo-<size>.<ext> (and the icons made from it).
  if (/^brand\/(?:logo-\d+\.(?:avif|webp|png)|favicon-32\.png|apple-touch-icon\.png|icon-(?:192|512)\.png|og-image\.jpg)$/i.test(clean)) return 'logo-clean';
  // A still or a web copy of one of the owner's clips: video/opt/<clip>-<shape>-still.<ext> or video/opt/<clip>-<shape>.<codec>.mp4
  const clip = clean.match(/^video\/opt\/([a-z-]+)-([a-z]+)(?:-still(?:-small)?\.(?:avif|webp|jpg)|\.(?:av1|h264)\.mp4)$/i);
  if (clip && CLIP_NAMES.includes(clip[1]) && CLIPS.find((c) => c.name === clip[1]).shapes.some((sh) => sh.key === clip[2])) return `clip:${clip[1]}`;
  return null;
}
const fromText = (src) => (String(src).startsWith('clip:') ? `the owner's clip ${src.slice(5)} (video/source/${src.slice(5)}.mov)` : `images/${src}.jpg`);
const isTexture = (url) => TEXTURES.includes(String(url || '').split('?')[0].replace(/^(\.\.\/|\.\/|\/)+/, '').replace(/^.*?(brand\/)/, '$1'));

/* ------------------------------------------------------------ 1. images */
console.log('\n1. IMAGES\n');
const pages = ['index.html', '404.html'].filter((p) => existsSync(join(ROOT, p)));
const manifest = JSON.parse(await read('images/manifest.json'));
const inImages = existsSync(join(ROOT, 'images')) ? readdirSync(join(ROOT, 'images')) : [];
const missing = [];
console.log(`  The ${PHOTOS.length} photo files this site may use:`);
for (const name of PHOTOS) {
  const file = inImages.find((f) => EXTENSIONS.some((ext) => f.toLowerCase() === `${name}.${ext}`));
  const m = manifest[name] || {};
  if (!file) { missing.push(name); console.log(`    MISSING  images/${name}.jpg`); continue; }
  if (!m.present) { fail(`images/${file} is in the folder but has not been built: run "npm run build"`); continue; }
  // Every size must exist as AVIF and WebP (and the JPEG fallback), for the photo and for each extra treatment.
  const stems = [name, ...(m.variants || []).map((v) => `${name}-${v}`)];
  const absent = [];
  for (const stem of stems) for (const w of m.widths) for (const ext of ['avif', 'webp', 'jpg']) if (!existsSync(join(ROOT, 'images', 'opt', `${stem}-${w}.${ext}`))) absent.push(`${stem}-${w}.${ext}`);
  if (absent.length) fail(`images/opt is missing ${absent.length} file(s) for ${name} (${absent.slice(0, 3).join(', ')}…): run "npm run build"`);
  console.log(`    ok       images/${file}   ${m.width}x${m.height}  ->  AVIF + WebP + JPG at ${m.widths.join(', ')}px${(m.variants || []).length ? `  (+ ${m.variants.join(', ')})` : ''}`);
}

// The owner's video clips: each one's web copies (AV1 and H.264, no sound) and its still must all be here.
const clipFile = join(ROOT, 'video', 'manifest.json');
const clipMade = existsSync(clipFile) ? JSON.parse(await read('video/manifest.json')) : {};
console.log(`\n  The ${CLIPS.length} video clips this site may use (the owner's own; "npm run video" makes the web copies):`);
for (const clip of CLIPS) {
  const m = clipMade[clip.name];
  if (!m || !m.present) { fail(`video clip ${clip.name} has not been made: put the original in video/source/${clip.name}.mov and run "npm run video"`); continue; }
  const absent = m.shapes.flatMap((sh) => [...sh.files.map((f) => f.src), ...Object.values(sh.still).filter((v) => typeof v === 'string')]).filter((f) => !existsSync(join(ROOT, f)));
  if (absent.length) { fail(`video clip ${clip.name}: ${absent.length} web file(s) missing (${absent.slice(0, 2).join(', ')}): run "npm run video"`); continue; }
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`    ok       ${clip.name.padEnd(15)} ${m.shapes.map((sh) => `${sh.width}x${sh.height} ${sh.seconds}s (${sh.files.map((f) => `${/av01/.test(f.type) ? 'AV1' : 'H.264'} ${kb(f.bytes)}`).join(', ')})`).join('; ')}  from ${m.source}`);
}

let imgCount = 0;
for (const page of pages) {
  const html = await read(page);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)];
  const sources = [...html.matchAll(/<source\b[^>]*>/g)];
  imgCount += imgs.length;
  console.log(`\n  ${page}: ${imgs.length} <img>, ${sources.length} <source>`);
  for (const m of imgs) {
    const tag = m[0];
    const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || '';
    const srcset = (tag.match(/\ssrcset="([^"]*)"/) || [])[1] || '';
    const urls = [src, ...srcset.split(',').map((s) => s.trim().split(/\s+/)[0])].filter(Boolean);
    const from = new Set(urls.map(sourceOf));
    const ok = urls.length && !from.has(null) && from.size === 1;
    console.log(`    line ${String(lineOf(html, m.index)).padStart(4)}  ${ok ? 'OK  ' : 'FAIL'}  <img src="${src}">  ->  ${ok ? fromText([...from][0]) : 'NOT ONE OF THE NINE FILES OR THE CLIPS'}  (${urls.length} sizes)`);
    if (!ok) fail(`${page} line ${lineOf(html, m.index)}: <img> does not come from the nine allowed files or the owner's clips`);
    if (!/\salt="/.test(tag)) fail(`${page} line ${lineOf(html, m.index)}: <img> has no alt attribute`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) fail(`${page} line ${lineOf(html, m.index)}: <img> has no width/height`);
  }
  for (const m of sources) {
    const srcset = (m[0].match(/\ssrcset="([^"]*)"/) || [])[1] || '';
    const urls = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
    if (urls.some((u) => !sourceOf(u))) fail(`${page} line ${lineOf(html, m.index)}: <source> points outside the nine allowed files and the owner's clips`);
    if (!/type="image\/(avif|webp)"/.test(m[0]) && !(/type="image\/jpeg"/.test(m[0]) && /\smedia="/.test(m[0]))) fail(`${page} line ${lineOf(html, m.index)}: <source> is not AVIF or WebP`);
  }
  if (/stand-in|Photo to add/i.test(html)) fail(`${page} still contains a stand-in panel for a missing photo`);
  for (const m of html.matchAll(/style="[^"]*url\(([^)]*)\)/g)) fail(`${page}: inline background image ${m[1]}`);
  for (const m of html.matchAll(/<(?:object|embed)\b|<svg[^>]*>[\s\S]*?<image\b/g)) fail(`${page} line ${lineOf(html, m.index)}: an embedded picture or video that is not one of the nine photos`);
  // A <video> is only ever one of the owner's clips: silent, never starting on its own from the markup, fetched by the script.
  for (const m of html.matchAll(/<video\b[^>]*>/g)) {
    const tag = m[0];
    let list = [];
    try { list = JSON.parse(((tag.match(/\sdata-sources="([^"]*)"/) || [])[1] || '[]').replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch (e) { list = []; }
    const where = `${page} line ${lineOf(html, m.index)}`;
    if (!/class="clip__video/.test(tag) || !list.length || list.some((f) => !String(sourceOf(f.src)).startsWith('clip:'))) fail(`${where}: a <video> that is not one of the owner's clips`);
    else if (!/\smuted\b/.test(tag) || /\sautoplay\b/.test(tag) || /\ssrc="/.test(tag) || !/preload="none"/.test(tag)) fail(`${where}: a clip's <video> must be muted, carry no src and no autoplay, and preload nothing (the script starts it)`);
  }
}

const css = await read('css/styles.css');
const cssUrls = [...css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^"')\s]+))\s*\)/g)].map((m) => m[1] || m[2] || m[3]);
const cssFonts = cssUrls.filter((u) => /\.woff2$/.test(u));
const cssDrawn = cssUrls.filter((u) => /^data:image\/svg\+xml,/.test(u));      // a drawing written out in the stylesheet itself
const cssOther = cssUrls.filter((u) => !/\.woff2$/.test(u) && !cssDrawn.includes(u) && !u.startsWith('#'));      // url(#g-gilt): a gradient in the page's own SVG
console.log(`\n  css/styles.css: ${cssUrls.length} url() in total: ${cssFonts.length} font files, ${cssOther.length} picture files, ${cssDrawn.length} drawings written out as SVG`);
if (cssDrawn.length) console.log(`    OK    ${cssDrawn.length} SVG drawings in the stylesheet (the Christmas pepper lights and their glow; drawn in code, not photographs)`);
for (const u of new Set(cssOther)) {
  if (sourceOf(u)) { console.log(`    OK    ${u}  ->  images/${sourceOf(u)}.jpg`); continue; }
  if (isTexture(u)) { console.log(`    OK    ${u}  (texture drawn from noise by the build step; not a photograph)`); continue; }
  fail(`css background image ${u} is neither one of the nine photos nor a generated texture`);
}
for (const t of TEXTURES) if (!existsSync(join(ROOT, t))) fail(`${t} is missing: run "npm run build"`);
const SCRIPTS = ['js/main.js', 'js/lightbox.js', 'js/scratch.js', 'js/pointer.js', 'js/templates.js'];
for (const file of SCRIPTS) {
  if (!existsSync(join(ROOT, file))) continue;
  const js = await read(file);
  if (/\.(jpe?g|png|webp|avif|gif)\b/i.test(js)) fail(`${file} names a picture file directly`);
  if (/stand-in|Photo to add/i.test(js)) fail(`${file} still builds a stand-in panel`);
}

const headImages = [...(await read('index.html')).matchAll(/<(?:meta|link)\b[^>]*(?:content|href)="([^"]+\.(?:png|jpe?g|svg|webp))"[^>]*>/g)].map((m) => m[1]);
console.log('\n  Not photographs (brand marks drawn from the SVG logo, for browser tabs and link previews):');
[...new Set(headImages)].forEach((u) => console.log(`    ${u}`));
console.log('    inline SVG: the logo, nav mark, signature, martini glass, stamps, token and icons are drawn in code');

if (missing.length) {
  const bar = '!'.repeat(76);
  console.log(`\n${bar}`);
  console.log(`  FAIL: ${missing.length} OF ${PHOTOS.length} PHOTOS ARE MISSING FROM /images`);
  console.log('  The page leaves their frames out (no stand-in panels are shipped), so these');
  console.log('  parts of the design are not showing yet. Add the files, then "npm run build":\n');
  for (const n of missing) console.log(`      images/${n}.jpg`);
  console.log(`${bar}`);
  failures += missing.length;
}

/* ------------------------------------------------------------ 2. owner placeholders */
console.log('\n2. STILL TO FILL IN OR CONFIRM\n');
const TODO = /\[Owner to (?:fill in|confirm)[^\]]*\]/g;
let total = 0;
for (const file of ['data/menu.json', 'data/specials.json', 'data/site.json']) {
  const text = await read(file);
  const found = [...text.matchAll(TODO)].filter((m) => !text.slice(text.lastIndexOf('\n', m.index), m.index).includes('_how_to_edit'));
  if (file === 'data/menu.json') {
    const prices = (text.match(/"price":\s*null/g) || []).length;
    if (prices) { console.log(`  ${file}  ${prices} prices are still empty ("price": null)`); total += 1; }
  }
  if (file === 'data/site.json') {
    const site = JSON.parse(text);
    for (const key of ['web3formsKey', 'enquiryEmail', 'whatsappNumber']) if (!site[key]) { console.log(`  ${file}  "${key}" is empty`); total += 1; }
  }
  const counts = {};
  found.forEach((m) => { counts[m[0]] = counts[m[0]] || { n: 0, line: lineOf(text, m.index) }; counts[m[0]].n += 1; });
  for (const [label, info] of Object.entries(counts)) { console.log(`  ${file}:${info.line}  ${label}${info.n > 1 ? `  (x${info.n})` : ''}`); total += 1; }
}
{
  const html = await read('index.html');
  // Skip what the build stamped in from the data files; those are listed above.
  const body = html.replace(/<!-- build:(menu|favourites|specials|marquee|count) -->[\s\S]*?<!-- \/build:\1 -->/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of body.matchAll(TODO)) { console.log(`  index.html:${lineOf(body, m.index)}  ${m[0]}`); total += 1; }
}
{
  // The website address lives in one place: SITE_URL at the top of the build script.
  const build = await read('tools/build.mjs');
  const at = build.indexOf("const SITE_URL = '{{SITE_URL}}'");
  if (at >= 0) { console.log(`  tools/build.mjs:${lineOf(build, at)}  {{SITE_URL}}: the website address (canonical link, og:url, share-image links, sitemap), once the site has a domain`); total += 1; }
}
if (missing.length) console.log(`  images/  ${missing.length} photo(s): ${missing.map((n) => `${n}.jpg`).join(', ')}`);
console.log(`\n  ${total} placeholder entries listed above.`);

/* ------------------------------------------------------------ 3. basics */
console.log('\n3. BASICS\n');
{
  const html = await read('index.html');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/<a\b[^>]*\shref="#([^"]+)"/g)].map((m) => m[1]);
  const broken = [...new Set(anchors.filter((a) => !ids.has(a)))];
  console.log(`  in-page links: ${anchors.length}, broken: ${broken.length ? broken.join(', ') : 'none'}`);
  broken.forEach((b) => fail(`link to #${b} has no matching section`));
  const dupes = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((id, i, all) => all.indexOf(id) !== i);
  if (dupes.length) fail(`repeated id(s): ${[...new Set(dupes)].join(', ')}`);
  const blank = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].filter((m) => !/rel="[^"]*noopener/.test(m[0]));
  console.log(`  new-tab links without rel="noopener": ${blank.length}`);
  blank.forEach(() => fail('a new-tab link is missing rel="noopener"'));
  const tels = [...new Set([...html.matchAll(/href="(tel:[^"]+)"/g)].map((m) => m[1]))];
  console.log(`  click-to-call numbers: ${tels.join(', ')}`);
  const h = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const jumps = h.filter((level, i) => i > 0 && level - h[i - 1] > 1).length;
  console.log(`  headings: ${h.length} (one h1: ${h.filter((x) => x === 1).length === 1}), skipped levels: ${jumps}`);
  if (jumps) fail('a heading level is skipped');
  if (h.filter((x) => x === 1).length !== 1) fail('the page needs exactly one h1');
  try { JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]); console.log('  JSON-LD: parses'); } catch (e) { fail(`JSON-LD does not parse: ${e.message}`); }
  const fontFiles = readdirSync(join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2'));
  const preloads = [...html.matchAll(/<link rel="preload"[^>]*as="font"[^>]*>/g)].length;
  console.log(`  fonts: ${fontFiles.length} file(s) (${fontFiles.join(', ')}), ${preloads} preloaded`);
  if (fontFiles.length > 4) fail('more than four font files (Gloock, Bricolage Grotesque, DM Mono and the Great Vibes script)');
  if (preloads > 3) fail('more than three font preloads');
  for (const file of ['data/menu.json', 'data/specials.json', 'data/site.json']) { try { JSON.parse(await read(file)); } catch (e) { fail(`${file} is not valid JSON: ${e.message}`); } }
  console.log('  data files: valid JSON');
  const specials = JSON.parse(await read('data/specials.json'));
  if ((specials.specials || []).some((s) => /beer back/i.test(`${s.title} ${s.id}`))) fail('data/specials.json lists Beer Back Sundays, which must not be on the site');
}

/* ------------------------------------------------------------ 4. redesign guard */
console.log('\n4. REDESIGN GUARD (the old templated patterns stay gone)\n');
{
  const html = await read('index.html');
  const js = (await Promise.all(['js/main.js', 'js/templates.js'].map(read))).join('\n');
  const all = `${html}\n${css}\n${js}`;
  const gone = (label, re, where = all) => { const hit = where.match(re); if (hit) fail(`${label}: found "${hit[0]}"`); else pass(label); };
  // An unclosed block swallows every rule after it (reduced motion and high contrast included) without any error.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  let depth = 0, lowest = 0;
  for (const ch of bare) { if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; lowest = Math.min(lowest, depth); } }
  if (depth !== 0 || lowest < 0) fail(`css/styles.css: the braces do not balance (${depth > 0 ? `${depth} block(s) left open` : 'a stray closing brace'})`); else pass('css/styles.css: every block is closed');
  gone('1. no .scene--arc dome', /scene--arc/);
  gone('2. no repeated .head > .h2 + .lede opener', /class="(?:head|h2|lede)["\s]/, html);
  const blurRules = [...css.matchAll(/([^{}]+)\{[^{}]*?(?<!-webkit-)backdrop-filter:\s*(?!\s|none)[^;}]+/g)].map((m) => m[1].trim().split('\n').pop().trim());
  if (blurRules.length === 1 && blurRules[0] === '.nav__bg') pass('3. frosted glass only on the nav (.nav__bg)'); else fail(`3. backdrop-filter is used on: ${blurRules.join(' | ') || 'nothing'} (expected only .nav__bg)`);
  gone('3. no .glass-card', /glass-card/);
  const pills = [...css.matchAll(/([^{}]+)\{[^{}]*border-radius:\s*999px/g)].map((m) => m[1].trim().split('\n').pop().trim());
  const pillsAllowed = ['.btn', '.btn::before', '.nav__cta', '.film__skip'];
  const strayPills = pills.filter((p) => !pillsAllowed.includes(p));
  if (!strayPills.length) pass(`4. 999px pills only on the buttons (${pills.join(', ')})`); else fail(`4. 999px pills on: ${strayPills.join(' | ')} (expected only ${pillsAllowed.join(', ')})`);
  gone('4. no --r-card token', /--r-card/);
  gone('5. no equal two-up .posters / .events__cards / .house__grid', /class="[^"]*\b(?:posters|events__cards|house__grid)\b|\.(?:posters|events__cards|house__grid)\b/);
  gone('6. no Bodoni Moda, Hanken Grotesk or Antonio', /Bodoni|Hanken|Antonio/i);
  gone('7. no .ticks bullet list or icon fact row', /class="ticks|\.ticks\b|hero__facts[^"]*"[^>]*>\s*<li|i-clock/);
  gone('8. no "Eat. Drink. Play. Celebrate." band', /Eat\. Drink\. Play|class="band|\.band\b/);
  gone('9. no ghost word or stand-in panel', /events__back|stand-in/);
  gone('10. no arch-photo hero split or form card', /frame--arch|hero__media|\.form\s*\{[^}]*border-radius/);
  const clipped = [...css.matchAll(/([^{}]+)\{([^{}]*?)(?<!-webkit-)background-clip:\s*text/g)];
  const offGold = clipped.filter((m) => !/background:\s*var\(--gilt\)/.test(m[2])).map((m) => m[1].trim().split('\n').pop().trim());
  if (offGold.length) fail(`gradient text that is not the logo's gold (var(--gilt)): ${offGold.join(' | ')}`); else pass(`gradient text only in the logo's gold (var(--gilt)), on ${clipped.length} rule(s)`);
  const filled = [...css.matchAll(/([^{}]+)\{([^{}]*?)-webkit-text-fill-color:\s*transparent/g)].filter((m) => !/var\(--gilt\)/.test(m[2])).map((m) => m[1].trim().split('\n').pop().trim());
  if (filled.length) fail(`see-through text that is not the logo's gold: ${filled.join(' | ')}`); else pass('see-through text only where the logo\'s gold shows through it');
  if (!/class="grain"/.test(html) || !/feTurbulence/.test(html)) fail('the shared feTurbulence grain overlay is missing from index.html'); else pass('one shared feTurbulence grain overlay');
}

/* ------------------------------------------------------------ 5. location and motion guard */
console.log('\n5. LOCATION AND MOTION GUARD\n');
{
  // The two words of the old address are spelled in character codes, so that a search of the
  // repository for them finds nothing at all, not even this check.
  const OLD_PLACE = [[75, 70, 67], [76, 101, 119, 105, 115]].map((codes) => String.fromCharCode(...codes));
  const everywhere = ['index.html', '404.html', 'README.md', 'site.webmanifest', 'package.json', 'robots.txt', 'sitemap.xml', 'css/styles.css', 'data/menu.json', 'data/specials.json', 'data/site.json', ...SCRIPTS, 'tools/build.mjs', 'tools/shots.mjs', 'tools/serve.mjs', 'tools/photos.mjs'].filter((f) => existsSync(join(ROOT, f)));
  const texts = Object.fromEntries(await Promise.all(everywhere.map(async (f) => [f, await read(f)])));
  const old = everywhere.filter((f) => OLD_PLACE.some((word) => texts[f].toLowerCase().includes(word.toLowerCase())));
  if (old.length) fail(`the old address is still mentioned in: ${old.join(', ')}`); else pass(`no mention of the old address in ${everywhere.length} files`);
  const oldHours = everywhere.filter((f) => /opens 10/i.test(texts[f]));
  if (oldHours.length) fail(`the old opening time is still in: ${oldHours.join(', ')}`); else pass('no "Opens 10:00 a.m." anywhere');
  const html = texts['index.html'];
  for (const phrase of ['Dunbars River, Westmoreland', 'formerly Guangos, beside Yaadman', 'Breakfast from 6:30 a.m.', 'Lunch from 11:00 a.m.', '[Owner to fill in: exact street address]', '[Owner to fill in: closing time and days open]', '[Owner to confirm current numbers]']) {
    if (!html.includes(phrase)) fail(`index.html no longer says "${phrase}"`);
  }
  pass('the new address, hours and their owner notes are on the page');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  if (ld.geo) fail('the structured data carries map coordinates, which have not been verified for the new place'); else pass('structured data: no unverified map coordinates');
  if (ld.openingHoursSpecification || ld.openingHours) fail('the structured data carries opening hours before the closing time is known'); else pass('structured data: no opening hours until the closing time is known');
  for (const id of ['wa-button', 'wa-bar']) { const tag = (html.match(new RegExp(`<a\\b[^>]*id="${id}"[^>]*>`)) || [''])[0]; if (!/\shidden(?=[\s>])/.test(tag)) fail(`#${id} is not hidden by default`); }
  pass('WhatsApp buttons are hidden until a number is set');
  if (!existsSync(join(ROOT, 'sitemap.xml')) || !/Sitemap:/.test(texts['robots.txt'] || '')) fail('sitemap.xml or the Sitemap line in robots.txt is missing: run "npm run build"'); else pass('sitemap.xml and the Sitemap line in robots.txt are written');

  // One motion system: three durations, two springs, one ease for opacity. Nothing else.
  const SMOOTH = 'linear(0, 0.065, 0.193, 0.337, 0.472, 0.593, 0.689, 0.765, 0.825, 0.87, 0.906, 0.931, 0.95, 0.964, 0.974, 0.981, 0.987, 0.991, 0.993, 0.995, 0.997, 0.998, 0.998, 0.999, 1)';
  const SNAPPY = 'linear(0, 0.099, 0.3, 0.525, 0.725, 0.885, 0.988, 1.046, 1.071, 1.072, 1.061, 1.045, 1.029, 1.015, 1.005, 0.999, 0.996, 0.995, 0.995, 0.996, 0.997, 0.998, 0.999, 1, 1)';
  const tokens = ['--dur-1: 200ms', '--dur-2: 350ms', '--dur-3: 600ms', '--ease-out: cubic-bezier(0.22, 1, 0.36, 1)', `--spring-smooth: ${SMOOTH}`, `--spring-snappy: ${SNAPPY}`, '@supports (transition-timing-function: linear(0, 1))'];
  const lost = tokens.filter((t) => !css.includes(t));
  if (lost.length) fail(`motion tokens missing or changed: ${lost.map((t) => t.slice(0, 28)).join(' | ')}`); else pass('motion tokens: --dur-1/2/3, --spring-smooth, --spring-snappy and --ease-out are as specified');
  const stray = [];
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');      // the stylesheet without its comments
  if ((plain.match(/cubic-bezier\(/g) || []).length !== 1) stray.push('a cubic-bezier outside the --ease-out token');
  if (/--ease-(?:move|sheet|land)/.test(`${css}${SCRIPTS.map((f) => texts[f] || '').join('')}`)) stray.push('an old easing token');
  if (/(?<![-\w])ease(?:-in|-out)?(?![-\w])/.test(plain)) stray.push('a bare ease keyword');
  for (const m of plain.matchAll(/[^{};]*?(?<![-\w])linear(?![-\w(])[^;}]*/g)) { if (!/marquee|animation-timeline|nav-progress|glass-drift|drink-level|stamp-depth/.test(m[0] + plain.slice(m.index, m.index + 260))) stray.push(`linear easing in "${m[0].trim().slice(0, 60)}"`); }
  // Durations: a transition names a token; an animation names a token unless it is one of the three that run on their own clock.
  const inReduced = (index) => { const open = plain.lastIndexOf('@media (prefers-reduced-motion: reduce)', index); return open >= 0 && plain.indexOf('\n}\n', open) > index; };
  for (const m of plain.matchAll(/(?<![-\w])transition(?:-duration)?:\s*([^;}]+)/g)) {
    if (/\d(?:ms|s)\b/.test(m[1]) && !inReduced(m.index)) stray.push(`a transition with a hand-written time: "${m[1].trim().slice(0, 60)}"`);
    for (const part of m[1].split(/,(?![^(]*\))/)) { const prop = part.trim().split(/\s+/)[0]; if (m[0].startsWith('transition:') && !/^(?:transform|opacity|clip-path|translate|scale|rotate|none|var\(--dur-[123]\))$/.test(prop)) stray.push(`a transition on "${prop}" (only transform, opacity and clip-path may move)`); }
  }
  for (const m of plain.matchAll(/(?<![-\w])animation:\s*([^;}]+)/g)) {
    for (const part of m[1].split(/,(?![^(]*\))/)) {
      if (/\b(?:marquee|breathe|grain-shift|none)\b/.test(part) || /animation-timeline/.test(plain.slice(m.index, m.index + 200))) continue;
      const first = (part.match(/var\(--dur-[123]\)|\d*\.?\d+m?s\b/) || [''])[0];
      if (!first.startsWith('var(')) stray.push(`an animation with a hand-written time: "${part.trim().slice(0, 60)}"`);
    }
  }
  const willChange = [...plain.matchAll(/([^{}]+)\{[^{}]*will-change:/g)].map((m) => m[1].trim().split('\n').pop().trim());
  const allowed = ['.nav__bar', '.is-behind', '.lightbox__ghost'];
  for (const sel of willChange) if (!allowed.includes(sel)) stray.push(`will-change on ${sel}`);
  const jsAll = SCRIPTS.map((f) => texts[f] || '').join('\n');
  if (/cubic-bezier\(|(?<![\w.])linear\(/.test(jsAll)) stray.push('a hand-written easing curve in a script');
  if (/gsap|framer-motion|from ['"]motion['"]/i.test(jsAll)) stray.push('an animation library');
  if (stray.length) for (const what of [...new Set(stray)]) fail(`motion: ${what}`); else pass('motion: every transition and animation uses the tokens; no stray easings, no animation library; will-change only on the nav and two short-lived helpers');
  const main = texts['js/main.js'] || '';
  if (/lerp: 0\.085, wheelMultiplier: 0\.9, smoothWheel: true, syncTouch: false/.test(main) && /duration: 1\.2, easing: \(t\) => 1 - Math\.pow\(1 - t, 4\)/.test(main)) pass('smooth scrolling: Lenis settings and the anchor-jump easing are as specified'); else fail('smooth scrolling: the Lenis settings or the anchor-jump easing have changed');
}

/* ------------------------------------------------------------ 6. Christmas touches */
console.log('\n6. CHRISTMAS TOUCHES (pepper lights over the opening video, a greeting in the red strip)\n');
{
  const cfg = JSON.parse(await read('data/site.json')).christmas;
  const value = seasonValue(cfg);
  const greeting = seasonGreeting(cfg);
  const page = await read('index.html');
  const sheet = await read('css/styles.css');
  const show = String((cfg && cfg.show) ?? '').trim().toLowerCase();
  if (!cfg) fail('data/site.json has no "christmas" setting (use "show": "off" to keep the touches off)');
  else if (!['auto', 'on', 'off'].includes(show)) fail(`data/site.json: christmas.show is "${cfg.show}"; it must be "auto", "on" or "off"`);
  else if (show === 'auto' && value === 'off') fail('data/site.json: christmas.from and christmas.to must be written month-day, like "11-15" and "01-06"');
  else {
    const when = value === 'off' ? 'switched off' : value === 'on' ? 'always on' : `shown by themselves from ${value.split(' ')[1]} to ${value.split(' ')[2]} (month-day) every year`;
    pass(`setting in data/site.json: ${when}; ${greeting ? `greeting "${greeting}"` : 'no greeting'}`);
  }
  const built = (page.match(/<html[^>]*data-xmas="([^"]*)"/) || [])[1];
  const inStrip = [...new Set([...page.matchAll(/<li class="marquee__season">([^<]*)</g)].map((m) => m[1]))];
  if (built !== value || inStrip.join('|') !== (greeting ? esc(greeting) : '')) fail(`index.html was built with a different Christmas setting ("${built}"${inStrip.length ? `, greeting "${inStrip.join(' / ')}"` : ''}) from data/site.json: run "npm run build"`);
  else pass('index.html was built with the same setting and greeting');
  if (!/window\.__mmXmas = function/.test(page) || !/classList\.add\('is-xmas'\)/.test(page)) fail('the head of index.html no longer decides about Christmas before the page is drawn'); else pass('the page decides before it is first drawn, so nothing pops in or moves');
  if (!/\n\.pepper \{ display: none; \}/.test(sheet) || !/\nhtml:not\(\.is-xmas\) \.marquee__season \{ display: none; \}/.test(sheet)) fail('the stylesheet no longer keeps the Christmas touches out of the page out of season'); else pass('out of season the lights and the greeting are not drawn at all');
  const part = (sheet.match(/\/\* -{10} Christmas [\s\S]*?\/\* -{10} \/Christmas -{10} \*\//) || [''])[0];
  const urls = [...part.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]);
  if (!part) fail('the Christmas section of the stylesheet is missing');
  else if (urls.some((u) => !/^data:image\/svg\+xml,/.test(u)) || /%3Cimage|href=/i.test(part)) fail('the Christmas section of the stylesheet uses a picture file; it must be drawn in code');
  else pass(`drawn in code: ${urls.length} small SVG drawings in the stylesheet; no picture files`);
  if (!/class="pepper" aria-hidden="true"/.test(page)) fail('the pepper lights are missing from index.html'); else pass('the lights are hidden from screen readers; the greeting is ordinary text in the strip');
}

/* ------------------------------------------------------------ live check in a browser (optional) */
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* fine: static checks only */ }
if (chromium) {
  const port = 4800 + Math.floor(Math.random() * 100);
  const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch();
  console.log('\n  In the browser (page fully rendered):');
  for (const [label, viewport, mobile] of [['desktop 1440', { width: 1440, height: 900 }, false], ['phone 390', { width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.route(/google\.[a-z.]+\/maps/, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
    await page.goto(`http://localhost:${port}/?intro=0&xmas=1`);          // with the Christmas touches on: the fullest the page gets
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
        backgrounds: [...bg].filter((u) => !/^data:image\/svg\+xml,/.test(u) || /<image|%3Cimage/i.test(u)).map((u) => u.replace(location.origin + '/', '')),
        drawings: [...bg].filter((u) => /^data:image\/svg\+xml,/.test(u) && !/<image|%3Cimage/i.test(u)).length,
        festive: Array.from(document.querySelectorAll('.pepper, .marquee__set:not([aria-hidden]) .marquee__season')).filter((el) => getComputedStyle(el).display !== 'none').length,
        imgs: Array.from(document.images).map((i) => i.getAttribute('src')),
        shown: Array.from(document.images).filter((i) => i.offsetParent !== null).length,
        emptyFrames: Array.from(document.querySelectorAll('.print, .bleed, .chip, .reel')).filter((f) => f.offsetParent !== null && !f.querySelector('img')).length,
        svgImages: document.querySelectorAll('svg image').length,
        videos: Array.from(document.querySelectorAll('video')).filter((v) => !v.classList.contains('clip__video')).length,
        clips: Array.from(document.querySelectorAll('.clip')).filter((c) => c.offsetParent !== null).map((c) => { const v = c.querySelector('video'); return `${c.dataset.clip}${v.currentSrc ? ` (${v.currentSrc.split('/').pop()})` : ''}`; }),
        clipFiles: Array.from(document.querySelectorAll('video')).map((v) => v.currentSrc).filter(Boolean).map((u) => u.replace(location.origin + '/', '')),
        todos: Array.from(document.querySelectorAll('.todo')).filter((t) => t.offsetParent !== null).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    // Out of season nothing of Christmas may be left on the page.
    await page.goto(`http://localhost:${port}/?intro=0&xmas=0`);
    const leftOver = await page.evaluate(() => Array.from(document.querySelectorAll('.pepper, .marquee__season')).filter((el) => getComputedStyle(el).display !== 'none').length);
    await context.close();
    console.log(`    ${label}: ${live.imgs.length} <img> (${live.shown} showing), background picture files: ${live.backgrounds.length ? live.backgrounds.join(', ') : 'none'}, SVG drawings from the stylesheet: ${live.drawings}, SVG <image>: ${live.svgImages}, <video>: ${live.videos}, visible placeholders: ${live.todos}`);
    const expected = seasonGreeting(JSON.parse(await read('data/site.json')).christmas) ? 2 : 1;
    if (seasonValue(JSON.parse(await read('data/site.json')).christmas) !== 'off' && live.festive !== expected) fail(`${label}: with Christmas on, ${live.festive} of its ${expected} touches are showing`);
    if (leftOver) fail(`${label}: with Christmas off, ${leftOver} Christmas element(s) are still drawn`);
    live.backgrounds.forEach((u) => { if (!sourceOf(u) && !isTexture(u)) fail(`${label}: background picture in use that is not one of the nine photos or a generated texture: ${u}`); });
    live.imgs.forEach((u) => { if (!sourceOf(u || '')) fail(`${label}: <img src="${u}"> is not from the nine allowed files`); });
    if (live.emptyFrames) fail(`${label}: ${live.emptyFrames} photo frame(s) are drawn with no photo inside`);
    if (live.svgImages || live.videos) fail(`${label}: an embedded picture or video that is not one of the nine photos or the owner's clips`);
    live.clipFiles.forEach((u) => { if (!String(sourceOf(u)).startsWith('clip:')) fail(`${label}: a video playing from ${u}, which is not one of the owner's clips`); });
    console.log(`    ${label}: clips on the page: ${live.clips.join(', ') || 'none'}`);
    if (live.overflow > 0) fail(`${label}: the page is ${live.overflow}px wider than the screen`);
  }
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} problem(s) found. The check FAILED.\n` : '\nAll checks passed.\n');
process.exitCode = failures ? 1 : 0;
