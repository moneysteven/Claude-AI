// Screenshots at phone, tablet and desktop widths:  npm run shots
//
//   node tools/shots.mjs [--out shots] [--dsf 2] [--widths 390,768,1440] [--format jpg|png] [--root <folder>]
//                        [--motion] [--motion-only] [--every 300]
//
// For each width it saves the full page, plus the hero (first screen), the menu,
// the weekly nights and the footer, and the 404 page.
//
// --motion adds short captures of the page in motion at 390 and 1440: the hero while scrolling, the menu
// tabs changing, the weekly nights arriving (and the scratch panel coming off), and the photo viewer
// opening and closing. Each is saved as a contact sheet (one frame every 300ms, or --every N) and as an
// animated WebP. The photo viewer is only captured when the site has photos to open.
// Playwright is expected to be installed already (it is not a dependency of the site).
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const ROOT = resolve(opt('root', fileURLToPath(new URL('..', import.meta.url))));
const OUT = resolve(opt('out', join(ROOT, 'shots')));
const DSF = Number(opt('dsf', '2'));
const WIDTHS = opt('widths', '390,768,1440').split(',').map(Number);
// The page carries a fine grain, which makes PNG files enormous; JPEG is the default.
const EXT = opt('format', 'jpg') === 'png' ? 'png' : 'jpg';
const SHOT = EXT === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 90 };
const MOTION = args.includes('--motion') || args.includes('--motion-only');
const STILLS = !args.includes('--motion-only');
const EVERY = Number(opt('every', '300'));
const PORT = 4300 + Math.floor(Math.random() * 500);
const PARTS = [['menu', '#menu'], ['weekly-nights', '#specials'], ['footer', 'footer']];

const VIEW = {
  390: { width: 390, height: 844, isMobile: true, hasTouch: true },
  768: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  1440: { width: 1440, height: 900, isMobile: false, hasTouch: false },
};

const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 500));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const base = `http://localhost:${PORT}`;
const problems = [];

// A very tall page at 2x is more than a browser can paint in one picture (parts of it come out
// blank), so tall pages are captured in slices and joined with sharp.
async function fullPage(page, file) {
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight }));
  if (size.height * DSF <= 12000) { await page.screenshot({ path: file, fullPage: true, ...SHOT }); return; }
  const SLICE = 3000;
  const parts = [];
  for (let y = 0; y < size.height; y += SLICE) {
    const height = Math.min(SLICE, size.height - y);
    const input = await page.screenshot({ fullPage: true, clip: { x: 0, y, width: size.width, height }, type: 'png' });
    parts.push({ input, left: 0, top: Math.round(y * DSF) });
  }
  const { default: sharp } = await import('sharp');
  const sheet = sharp({ create: { width: Math.round(size.width * DSF), height: Math.round(size.height * DSF), channels: 3, background: '#2B2F3A' } }).composite(parts);
  await (EXT === 'png' ? sheet.png() : sheet.jpeg({ quality: 90 })).toFile(file);
}

// Walk the page top to bottom so lazy photos load and entrance effects have played.
async function walk(page) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.round(page.viewportSize().height * 0.6);
  for (let y = 0; y <= total; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(1900);      // the last reel to land
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(700);
}

/* ------------------------------------------------------------------ the page in motion */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Photographs the screen every EVERY ms while a short script of actions plays out.
// script: [{ at: ms, run: async () => {}, background: true|false }]
async function film(page, name, width, frames, script) {
  const queue = [...script].sort((a, b) => a.at - b.at);
  const running = [];
  const shots = [];
  const t0 = Date.now();
  for (let k = 0; k < frames; k += 1) {
    const due = t0 + k * EVERY;
    while (queue.length && t0 + queue[0].at <= due) {
      const step = queue.shift();
      const early = t0 + step.at - Date.now();
      if (early > 0) await sleep(early);
      const going = Promise.resolve().then(step.run).catch((e) => problems.push(`[${width}] motion ${name}: ${e.message.split('\n')[0]}`));
      if (step.background) running.push(going); else await going;
    }
    const early = due - Date.now();
    if (early > 0) await sleep(early);
    shots.push(await page.screenshot({ type: 'png' }));
  }
  await Promise.race([Promise.all(running), sleep(6000)]);      // let a scroll that is still going finish before the page is closed
  const { default: sharp } = await import('sharp');
  const meta = await sharp(shots[0]).metadata();
  // 1. A contact sheet: the frames in rows, each stamped with its time.
  const cellW = width < 700 ? 300 : 640;
  const cellH = Math.round((meta.height / meta.width) * cellW);
  const cols = Math.min(frames, width < 700 ? 6 : 3);
  const rows = Math.ceil(frames / cols);
  const gap = 10;
  const label = 30;
  const parts = [];
  for (let k = 0; k < shots.length; k += 1) {
    const x = gap + (k % cols) * (cellW + gap);
    const y = gap + Math.floor(k / cols) * (cellH + label + gap);
    parts.push({ input: await sharp(shots[k]).resize({ width: cellW }).png().toBuffer(), left: x, top: y + label });
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${label}"><text x="2" y="21" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="#EFE6C8">${((k * EVERY) / 1000).toFixed(EVERY % 100 ? 2 : 1)}s</text></svg>`;
    parts.push({ input: Buffer.from(text), left: x, top: y });
  }
  await sharp({ create: { width: gap + cols * (cellW + gap), height: gap + rows * (cellH + label + gap), channels: 3, background: '#15171C' } })
    .composite(parts).jpeg({ quality: 86 }).toFile(join(OUT, `motion-${width}-${name}.jpg`));
  // 2. The same frames as a looping animation.
  try {
    const small = await Promise.all(shots.map((b) => sharp(b).resize({ width: width < 700 ? 390 : 960 }).png().toBuffer()));
    await sharp(small, { join: { animated: true } }).webp({ quality: 72, delay: small.map((_, i) => (i === small.length - 1 ? 1200 : EVERY)), loop: 0 }).toFile(join(OUT, `motion-${width}-${name}.webp`));
  } catch (e) {
    problems.push(`[${width}] motion ${name}: the animated copy could not be written (${e.message.split('\n')[0]}); the contact sheet is there`);
  }
}

async function filmAll(width) {
  const v = VIEW[width] || { width, height: 900, isMobile: width < 900, hasTouch: width < 900 };
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: v.isMobile, hasTouch: v.hasTouch });
  await context.route(/google\.[a-z.]+\/maps/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  const touch = v.hasTouch;
  const fresh = async () => {
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`[${width}] motion page error: ${e.message}`));
    await page.goto(`${base}/?intro=0`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const cdp = await context.newCDPSession(page);
    const jump = async (y) => { await page.evaluate((top) => window.scrollTo({ top: Math.max(0, top), behavior: 'instant' }), y); await page.waitForTimeout(500); };
    const topOf = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().top + window.scrollY : -1; }, sel);
    const finger = async (points, pause = 16) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0][0], y: points[0][1], id: 1 }] });
      for (const [x, y] of points.slice(1)) { await sleep(pause); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); }
    };
    const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // A real scroll at a steady speed: the wheel on desktop, a thumb on a phone (in strokes, resting before it lifts so nothing flings).
    const scrollBy = async (distance, speed) => {
      if (!touch) return cdp.send('Input.synthesizeScrollGesture', { x: Math.round(v.width / 2), y: Math.round(v.height * 0.6), yDistance: -distance, speed, gestureSourceType: 'mouse' });
      const x = Math.round(v.width * 0.82);
      let left = distance;
      while (left > 0) {
        const d = Math.min(left, Math.round(v.height * 0.5));
        const steps = Math.max(2, Math.round(((d / speed) * 1000) / 16));
        const y0 = Math.round(v.height * 0.78);
        const points = [[x, y0]];
        for (let i = 1; i <= steps; i += 1) points.push([x, y0 - (d * i) / steps]);
        await finger(points, 16);
        await sleep(70);
        await lift();
        left -= d;
      }
      return null;
    };
    return { page, cdp, jump, topOf, scrollBy, finger, lift };
  };

  // 1. The hero while the page scrolls: the glass slides and tilts, the stamp turns, the nav compacts.
  {
    const { page, scrollBy } = await fresh();
    await film(page, 'hero', width, 10, [{ at: 150, background: true, run: () => scrollBy(Math.round(v.height * 0.8), Math.round(v.height * 0.36)) }]);
    await page.close();
  }
  // 2. The menu tabs: the marker glides, the menus cross-fade.
  {
    const { page, jump, topOf } = await fresh();
    await jump((await topOf('.tabs')) - Math.round(v.height * 0.22));
    await page.waitForTimeout(1300);
    const tab = (key) => () => (touch ? page.tap(`.tabs__tab[data-tab="${key}"]`) : page.click(`.tabs__tab[data-tab="${key}"]`));
    await film(page, 'menu-tabs', width, 9, [{ at: 150, run: tab('lunch') }, { at: 1050, run: tab('drinks') }, { at: 1950, run: tab('breakfast') }]);
    await page.close();
  }
  // 3. The weekly nights arriving: the headline rises, the tickets fade up in turn, the serials roll.
  {
    const { page, jump, topOf, scrollBy } = await fresh();
    await jump((await topOf('#specials')) - Math.round(v.height * 0.82));
    await film(page, 'weekly-nights', width, 12, [{ at: 150, background: true, run: () => scrollBy(Math.round(v.height * 1.05), Math.round(v.height * 0.5)) }]);
    await page.close();
  }
  // 3b. The scratch panel on Flasking Fridays: the foil wipes off in place and the prices roll.
  {
    const { page, jump, topOf } = await fresh();
    if (await page.locator('.scratch').count()) {
      await jump((await topOf('.scratch')) - Math.round(v.height * 0.2));
      await page.waitForTimeout(1500);
      const reveal = async () => {
        if (touch) { await page.tap('.scratch__cover'); return; }
        // A mouse rubs the foil off.
        const box = await page.locator('.scratch__canvas').boundingBox();
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        for (let i = 0; i <= 26; i += 1) await page.mouse.move(box.x + (i % 2 ? box.width - 20 : 20), box.y + 20 + ((box.height - 40) * i) / 26, { steps: 3 });
        await page.mouse.up();
      };
      await film(page, 'scratch', width, 9, [{ at: 150, background: true, run: reveal }]);
    }
    await page.close();
  }
  // 4. The photo viewer: a photo zooms out of its thumbnail, the next one slides in, and it goes home again.
  {
    const { page, jump, topOf, finger, lift } = await fresh();
    const tile = page.locator('#gallery [data-open]:has(picture)').first();
    if ((await tile.count()) && (await tile.isVisible())) {
      await jump((await topOf('#gallery [data-open]:has(picture)')) - Math.round(v.height * 0.3));
      await page.waitForTimeout(1500);
      const cx = Math.round(v.width / 2);
      const cy = Math.round(v.height / 2);
      const open = () => (touch ? tile.tap() : tile.click());
      const next = () => (touch ? finger([[cx + 120, cy], [cx + 60, cy], [cx - 40, cy], [cx - 140, cy]], 20).then(lift) : page.click('#lightbox-next'));
      const away = () => (touch ? finger([[cx, cy - 60], [cx, cy - 20], [cx, cy + 40], [cx, cy + 100], [cx, cy + 160], [cx, cy + 220]], 60).then(() => sleep(120)).then(lift) : page.keyboard.press('Escape'));
      await film(page, 'photo-viewer', width, 13, [{ at: 150, run: open }, { at: 1350, background: true, run: next }, { at: 2400, background: true, run: away }]);
    } else {
      console.log(`  ${width}px: no photos to open yet, so the photo viewer was not filmed`);
    }
    await page.close();
  }
  await context.close();
  console.log(`  ${width}px motion done`);
}

for (const width of STILLS ? WIDTHS : []) {
  const v = VIEW[width] || { width, height: 900, isMobile: width < 900, hasTouch: width < 900 };
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: DSF,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
  });
  // The sandbox these run in cannot reach Google, so the map frame is answered with an empty page.
  await context.route(/google\.[a-z.]+\/maps/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) problems.push(`[${width}] console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${width}] page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${width}] failed: ${r.url()} ${r.failure()?.errorText || ''}`));
  // The 404 page is fetched on purpose, so its own "not found" status is not a problem.
  const expected = (url) => url.includes('/no-such-page');
  page.on('response', (r) => { if (r.status() >= 400 && !expected(r.url())) problems.push(`[${width}] ${r.status()}: ${r.url()}`); });

  for (const [name, path] of [['home', '/?intro=0'], ['404', '/no-such-page']]) {
    await page.goto(base + path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await walk(page);
    // With Google out of reach the map frame is empty, so show the panel a visitor sees while the map loads.
    await page.evaluate(() => { const m = document.getElementById('map'); if (m) m.classList.remove('is-live'); });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`[${width}] ${name}: page is ${overflow}px wider than the screen`);
    if (name === 'home') await page.screenshot({ path: join(OUT, `${width}-hero.${EXT}`), ...SHOT });      // first screen, exactly as a visitor sees it
    // Tall pictures have no scroll position, so scroll-linked motion is rested and the pieces that
    // normally stay fixed to the screen (nav, grain, phone bar) are laid into the page instead.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.addStyleTag({ content: `
      *, *::before, *::after { animation-timeline: auto !important; }
      .hero__glass, .glass__drink { animation: none !important; }
      .nav { position: absolute !important; }
      .skip-link { display: none !important; }
      .grain { position: absolute !important; height: ${total}px !important; }
      .callbar { position: absolute !important; top: auto !important; bottom: auto !important; margin-top: -62px; }
      body { position: relative; }` });
    await page.evaluate(() => { const bar = document.getElementById('callbar'); if (bar && getComputedStyle(bar).display !== 'none') { bar.style.top = `${document.documentElement.scrollHeight}px`; } });
    await page.waitForTimeout(300);
    await fullPage(page, join(OUT, `${width}-${name}-full.${EXT}`));
    if (name === 'home') {
      for (const [part, selector] of PARTS) {
        const el = page.locator(selector).first();
        if (await el.count()) await el.screenshot({ path: join(OUT, `${width}-${part}.${EXT}`), ...SHOT });
      }
    }
  }
  await context.close();
  console.log(`  ${width}px done`);
}

if (MOTION) for (const width of WIDTHS.filter((w) => w !== 768)) await filmAll(width);

await browser.close();
stop();
if (problems.length) {
  console.log('\nProblems found:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors, failed requests or sideways overflow.');
}
console.log(`Screenshots: ${OUT}`);
