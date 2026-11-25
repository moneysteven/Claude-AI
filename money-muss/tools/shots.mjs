// Screenshots at phone, tablet and desktop widths:  npm run shots
//
//   node tools/shots.mjs [--out shots] [--dsf 2] [--widths 390,768,1440] [--format jpg|png] [--root <folder>]
//
// For each width it saves the full page, plus the hero (first screen), the menu,
// the weekly nights and the footer, and the 404 page.
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

for (const width of WIDTHS) {
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
