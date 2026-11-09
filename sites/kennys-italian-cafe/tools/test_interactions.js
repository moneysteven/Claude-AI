// usage: node tools/test_interactions.js <site_dir> <out_dir>
// Clicks through the interactive parts: drawer, menu tabs, booking form -> WhatsApp, gallery lightbox,
// the open-now badge at fixed Jamaica times, and the opening intro (timing, skip, Esc, reduced motion, no JS, blocked video).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const results = []; const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };
const seen = () => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} };
(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = async (opts = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts }); await c.route(u => !u.href.startsWith(base) && !/fonts\.(googleapis|gstatic)/.test(u.host), r => r.abort()); return c; };

  // ---- drawer (phone)
  { const c = await ctx(); await c.addInitScript(seen); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'about.html');
    await p.click('[data-burger]'); await p.waitForTimeout(500);
    ok('drawer opens', await p.$eval('#drawer', d => d.classList.contains('is-open')));
    ok('drawer: burger aria-expanded=true', (await p.getAttribute('[data-burger]', 'aria-expanded')) === 'true');
    ok('drawer: focus moves inside', await p.evaluate(() => document.getElementById('drawer').contains(document.activeElement)));
    ok('drawer: page scroll locked', await p.evaluate(() => document.documentElement.classList.contains('is-locked')));
    for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
    ok('drawer: focus stays trapped after 12 Tabs', await p.evaluate(() => document.getElementById('drawer').contains(document.activeElement)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    ok('drawer closes on Esc and focus returns to burger', !(await p.$eval('#drawer', d => d.classList.contains('is-open'))) && await p.evaluate(() => document.activeElement.matches('[data-burger]')));
    await p.click('[data-burger]'); await p.waitForTimeout(500); await p.mouse.click(20, 400); await p.waitForTimeout(500);
    ok('drawer closes on backdrop tap', !(await p.$eval('#drawer', d => d.classList.contains('is-open'))));
    ok('about: no JS errors', !errs.length, errs.join('; ')); await c.close(); }

  // ---- menu tabs
  { const c = await ctx({ viewport: { width: 1280, height: 900 } }); await c.addInitScript(seen); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'menu.html');
    ok('menu: 7 tabs rendered', (await p.$$('[role=tab]')).length === 7);
    ok('menu: 15 pasta items rendered', (await p.$$('#panel-pasta .item')).length === 15);
    ok('menu: no $0 anywhere', !(await p.textContent('#panel-pasta')).includes('$0'));
    ok('menu: My Pasta says "Price to be confirmed"', /My Pasta[\s\S]*Price to be confirmed/.test(await p.textContent('#panel-pasta')));
    ok('menu: 14 "Prices to be confirmed" notes', (await p.$$('#panel-pasta .item__note')).length === 14);
    await p.click('#tab-pizza');
    ok('menu: clicking Pizza shows the pizza panel only', await p.isVisible('#panel-pizza') && !(await p.isVisible('#panel-pasta')));
    await p.focus('#tab-pizza'); await p.keyboard.press('ArrowRight');
    ok('menu: ArrowRight moves to Seafood', (await p.getAttribute('#tab-seafood', 'aria-selected')) === 'true' && await p.evaluate(() => document.activeElement.id === 'tab-seafood'));
    await p.keyboard.press('End'); ok('menu: End jumps to the last tab', (await p.getAttribute('#tab-desserts', 'aria-selected')) === 'true');
    await p.keyboard.press('ArrowRight'); ok('menu: ArrowRight wraps to the first tab', (await p.getAttribute('#tab-pasta', 'aria-selected')) === 'true');
    await p.goto(base + 'menu.html#desserts'); await p.waitForTimeout(300);
    ok('menu: deep link #desserts opens that tab', await p.isVisible('#panel-desserts'));
    const imgs = await p.$$eval('#panel-desserts img, #panel-pizza img', a => a.length); ok('menu: placeholder tabs have real photos', imgs > 0);
    ok('menu: no JS errors', !errs.length, errs.join('; ')); await c.close(); }

  // ---- booking form -> WhatsApp
  { const c = await ctx(); await c.addInitScript(seen); await c.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'reservations.html?occasion=Birthday');
    ok('form: ?occasion=Birthday preselects Birthday', (await p.inputValue('#r-occasion')) === 'Birthday');
    await p.click('button[type=submit]');
    ok('form: empty submit shows 5 errors', (await p.$$('[aria-invalid=true]')).length === 5);
    ok('form: focus goes to the first invalid field', await p.evaluate(() => document.activeElement.id === 'r-name'));
    const d = await p.evaluate(() => { const t = new Date(Date.now() + 9 * 864e5); return t.toISOString().slice(0, 10); });
    await p.fill('#r-name', 'Test Guest'); await p.fill('#r-phone', '+1 876 555 0101'); await p.fill('#r-date', d);
    await p.dispatchEvent('#r-date', 'change');
    const opts = await p.$$eval('#r-time option', o => o.map(x => x.value).filter(Boolean));
    ok('form: time slots follow the chosen day', opts.length >= 15, `${opts[0]} … ${opts[opts.length - 1]}`);
    await p.selectOption('#r-time', opts[4]); await p.selectOption('#r-size', '4'); await p.fill('#r-notes', 'Window cabana if possible');
    await p.click('button[type=submit]'); await p.waitForTimeout(300);
    const url = (await p.evaluate(() => window.__opened))[0] || '';
    const msg = decodeURIComponent(url.split('text=')[1] || '');
    ok('form: opens wa.me/18769123719', url.startsWith('https://wa.me/18769123719?text='), url.slice(0, 40));
    ok('form: message has every field', ['Name: Test Guest', 'Phone: +1 876 555 0101', 'Date: ', `Time: ${opts[4]}`, 'Party size: 4', 'Occasion: Birthday', 'Notes: Window cabana'].every(s => msg.includes(s)), msg.replace(/\n/g, ' | '));
    ok('form: confirmation panel shows', await p.isVisible('[data-done]'));
    fs.writeFileSync(path.join(out, 'whatsapp-message.txt'), msg);
    // Saturday hint
    const sat = await p.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + ((6 - t.getDay() + 7) % 7 || 7)); return t.toISOString().slice(0, 10); });
    await p.fill('#r-date', sat); await p.dispatchEvent('#r-date', 'change');
    ok('form: Saturday shows the "call to confirm" hint', /aren't published/.test(await p.textContent('[data-date-hint]')));
    const fri = await p.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7 || 7)); return t.toISOString().slice(0, 10); });
    await p.fill('#r-date', fri); await p.dispatchEvent('#r-date', 'change');
    const fopts = await p.$$eval('#r-time option', o => o.map(x => x.value).filter(Boolean));
    ok('form: Friday slots run past midnight', fopts.includes('1 am'), fopts.slice(-3).join(', '));
    await p.screenshot({ path: path.join(out, 'form-done-390.png'), fullPage: false });
    ok('reservations: no JS errors', !errs.length, errs.join('; ')); await c.close(); }

  // ---- gallery lightbox
  { const c = await ctx({ viewport: { width: 1280, height: 900 } }); await c.addInitScript(seen); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'gallery.html');
    const total = (await p.$$('.masonry__item')).length;
    await p.click('[data-filter=food]'); const food = await p.$$eval('.masonry__item', a => a.filter(x => !x.hidden).length);
    ok('gallery: Food filter narrows the grid', food > 0 && food < total, `${food}/${total}`);
    await p.click('[data-filter=all]');
    const first = await p.$('.masonry__item'); await first.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    ok('lightbox opens with image and "1 / N"', await p.isVisible('#lightbox .lb__stage img') && /^1 \/ \d+$/.test(await p.textContent('.lb__count')), await p.textContent('.lb__count'));
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
    ok('lightbox: ArrowRight goes to 2', (await p.textContent('.lb__count')).startsWith('2 /'));
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
    ok('lightbox: ArrowLeft wraps to the last', (await p.textContent('.lb__count')) === `${total} / ${total}`);
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
    ok('lightbox: video tile plays as video', await p.isVisible('#lightbox .lb__stage video'), await p.textContent('.lb__cap'));
    await p.screenshot({ path: path.join(out, 'lightbox-1280.png') });
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok('lightbox: Esc closes and focus returns to the tile', !(await p.$eval('#lightbox', l => l.classList.contains('is-open'))) && await p.evaluate(() => document.activeElement.classList.contains('masonry__item')));
    ok('gallery: no JS errors', !errs.length, errs.join('; ')); await c.close(); }

  // ---- open-now badge at fixed Jamaica times (Jamaica = UTC-5, no DST)
  for (const [label, iso, want] of [['Mon 10:00', '2026-11-09T15:00:00Z', /Closed · opens 3 pm/], ['Mon 16:00', '2026-11-09T21:00:00Z', /Open now · until midnight/],
    ['Fri 23:30', '2026-11-14T04:30:00Z', /Open now · until 2 am/], ['Sat 01:00 (Friday late)', '2026-11-14T06:00:00Z', /Open now · until 2 am/],
    ['Sat 18:00', '2026-11-14T23:00:00Z', /Saturday: call to confirm/], ['Sun 01:00', '2026-11-15T06:00:00Z', /call to confirm/], ['Sun 15:30', '2026-11-15T20:30:00Z', /Open now · until midnight/]]) {
    const c = await ctx(); await c.addInitScript(seen);
    await c.addInitScript(t => { const D = Date, fixed = new D(t).getTime(); Date = class extends D { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; }, iso);
    const p = await c.newPage(); await p.goto(base + 'contact.html');
    const txt = await p.textContent('.panel [data-open-status]'); const today = await p.textContent('tr.is-today th');
    ok(`open-now ${label}`, want.test(txt), `${txt} · today row: ${today}`); await c.close();
  }

  // ---- opening intro
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const c = await ctx({ viewport: { width: w, height: h } }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const t0 = Date.now(); await p.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, `intro-${w}-1.5s.png`) });
    const src = await p.evaluate(() => { const v = document.querySelector('.opener__video'); return v && v.currentSrc; });
    ok(`intro ${w}: plays the ${w > h ? 'wide' : 'phone'} cut`, w > h ? /intro\.(webm|mp4)$/.test(src) : /intro-mobile\./.test(src), src.split('/').pop());
    ok(`intro ${w}: page can't scroll meanwhile`, await p.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'));
    await p.keyboard.press('Tab');
    ok(`intro ${w}: Skip is the first Tab stop`, await p.evaluate(() => document.activeElement.matches('[data-opener-skip]')));
    await p.waitForTimeout(4800 - (Date.now() - t0)); await p.screenshot({ path: path.join(out, `intro-${w}-4.8s.png`) });
    ok(`intro ${w}: logo stage by 4.8 s`, await p.evaluate(() => { const o = document.getElementById('opener'); return !o || o.classList.contains('is-logo') || o.classList.contains('is-out'); }));
    await p.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 9000 }).catch(() => {});
    const done = (Date.now() - t0) / 1000;
    ok(`intro ${w}: site fully in between 4 and 8 s`, done > 4 && done < 8.2, done.toFixed(1) + ' s');
    await p.waitForTimeout(Math.max(0, 8000 - (Date.now() - t0))); await p.screenshot({ path: path.join(out, `intro-${w}-8s.png`) });
    await p.reload(); await p.waitForTimeout(400);
    ok(`intro ${w}: no intro on reload in the same visit`, !(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))));
    ok(`intro ${w}: no JS errors`, !errs.length, errs.join('; ')); await c.close();
  }
  { const c = await ctx({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); await p.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
    await p.click('[data-opener-skip]'); await p.waitForTimeout(1200);
    ok('intro: Skip reveals the site at once', !(await p.$('#opener')) && await p.evaluate(() => getComputedStyle(document.documentElement).overflow !== 'hidden')); await c.close(); }
  { const c = await ctx({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); await p.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
    await p.keyboard.press('Escape'); await p.waitForTimeout(1200); ok('intro: Esc reveals the site', !(await p.$('#opener'))); await c.close(); }
  { const c = await ctx({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await c.newPage(); await p.goto(base + 'index.html');
    ok('intro: none with reduced motion', !(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))) && !(await p.isVisible('#opener'))); await c.close(); }
  { const c = await ctx({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false }); const p = await c.newPage(); await p.goto(base + 'index.html');
    ok('intro: none without JavaScript, headline visible', !(await p.isVisible('#opener')) && await p.isVisible('h1'));
    await p.screenshot({ path: path.join(out, 'nojs-1440.png') }); await c.close(); }
  { const c = await ctx({ viewport: { width: 1440, height: 900 } }); await c.route(/intro/, r => r.abort()); const p = await c.newPage();
    const t0 = Date.now(); await p.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 9000 }).catch(() => {});
    const s = (Date.now() - t0) / 1000; ok('intro: video blocked -> site still appears quickly', s < 4.6, s.toFixed(1) + ' s'); await c.close(); }

  await browser.close(); server.close();
  fs.writeFileSync(path.join(out, 'interactions.txt'), results.join('\n'));
  console.log(results.join('\n')); process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
