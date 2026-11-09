// Phone section: 390x844 at 2x, with a touch dot. Its clock starts at the crossfade from the desktop tour.
// usage: node record_phone.js [out_dir]     site served at SITE_URL (default http://127.0.0.1:8090/)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { CURSOR } = require('./cursor_overlay.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'frames_phone'));
const W = 390, H = 844, BASE = process.env.SITE_URL || 'http://127.0.0.1:8090/';
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json')));
const P = plan.lines.find(l => l.id === 'phone');
const T0 = plan.phone_start - 0.6;                                  // video time of this recording's first frame
const w = (word, lead = 0.25) => { const i = P.say.indexOf(word); if (i < 0) throw new Error(word); return P.at + P.dur * (i / P.say.length) - lead - T0; };
const STOP = plan.end_card_at - T0 + 0.2;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.route(/google\.com/, r => r.abort());
  // the desktop part already showed the intro: mark it seen. 'opener-seen' is the master prompt's key; older sites used their own.
  await ctx.addInitScript(keys => { try { keys.forEach(k => sessionStorage.setItem(k, '1')); } catch (e) {} }, (process.env.INTRO_KEY || 'opener-seen,eleven-intro').split(','));
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');   // a touch dot instead of an arrow
    s.textContent = '#__cur svg{display:none}#__cur::before{display:none}#__cur{width:40px;height:40px;margin:-17px 0 0 -16px;border-radius:50%;background:rgba(255,255,255,.32);border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 6px color-mix(in srgb,var(--brand,#A3CF3E) 25%,transparent)}';
    document.head.appendChild(s);
  }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const index = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'));
    index.push([file, f.metadata.timestamp]);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  // load and settle before the clock starts, so the phone opens on a finished hero
  await page.goto(BASE + 'index.html', { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1800);
  let t0 = 0; const log = [];
  const now = () => Date.now() / 1000 - t0;
  const until = async (t, label = '') => { const d = (t - now()) * 1000; if (d > 0) await page.waitForTimeout(d); log.push([+t.toFixed(2), +now().toFixed(2), label]); };
  const glide = async (x, y, ms = 600) => { await page.evaluate(({ x, y, ms }) => window.__glide(x, y, ms), { x, y, ms }); await page.mouse.move(x, y); };
  const glideTo = async (sel, ms = 600, dx = 0.5, dy = 0.5) => { const b = await page.locator(sel).first().boundingBox(); await glide(b.x + b.width * dx, b.y + b.height * dy, ms); };
  const click = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
  const scrollBy = (dy, ms) => page.evaluate(({ dy, ms }) => new Promise(res => { const s = scrollY, t = performance.now();
    const st = n => { const p = Math.min(1, (n - t) / ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; scrollTo(0, s + dy * e); p < 1 ? requestAnimationFrame(st) : res(); }; requestAnimationFrame(st); }), { dy, ms });

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  t0 = Date.now() / 1000;
  await until(w('menu') - 1.0, 'to burger'); await glideTo('.burger', 700);
  await until(w('menu'), 'drawer'); await click();                    // "the menu slides in from the side"
  // the close button is measured only once the drawer has finished sliding in (>= 1 s after the click)
  await until(w('call button') - 1.5, 'close drawer'); await glideTo('#drawer button[aria-label="Close menu"]', 450); await click();
  await page.waitForFunction(() => !document.querySelector('#drawer').classList.contains('is-open'), null, { timeout: 1500 })
    .catch(() => { throw new Error('drawer did not close'); });
  await page.waitForTimeout(200);
  await Promise.all([glide(W * 0.5, H * 0.62, 500), scrollBy(1250, 1200)]);   // the call button appears once you're past the hero
  await until(w('follows'), 'fab'); await glideTo('.fab', 600);
  await scrollBy(700, 1400);                                         // ...and stays with you
  await until(STOP);
  await cdp.send('Page.stopScreencast'); await page.waitForTimeout(200);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ t0, frames: index, log, T0 }));
  console.log(`${index.length} frames, ${now().toFixed(1)} s; late: ${JSON.stringify(log.filter(([a, b]) => b - a > 0.3))}`);
  await browser.close();
})();
