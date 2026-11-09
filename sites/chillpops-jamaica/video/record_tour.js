// Desktop tour (1920x1080), timed to plan.json: every action lands on the word that names it.
// usage: node record_tour.js [out_dir]     site served at SITE_URL (default http://127.0.0.1:8090/)
// The helpers are the kit's. The step list below is the ChillPops Jamaica tour.
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
  // intro: the opening plays untouched; the cursor glides in so it's visible from the start
  await page.goto(BASE + 'index.html', { waitUntil: 'commit' });
  await until(1.4, 'cursor in'); await glide(W * 0.6, H * 0.62, 1500);
  // sparks drifting up, then the hanging bulbs
  await until(L.sparks.at + 0.1, 'sparks'); await glide(W * 0.33, H * 0.42, 1600);
  await until(w('sparks', 'bulbs')); await glide(W * 0.18, H * 0.16, 1000);
  // the paleta frame: soft serve, neon rim, then it tilts with the mouse
  await until(w('paleta', 'soft serve'), 'paleta'); await glideTo('.hero__frame', 900, 0.5, 0.5);
  await until(w('paleta', 'neon')); await glideTo('.hero__frame', 700, 0.97, 0.22);
  await until(w('paleta', 'Move')); await glideTo('.hero__frame', 520, 0.12, 0.85);
  await glideTo('.hero__frame', 520, 0.9, 0.18); await glideTo('.hero__frame', 420, 0.4, 0.45);
  // Plan your visit: each option as it's named
  await until(L.plan.at - 1.0, 'to plan'); await glideTo('.hero .btn--solid', 800);
  await until(w('plan', 'opens')); await click();
  await page.waitForFunction(() => document.getElementById('action').classList.contains('is-open'), null, { timeout: 1500 });
  await until(w('plan', 'Negril')); await glideTo('#action .option:nth-of-type(1)', 600, 0.3);
  await until(w('plan', 'Ocho')); await glideTo('#action .option:nth-of-type(2)', 450, 0.3);
  await until(w('plan', 'Instagram')); await glideTo('#action .option:nth-of-type(3)', 450, 0.3);
  await until(w('plan', 'Facebook')); await glideTo('#action .option:nth-of-type(4)', 360, 0.3);
  await until(w('plan', 'email') - 0.1); await glideTo('#action .option:nth-of-type(5)', 380, 0.3);
  await until(end('plan') + 0.3); await page.keyboard.press('Escape');
  // menu bar turns solid while a slow scroll runs into the welcome section; the pink progress line along its edge
  await until(L.navbar.at + 0.1, 'navbar');
  const navScroll = scrollTo(await topOf('.welcome', 40), (L.navbar.dur - 0.4) * 1000);
  await until(w('navbar', 'pink line')); await glideTo('.nav', 900, 0.18, 0.97);
  await navScroll;
  // welcome: photo, the traced PALETAS behind it, drifting as the page moves
  await until(L.welcome.at + 0.1, 'welcome'); await glideTo('.welcome__media picture', 800, 0.5, 0.5);
  await until(w('welcome', 'paletas')); await glideTo('.welcome__media', 800, 0.85, 0.02);
  await until(w('welcome', 'drifting') - 0.3); await scrollTo(await page.evaluate(() => scrollY + 170), 1900);
  // palm-frond shade
  await until(L.palm.at + 0.2, 'palm'); await glide(W * 0.8, H * 0.3, 1000);
  await glide(W * 0.68, H * 0.45, 1500);
  // ribbon: races with the scroll, reverses on the way back up, pauses under the cursor
  await until(L.ribbon.at - 2.4, 'to ribbon'); await Promise.all([centreOn('.marquee', 2200, 0.5), glide(W * 0.5, H * 0.2, 1200)]);
  await until(w('ribbon', 'races')); await scrollTo(await page.evaluate(() => scrollY + 230), 1100);
  await until(w('ribbon', 'scroll back') - 0.2); await scrollTo(await page.evaluate(() => scrollY - 260), 700);
  await until(w('ribbon', 'pauses') - 0.6); await glideTo('.marquee', 600, 0.42);
  await until(end('ribbon') + 0.15); await glide(W * 0.42, H * 0.2, 500);
  // cards: curtains open as they arrive, then hover tilt and description
  await until(L.cards.at - 0.8, 'to cards'); await scrollTo(await topOf('.cards', 150), 2300);
  await until(w('cards', 'Hover'), 'cards'); await glideTo('.cards .card:nth-of-type(1)', 650, 0.5, 0.45);
  await until(w('cards', 'tilts')); await glideTo('.cards .card:nth-of-type(2)', 600, 0.8, 0.25);
  await until(w('cards', 'description')); await glideTo('.cards .card:nth-of-type(3)', 600, 0.5, 0.5);
  // featured pops float; alcohol labels
  await until(L.pops.at - 2.6, 'to pops'); await scrollTo(await topOf('.pops', 250), 2300);
  await until(L.pops.at + 0.2, 'pops'); await glideTo('.pops .pops__item:nth-of-type(2) .pop', 800);
  await until(w('pops', 'alcohol')); await glideTo('.pops .badge', 700);
  // photo band: keep scrolling gently so the parallax and the growing headline both show
  await until(L.band.at - 2.5, 'to band'); await centreOn('.promo', 2300, 0.72);
  await until(L.band.at + 0.1, 'band');
  await Promise.all([glide(W * 0.64, H * 0.66, 900), scrollTo(await page.evaluate(() => scrollY + 330), (L.band.dur - 0.5) * 1000)]);
  // pick your vibe: each tab, the sliding pill, the fan in the tab's colour
  await until(L.vibe.at - 2.5, 'to vibe'); await scrollTo(await topOf('[data-tabs]', 40), 2300);
  const tab = async id => { const b = await box('#tab-' + id); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x, y] = await tab('fruit'); await until(L.vibe.at + 0.1, 'vibe'); await glide(x, y, 700);
  await until(w('vibe', 'fruity')); await click();
  [x, y] = await tab('creamy'); await glide(x, y, 400); await until(w('vibe', 'creamy')); await click();
  [x, y] = await tab('spiked'); await glide(x, y, 400); await until(w('vibe', 'spiked')); await click();
  [x, y] = await tab('creamy'); await until(w('vibe', 'pill') - 0.4); await glide(x, y, 450);
  await until(w('vibe', 'slides')); await click();
  await until(w('vibe', 'fan') - 0.2); await glideTo('#panel-creamy .spot__art', 800, 0.5, 0.5);
  // gallery preview: hover caption, then the video tile
  const G = '[aria-labelledby="gallery-title"]';
  await until(L.gallery.at - 2.5, 'to gallery'); await scrollTo(await topOf(G + ' .masonry', 50), 2300);
  await until(L.gallery.at + 0.1, 'gallery'); await glideTo(G + ' .tile:not([data-type])', 750, 0.5, 0.6);
  await until(w('gallery', 'video') - 0.3); await glideTo(G + ' .tile[data-type="video"]', 750, 0.5, 0.25);
  // viewer: open the video tile, counter, arrows
  await until(L.viewer.at + 0.2, 'viewer'); await click();
  await page.waitForFunction(() => document.getElementById('lightbox').classList.contains('is-open'), null, { timeout: 1500 });
  await until(w('viewer', 'counter')); await glideTo('.lightbox__count', 600);
  await until(w('viewer', 'arrows')); await glideTo('.lightbox__next', 600);
  await until(w('viewer', 'step')); await click();
  await until(end('viewer') + 0.1); await page.keyboard.press('Escape');
  // find us: address, plus code, directions, hours and phone placeholders
  await until(L.visit.at - 3.0, 'to visit'); await scrollTo(await topOf('#visit', 30), 2600);
  await until(w('visit', 'Boardwalk'), 'visit'); await glideTo('#visit .vcard .vrow:nth-of-type(1)', 600, 0.4);
  await until(w('visit', 'plus code')); await glideTo('#visit .vcard .vrow:nth-of-type(2)', 500, 0.3);
  await until(w('visit', 'directions')); await glideTo('#visit .vcard .btn--solid', 600);
  await until(w('visit', 'Hours')); await glideTo('#visit [data-hours]', 600, 0.4);
  await until(w('visit', 'phone')); await glideTo('#visit [data-biz="phone"]', 500, 0.4);
  // footer: the sign-off line, the full-width name and its shine, then the credit
  await until(L.footer.at - 3.0, 'to footer'); await scrollTo(await topOf('.footer', 0), 2600);
  await until(w('footer', 'cool down'), 'footer'); await glideTo('.footer__cta h2', 900, 0.35, 0.6);
  await until(w('footer', 'Chill Pops name') - 0.4); await scrollTo(1e7, 1500); await glideTo('.footer__word', 800, 0.5, 0.5);
  await until(end('footer') - 0.6); await glideTo('.credit-text', 650);
  // the logo glides the page back to the top
  await until(L.logo.at + 0.2, 'logo'); await glideTo('.footer .brand', 700, 0.45);
  await until(w('logo', 'glides') - 0.3); await click();
  // flavours page: live search with a count
  await until(L.flavours.at - 1.8, 'to flavours'); await goTo('flavours.html', 'flavours loaded');
  await until(w('flavours', 'featured') - 0.8, 'flavours'); await scrollTo(await topOf('#catalog', 10), 900);
  await until(w('flavours', 'Type') - 0.5); await glideTo('#flavour-search', 420, 0.35); await click();
  await until(w('flavours', 'mango') - 0.15); await page.keyboard.type('mango', { delay: 90 });
  await until(w('flavours', 'count')); await glideTo('#catalog-status', 600, 0.25);
  // a filter chip
  await until(L.chips.at - 0.55, 'chips'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await glideTo('[data-filter="spiked"]', 600);
  await until(w('chips', 'contains alcohol')); await click();
  // empty state and its reset
  await until(L.empty.at - 0.9, 'empty'); await glideTo('#flavour-search', 600, 0.35); await click();
  await until(w('empty', 'something')); await page.keyboard.type('pizza', { delay: 100 });
  await page.waitForFunction(() => !document.querySelector('[data-empty]').hidden, null, { timeout: 1500 });
  await until(w('empty', 'friendly')); await glideTo('[data-empty] [data-reset]', 700);
  await until(w('empty', 'clear') + 0.2); await click();
  // dotted leaders ending in the source
  await until(L.leaders.at - 1.5, 'to leaders'); await scrollTo(await topOf('.menu', 150), 1400);
  await until(L.leaders.at + 0.1, 'leaders'); await glideTo('.mitem__lead', 500, 0.05);
  await glideTo('.mitem__lead', 1300, 0.95);
  await until(w('leaders', 'featured') - 0.5); await glideTo('.mitem__src', 700);
  // our story
  await until(L.story.at - 2.0, 'to story'); await goTo('story.html', 'story loaded');
  await until(w('story', 'September') - 1.4, 'story'); await centreOn('.chapter:nth-of-type(2)', 1000, 0.5);
  await glideTo('.chapter:nth-of-type(2) .chapter__type', 500);
  await until(w('story', 'chairs') - 1.0); await centreOn('.chapter:nth-of-type(3)', 900, 0.5);
  await glideTo('.chapter:nth-of-type(3) .chapter__media', 700, 0.45, 0.6);
  // locations: both shops, each with directions
  await until(L.locations.at - 2.0, 'to locations'); await goTo('locations.html', 'locations loaded');
  await until(L.locations.at + 0.1, 'locations'); await scrollTo(await topOf('.loc-grid', 110), 1200);
  await until(w('locations', 'Negril')); await glideTo('.loc:nth-of-type(1) .vcard h2', 350, 0.2);
  await until(w('locations', 'Ocho') - 0.15); await centreOn('.loc:nth-of-type(2)', 900, 0.5); await glideTo('.loc:nth-of-type(2) .vcard h2', 450, 0.2);
  await until(w('locations', 'directions')); await glideTo('.loc:nth-of-type(2) .btn--solid', 600);
  await until(plan.phone_start + 0.4, 'desktop end');
  await cdp.send('Page.stopScreencast'); await page.waitForTimeout(300);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ t0, frames: index, log }));
  const late = log.filter(([want, got, label]) => want && got - want > 0.3);
  console.log(`${index.length} frames, ${now().toFixed(1)} s; late steps: ${JSON.stringify(late)}`);
  await browser.close();
})();
