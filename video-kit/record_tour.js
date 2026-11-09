// Desktop tour (1920x1080), timed to plan.json: every action lands on the word that names it.
// usage: node record_tour.js [out_dir]     site served at SITE_URL (default http://127.0.0.1:8090/)
// The helpers are reusable as they are. The step list below is the Eleven tour: rewrite it for each site.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { CURSOR } = require('./cursor_overlay.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'frames_tour'));
const W = 1920, H = 1080, BASE = process.env.SITE_URL || 'http://127.0.0.1:8090/';
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json')));
const L = Object.fromEntries(plan.lines.map(l => [l.id, l]));
// when (seconds) a word in a line is spoken: by its position in the text, a touch early so the action leads the word
const w = (id, word, lead = 0.25) => { const l = L[id], i = l.say.indexOf(word); if (i < 0) throw new Error(`"${word}" not in ${id}`); return l.at + l.dur * (i / l.say.length) - lead; };
const end = id => L[id].at + L[id].dur;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.route(/google\.com/, r => r.abort());
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const index = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'));
    index.push([file, f.metadata.timestamp]);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  let t0 = 0; const log = [];
  const now = () => Date.now() / 1000 - t0;
  const until = async (t, label = '') => { const d = (t - now()) * 1000; if (d > 0) await page.waitForTimeout(d); log.push([+t.toFixed(2), +now().toFixed(2), label]); };
  const glide = async (x, y, ms = 700) => { await page.evaluate(({ x, y, ms }) => window.__glide(x, y, ms), { x, y, ms }); await page.mouse.move(x, y); };
  const box = async sel => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('no box: ' + sel); return b; };
  const glideTo = async (sel, ms = 700, dx = 0.5, dy = 0.5) => { const b = await box(sel); await glide(b.x + b.width * dx, b.y + b.height * dy, ms); };
  const click = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
  const scrollTo = (y, ms) => page.evaluate(({ y, ms }) => new Promise(res => {
    const s = scrollY, d = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)) - s, t = performance.now();
    const step = nw => { const p = Math.min(1, (nw - t) / ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; scrollTo(0, s + d * e); p < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), { y, ms });
  const topOf = (sel, off = 0) => page.evaluate(({ sel, off }) => document.querySelector(sel).getBoundingClientRect().top + scrollY - off, { sel, off });
  const centreOn = async (sel, ms, frac = 0.5) => { const y = await page.evaluate(({ sel, frac }) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top + scrollY - (innerHeight * frac - r.height / 2); }, { sel, frac }); await scrollTo(y, ms); };
  const goTo = async (href, label) => { await glideTo(`.nav__links a[href="${href}"]`, 700); await Promise.all([page.waitForURL('**/' + href, { waitUntil: 'domcontentloaded' }), click()]); log.push([0, +now().toFixed(2), label]); };

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  t0 = Date.now() / 1000;
  // intro: the opening plays untouched
  await page.goto(BASE + 'index.html', { waitUntil: 'commit' });
  // hero: footage, then the pause button
  await until(w('hero', 'pause') - 1.4, 'hero'); await glideTo('.hero .motion-toggle', 1400);
  // order popup: each option as it's named
  await until(L.order.at - 1.1, 'to order'); await glideTo('.hero .btn--solid', 900);
  await until(L.order.at + 0.2); await click();
  await until(w('order', 'Guests'), 'menu'); await glideTo('#order .opt', 700, 0.3);
  await until(w('order', 'call')); await glideTo('#order a.opt[href^="tel:"]', 400, 0.3);
  await until(w('order', 'Instagram') - 0.2); await glideTo('#order a.opt[href*="ig.me"]', 500, 0.3);
  await until(w('order', 'email') - 0.2); await glideTo('#order a.opt[href^="mailto:"]', 500, 0.3);
  await until(w('order', 'directions') - 0.2); await glideTo('#order a.opt[href*="maps/dir"]', 500, 0.3);
  await until(end('order') + 0.3); await page.keyboard.press('Escape');
  // menu bar: a slow scroll into the welcome section while the bar turns solid
  await until(L.navbar.at + 0.1, 'navbar');
  const navScroll = scrollTo(await topOf('#welcome', 40), (L.navbar.dur - 0.4) * 1000);
  await until(w('navbar', 'shows')); await glideTo('.nav__links a[aria-current], .nav__links a.is-active', 900, 0.5, 1.1);
  await navScroll;
  // welcome: photos, then the traced ELEVEN behind them
  await until(L.welcome.at + 0.1, 'welcome'); await glideTo('#welcome .intro__photo', 800);
  await until(w('welcome', 'traced')); await glideTo('#welcome .ghost-word', 900, 0.3, 0.5);
  // ribbon: it keeps moving, then pauses under the cursor, then moves again
  await until(L.ribbon.at - 2.4, 'to ribbon'); await centreOn('.marquee', 2200, 0.55);
  await until(w('ribbon', 'pauses') - 0.6, 'ribbon'); await glideTo('.marquee', 700, 0.42);
  await until(end('ribbon') + 0.15); await glide(W * 0.42, H * 0.25, 500);
  // dishes: hover zoom + description
  await until(L.dishes.at - 2.5, 'to dishes'); await scrollTo(await topOf('#favorites', 40), 2300);
  await until(L.dishes.at + 0.1, 'dishes'); await glideTo('#favorites .card:nth-of-type(1)', 700, 0.5, 0.45);
  await until(w('dishes', 'zooms')); await glideTo('#favorites .card:nth-of-type(2)', 600, 0.5, 0.45);
  await until(w('dishes', 'description')); await glideTo('#favorites .card:nth-of-type(3)', 600, 0.5, 0.45);
  // lobster type card on the second row
  await until(L.lobster.at - 1.5, 'to lobster'); await centreOn('#favorites .card--type', 1300, 0.5);
  await until(L.lobster.at + 0.1, 'lobster'); await glideTo('#favorites .card--type', 700, 0.5, 0.4);
  // photo band with parallax: keep scrolling gently while it's talked about
  await until(L.band.at - 2.5, 'to band'); await centreOn('.promo', 2400, 0.5);
  await until(L.band.at + 0.1, 'band');
  await Promise.all([glide(W * 0.62, H * 0.62, 900), scrollTo(await page.evaluate(() => scrollY + 260), (L.band.dur - 0.6) * 1000)]);
  // search
  await until(L.search.at - 2.5, 'to search'); await scrollTo(await topOf('#menu', 30), 2300);
  await until(L.search.at + 0.1, 'search'); await glideTo('#menu input[type="search"]', 800, 0.35);
  await until(w('search', 'searchable') + 0.4); await click();
  await until(w('search', 'shrimp') - 0.15); await page.keyboard.type('shrimp', { delay: 90 });
  await until(w('search', 'count')); await glideTo('#menu [data-count]', 700, 0.3);
  // category chip
  await until(L.chips.at - 0.55, 'chips'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await glideTo('#menu .chip[data-cat="Drinks"]', 600);
  await until(w('chips', 'drinks')); await click();
  // empty state, then the one-tap reset
  await until(L.empty.at - 0.9, 'empty'); await glideTo('#menu input[type="search"]', 600, 0.35); await click();
  await until(w('empty', 'something')); await page.keyboard.type('pizza', { delay: 100 });
  await until(w('empty', 'full menu') - 0.4); await glideTo('#menu .menu-empty [data-reset]', 700);
  await until(w('empty', 'one tap') + 0.2); await click();
  // dotted leaders and tags
  await until(L.leaders.at - 1.5, 'to leaders'); await scrollTo(await topOf('#menu .menu-list', 120), 1400);
  await until(L.leaders.at + 0.1, 'leaders'); await glideTo('#menu .item__end', 500, 0.05);
  await glideTo('#menu .item__end', 1300, 0.95);
  await until(w('leaders', 'tagged') - 0.3); await glideTo('#menu .tag', 700);
  // pick your vibe
  await until(L.vibe.at - 2.5, 'to vibe'); await scrollTo(await topOf('#vibe', 40), 2300);
  const tab = async i => { const b = await page.locator('#vibe [role="tab"]').nth(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x, y] = await tab(0); await until(L.vibe.at + 0.2, 'vibe'); await glide(x, y, 800);
  await until(w('vibe', 'the food')); await click();
  [x, y] = await tab(1); await glide(x, y, 450); await until(w('vibe', 'the lounge')); await click();
  [x, y] = await tab(2); await glide(x, y, 450); await until(w('vibe', 'the crew')); await click();
  await until(w('vibe', 'photo') - 0.5); await glideTo('#vibe img', 900, 0.5, 0.45);
  // what's on
  await until(L.whatson.at - 2.5, 'to whatson'); await scrollTo(await topOf('#whats-on', 40), 2300);
  await until(w('whatson', 'Cabaret'), 'whatson'); await glideTo('#whats-on .event:nth-of-type(1)', 700, 0.6, 0.4);
  await until(w('whatson', 'coming')); await glideTo('#whats-on .event:nth-of-type(2)', 700, 0.6, 0.4);
  // gallery: hover captions, then a video tile previewing
  await until(L.gallery.at - 2.5, 'to gallery'); await scrollTo(await topOf('#gallery', 20), 2300);
  await until(L.gallery.at + 0.1, 'gallery'); await glideTo('#gallery a.tile:not([data-type])', 800, 0.5, 0.55);
  await until(w('gallery', 'video')); await glideTo('#gallery a.tile[data-type="video"]', 800, 0.5, 0.55);
  // viewer: the fire & aerial show, counter, arrows
  await until(L.viewer.at - 1.3, 'to viewer'); await centreOn('#show-video', 1200, 0.5);
  await until(L.viewer.at + 0.1, 'viewer'); await glideTo('#show-video', 600);
  await until(L.viewer.at + 0.8); await click();
  await until(w('viewer', 'counter')); await glideTo('.lb__count', 700);
  await until(w('viewer', 'arrows')); await glideTo('.lb__next', 700);
  await until(w('viewer', 'step')); await click();
  await until(w('viewer', 'photos') + 0.3); await click();
  await until(end('viewer') + 0.05); await page.keyboard.press('Escape');
  // visit: hours, directions, live badge, today's row
  await until(L.visit.at - 2.9, 'to visit'); await scrollTo(await topOf('#visit', 30), 2600);
  await until(L.visit.at - 0.3, 'visit'); await glideTo('#visit .hours', 450, 0.3, 0.2);
  await until(w('visit', 'directions')); await glideTo('#visit a[href*="maps/dir"]', 700);
  await until(w('visit', 'open now')); await glideTo('#visit [data-open]', 800);
  await until(w('visit', 'today')); await glideTo('#visit .hours tr.is-today', 800, 0.25);
  // footer: the neon-sign line, then the credit
  await until(L.footer.at - 2.9, 'to footer'); await scrollTo(await topOf('.footer', 0), 2600);
  await until(w('footer', 'neon'), 'footer'); await glideTo('.footer__big', 900, 0.35, 0.6);
  await until(end('footer') + 0.3, 'credit'); await scrollTo(1e7, 1800); await glideTo('.footer__legal .credit', 800);
  // events page
  await until(L.events.at - 1.6, 'to events'); await goTo('events.html', 'events loaded');
  await until(w('events', 'Cabaret') - 0.5, 'events'); await scrollTo(await topOf('#weekly', 40), 1000);
  await until(w('events', 'past') - 0.2); await scrollTo(await topOf('#past', 40), 1500);
  await until(w('events', 'fire')); await glideTo('#past .event--wide', 800, 0.3, 0.4);
  // contact page: every way to reach them, then the form checking itself
  await until(L.contact.at - 2.4, 'to contact'); await goTo('contact.html', 'contact loaded');
  await until(L.contact.at - 0.4, 'contact'); await scrollTo(await topOf('#reach', 40), 1100);
  await until(w('contact', 'every')); await glideTo('#reach .ccard', 800);
  await until(w('contact', 'message form') - 1.1); await scrollTo(await topOf('#message', 40), 1300);
  await glideTo('[data-mailto] button[type="submit"]', 700);
  await until(w('contact', 'checks')); await click();
  await until(plan.phone_start + 0.4, 'desktop end');
  await cdp.send('Page.stopScreencast'); await page.waitForTimeout(300);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ t0, frames: index, log }));
  const late = log.filter(([want, got, label]) => want && got - want > 0.3);
  console.log(`${index.length} frames, ${now().toFixed(1)} s; late steps: ${JSON.stringify(late)}`);
  await browser.close();
})();
