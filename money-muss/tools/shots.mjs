// Screenshots of every page at phone, tablet and desktop widths:  npm run shots
//
//   node tools/shots.mjs [--out shots] [--dsf 2] [--widths 390,768,1440] [--sections] [--root <folder>]
//
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
const SECTIONS = args.includes('--sections');
const PORT = 4300 + Math.floor(Math.random() * 500);

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

// Walk the page top to bottom so lazy photos load and entrance reveals have played.
async function walk(page) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.round(page.viewportSize().height * 0.7);
  for (let y = 0; y <= total; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(110);
  }
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
    if (name === 'home') {
      // First screen exactly as a visitor sees it.
      await page.screenshot({ path: join(OUT, `${width}-first-screen.png`) });
      if (SECTIONS) {
        const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main > section, footer')).map((s) => s.id || 'footer'));
        for (const id of ids) {
          await page.evaluate((key) => {
            const el = key === 'footer' ? document.querySelector('footer') : document.getElementById(key);
            window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 40, behavior: 'instant' });
          }, id);
          await page.waitForTimeout(450);
          await page.screenshot({ path: join(OUT, `${width}-${id}.png`) });
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(300);
      }
    }
    // Full page. Scroll-linked motion is rested for this one, because a single tall
    // picture has no scroll position to read from.
    await page.addStyleTag({ content: '*, *::before, *::after { animation-timeline: auto !important; animation-name: none !important; }' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${width}-${name}-full.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`[${width}] ${name}: page is ${overflow}px wider than the screen`);
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
