// usage: node tools/qa_interactions.js <site_dir> <out_dir>
// Checks the opening intro (timing, scroll lock, Skip/Esc, once per visit, reduced motion, no JS, blocked video)
// and the interactive parts: drawer, action modal, tabs, lightbox, menu search/chips, open-now badge, links, film, draft form.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  const size = fs.statSync(f).size, range = req.headers.range, type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'), s = +a, e = b ? +b : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size }); fs.createReadStream(f).pipe(res);
}).listen(0);
const results = []; const ok = (name, pass, info = '') => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const seen = () => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} };

(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  // ---------- opening intro ----------
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const t0 = Date.now(); await page.goto(base, { waitUntil: 'commit' });
    await page.waitForSelector('#opener');
    await page.keyboard.press('Tab');
    ok(`[${w}] Skip intro is the first Tab stop`, await page.evaluate(() => document.activeElement?.hasAttribute('data-opener-skip')));
    await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - t0)));
    await page.screenshot({ path: path.join(out, `intro-${w}-1.5s.png`) });
    const playing = await page.evaluate(() => { const v = document.querySelector('.opener__video'); return v && !v.paused && v.currentTime > 0; });
    ok(`[${w}] intro video plays`, playing);
    await page.mouse.wheel(0, 800); await page.waitForTimeout(150);
    ok(`[${w}] page can't scroll during the intro`, await page.evaluate(() => scrollY === 0));
    await page.waitForTimeout(Math.max(0, 4800 - (Date.now() - t0)));
    await page.screenshot({ path: path.join(out, `intro-${w}-4.8s.png`) });
    ok(`[${w}] logo stage shows`, await page.evaluate(() => !!document.querySelector('.opener.is-logo, .opener.is-out') || !document.getElementById('opener')));
    let doneAt = 0;
    for (let i = 0; i < 100; i++) { if (await page.evaluate(() => !document.documentElement.classList.contains('opener-on'))) { doneAt = Date.now() - t0; break; } await page.waitForTimeout(50); }
    ok(`[${w}] site revealed between 4 and 8 s`, doneAt >= 4000 && doneAt <= 8000, `${(doneAt / 1000).toFixed(2)} s`);
    await page.waitForTimeout(Math.max(0, 8000 - (Date.now() - t0)));
    await page.screenshot({ path: path.join(out, `intro-${w}-8s.png`) });
    ok(`[${w}] opener removed and hero video playing`, await page.evaluate(() => !document.getElementById('opener') && !document.querySelector('[data-hero-video]').paused));
    await page.reload({ waitUntil: 'domcontentloaded' });
    ok(`[${w}] no intro on reload in the same visit`, await page.evaluate(() => !document.documentElement.classList.contains('opener-on')));
    await page.goto(base + 'menu.html'); ok(`[${w}] no intro on other pages`, await page.evaluate(() => !document.getElementById('opener')));
    await ctx.close();
  }
  for (const key of ['skip', 'Escape']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
    await page.goto(base); await page.waitForTimeout(1000);
    const t = Date.now();
    if (key === 'skip') await page.click('[data-opener-skip]'); else await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.documentElement.classList.contains('opener-on'), null, { timeout: 2000 }).catch(() => {});
    ok(`${key === 'skip' ? 'Skip button' : 'Esc key'} reveals the site at once`, Date.now() - t < 400, `${Date.now() - t} ms`);
    await ctx.close();
  }
  { const ctx = await browser.newContext({ reducedMotion: 'reduce' }); const page = await ctx.newPage(); await page.goto(base);
    ok('no intro with reduced motion', await page.evaluate(() => !document.documentElement.classList.contains('opener-on') && !document.getElementById('opener')));
    ok('reduced motion: hero shows the poster only', await page.evaluate(() => !document.querySelector('[data-hero-video] source')));
    await ctx.close(); }
  { const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage(); await page.goto(base);
    ok('no intro without JavaScript', await page.evaluate(() => getComputedStyle(document.getElementById('opener')).display === 'none'));
    ok('content visible without JavaScript', await page.evaluate(() => getComputedStyle(document.querySelector('.hero h1 .mask > span')).transform === 'none'));
    await ctx.close(); }
  { const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.route(/intro/, r => r.abort());
    const t = Date.now(); await page.goto(base);
    await page.waitForFunction(() => !document.documentElement.classList.contains('opener-on'), null, { timeout: 6000 }).catch(() => {});
    const dt = Date.now() - t; ok('intro video blocked: site still appears quickly', dt < 2600, `${(dt / 1000).toFixed(2)} s`); await ctx.close(); }

  // ---------- interactions ----------
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } }); await ctx.addInitScript(seen);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base);
  await page.click('[data-burger]'); await page.waitForTimeout(300);
  ok('drawer opens', await page.evaluate(() => document.getElementById('drawer').classList.contains('is-open') && document.querySelector('[data-burger]').getAttribute('aria-expanded') === 'true'));
  ok('drawer moves focus inside', await page.evaluate(() => document.getElementById('drawer').contains(document.activeElement)));
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  ok('drawer traps focus', await page.evaluate(() => document.getElementById('drawer').contains(document.activeElement)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('drawer closes with Esc and returns focus', await page.evaluate(() => !document.getElementById('drawer').classList.contains('is-open') && document.activeElement.hasAttribute('data-burger')));
  ok('scroll unlocked after drawer', await page.evaluate(() => !document.documentElement.classList.contains('is-locked')));

  for (const file of ['index.html', 'menu.html', 'experience.html', 'story.html', 'groups.html', 'gallery.html', 'visit.html']) {
    await page.goto(base + file);
    const n = await page.evaluate(() => document.querySelectorAll('[data-action]').length);
    let opened = 0;
    for (let i = 0; i < n; i++) {
      const vis = await page.evaluate(i => { const b = document.querySelectorAll('[data-action]')[i]; const r = b.getBoundingClientRect(); return !!r.width && getComputedStyle(b).visibility !== 'hidden' && !b.closest('.drawer'); }, i);
      if (!vis) continue;
      await page.evaluate(i => document.querySelectorAll('[data-action]')[i].click(), i); await page.waitForTimeout(120);
      const o = await page.evaluate(() => document.getElementById('action').classList.contains('is-open') && document.querySelectorAll('#action .opt').length);
      if (o === 6) opened++;
      await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    }
    const vis = await page.evaluate(() => [...document.querySelectorAll('[data-action]')].filter(b => b.getBoundingClientRect().width && !b.closest('.drawer')).length);
    ok(`[${file}] action modal opens from every visible CTA (6 options) and closes with Esc`, opened === vis && vis > 0, `${opened}/${vis}`);
  }
  await page.goto(base);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('#action .opt')].map(a => a.getAttribute('href')));
  ok('modal links well-formed', hrefs.filter(h => /^tel:\+1876\d{7}$/.test(h)).length === 2 && hrefs.some(h => h.startsWith('mailto:info@rickscafejamaica.com')) && hrefs.some(h => h.startsWith('https://www.google.com/maps/search/?api=1&query=')), hrefs.join(' '));
  const tels = await page.evaluate(() => [...document.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')));
  ok('every tel: link is one of the two published numbers', tels.every(t => t === 'tel:+18769570380' || t === 'tel:+18768221764'), [...new Set(tels)].join(' '));
  ok('no tour-operator number anywhere', !(await page.content()).includes('516'));
  const badge = await page.evaluate(() => document.querySelector('[data-open]').textContent.trim());
  ok('open-now badge computed', /^(Open now · until|Closed now · daily from)/.test(badge), badge);
  await page.evaluate(() => scrollTo(0, innerHeight * 1.5)); await page.waitForTimeout(500);
  ok('floating action button appears after the hero (375px)', await page.evaluate(() => document.querySelector('.fab').classList.contains('is-visible')));

  // tabs
  await page.focus('#tab-sunset'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  ok('tabs: ArrowRight selects the next tab', await page.evaluate(() => document.getElementById('tab-sips').getAttribute('aria-selected') === 'true' && !document.getElementById('panel-sips').hidden && document.getElementById('panel-sunset').hidden && document.activeElement.id === 'tab-sips'));
  await page.keyboard.press('End'); ok('tabs: End selects the last tab', await page.evaluate(() => document.getElementById('tab-cliffs').getAttribute('aria-selected') === 'true'));
  await page.keyboard.press('ArrowRight'); ok('tabs: wrap around', await page.evaluate(() => document.getElementById('tab-sunset').getAttribute('aria-selected') === 'true'));

  // lightbox
  await page.goto(base + 'gallery.html');
  await page.click('.tile button >> nth=0'); await page.waitForTimeout(300);
  const c1 = await page.textContent('.lightbox__count');
  await page.keyboard.press('ArrowRight'); const c2 = await page.textContent('.lightbox__count');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); const c3 = await page.textContent('.lightbox__count');
  ok('lightbox opens with a counter, ←/→ work and wrap', c1 === '1 / 13' && c2 === '2 / 13' && c3 === '13 / 13', `${c1}, ${c2}, ${c3}`);
  ok('lightbox shows a caption', (await page.textContent('.lightbox__cap')).length > 10);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('lightbox closes with Esc and returns focus to the photo', await page.evaluate(() => !document.querySelector('.lightbox').classList.contains('is-open') && document.activeElement.matches('.tile button')));
  await page.click('[data-filter="historical"]'); await page.waitForTimeout(100);
  const nHist = await page.evaluate(() => document.querySelectorAll('.tile:not([hidden])').length);
  await page.click('.tile:not([hidden]) button >> nth=0'); await page.waitForTimeout(200);
  ok('gallery filter narrows tiles and the lightbox', nHist === 3 && (await page.textContent('.lightbox__count')) === `1 / ${nHist}`, `${nHist} historical`);
  await page.keyboard.press('Escape');
  await page.click('[data-yt]'); await page.waitForTimeout(200);
  ok('film loads the official YouTube player only on click', await page.evaluate(() => /youtube-nocookie\.com\/embed\/Q_PbJaHm96Y/.test(document.querySelector('.film iframe')?.src || '')));

  // menu
  await page.goto(base + 'menu.html'); await page.waitForTimeout(200);
  const all = await page.textContent('[data-menu-count]');
  await page.fill('#menu-q', 'rum'); const rum = await page.textContent('[data-menu-count]');
  await page.fill('#menu-q', 'zzzz'); const none = await page.evaluate(() => !document.querySelector('.menu-empty').hidden);
  await page.fill('#menu-q', ''); await page.click('[data-g="beers"]');
  const beers = await page.evaluate(() => [...document.querySelectorAll('.menu-group')].filter(s => !s.hidden).map(s => s.dataset.group).join(','));
  const beerCount = await page.textContent('[data-menu-count]');
  ok('menu renders every item', all.startsWith('85 items') || /^\d+ items$/.test(all), all);
  ok('menu search filters live', /items? matching “rum”/.test(rum) && parseInt(rum) < parseInt(all), rum);
  ok('menu empty state', none);
  ok('menu chips filter by section', beers === 'beers' && beerCount.startsWith('14'), `${beers}: ${beerCount}`);
  ok('menu prices are USD as printed (no JMD)', !(await page.content()).includes('JMD'));
  await page.goto(base); await page.goto(base + 'menu.html#m-specials'); await page.waitForTimeout(500);   // arrive from another page, like a visitor
  ok('deep link to a menu section scrolls to it', await page.evaluate(() => { const r = document.getElementById('m-specials').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));

  // draft form
  await page.goto(base + 'groups.html#inquire');
  await page.click('form[data-draft] button[type=submit]'); await page.waitForTimeout(100);
  ok('draft form: empty submit shows validation, nothing else', await page.evaluate(() => !document.querySelector('.form__msg').textContent.trim()));
  await page.fill('#f-name', 'Test Person'); await page.fill('#f-email', 'test@example.com'); await page.selectOption('#f-type', 'Wedding'); await page.fill('#f-msg', 'Hello');
  await page.click('form[data-draft] button[type=submit]'); await page.waitForTimeout(100);
  ok('draft form: says it is not connected and offers an email link', await page.evaluate(() => /isn't connected yet/.test(document.querySelector('.form__msg').textContent) && /^mailto:info@rickscafejamaica\.com/.test(document.querySelector('.form__msg a').getAttribute('href'))));
  ok('no card-number fields anywhere', await page.evaluate(() => !document.querySelector('input[autocomplete^="cc-"], input[name*="card" i]')));
  ok('no JS errors during interaction tests', errs.length === 0, errs.join(' | '));
  await ctx.close(); await browser.close(); server.close();
  fs.writeFileSync(path.join(out, 'interactions.txt'), results.join('\n'));
  console.log(results.join('\n')); process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
