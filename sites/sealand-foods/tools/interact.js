// usage: node tools/interact.js <site_dir> <out_dir>   (hand tests from the master prompt, automated)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f), type = types[path.extname(f).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const results = []; const ok = (name, pass, info = '') => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); };
(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const seen = async ctx => ctx.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });

  // ---------- page behaviour (intro marked seen) ----------
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); await seen(ctx);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const T = s => `[${w}] ${s}`;
    if (w < 900) {
      await page.click('.burger'); await page.waitForTimeout(450);
      ok(T('drawer opens'), await page.$eval('#drawer', d => d.classList.contains('is-open')) && await page.$eval('.burger', b => b.getAttribute('aria-expanded')) === 'true');
      ok(T('drawer locks scroll'), await page.$eval('html', r => r.classList.contains('is-locked')));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      ok(T('drawer closes on Esc'), !(await page.$eval('#drawer', d => d.classList.contains('is-open'))));
      await page.click('.burger'); await page.waitForTimeout(400); await page.click('.drawer__panel nav a[href="#visit"]'); await page.waitForTimeout(900);
      ok(T('drawer link closes + scrolls'), !(await page.$eval('#drawer', d => d.classList.contains('is-open'))) && await page.evaluate(() => scrollY) > 1000);
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
      await page.evaluate(() => scrollTo(0, innerHeight * 1.5)); await page.waitForTimeout(500);
      ok(T('floating call button shows after hero'), await page.$eval('.fab', f => f.classList.contains('is-shown') && getComputedStyle(f).display !== 'none'));
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
    }
    // modal from every CTA
    const n = await page.$$eval('[data-action]', b => b.length); let good = 0;
    for (let i = 0; i < n; i++) {
      const opened = await page.evaluate(i => { const b = document.querySelectorAll('[data-action]')[i]; if (!b.offsetParent && getComputedStyle(b).position !== 'fixed') return 'hidden'; b.click(); return document.getElementById('action').classList.contains('is-open'); }, i);
      if (opened === 'hidden') { good++; continue; }
      await page.keyboard.press('Escape'); await page.waitForTimeout(80);
      const closed = !(await page.$eval('#action', m => m.classList.contains('is-open')));
      if (opened && closed) good++;
    }
    ok(T(`modal opens from all ${n} CTAs and closes with Esc`), good === n, `${good}/${n}`);
    await page.click('.hero [data-action]'); await page.waitForTimeout(400);
    ok(T('modal focus inside'), await page.evaluate(() => document.getElementById('action').contains(document.activeElement)));
    await page.click('.modal__backdrop', { position: { x: 5, y: 5 } }); await page.waitForTimeout(400);
    ok(T('modal closes on backdrop, focus returns'), !(await page.$eval('#action', m => m.classList.contains('is-open'))) && await page.evaluate(() => document.activeElement.matches('.hero [data-action]')));
    // search + chips
    await page.fill('#menu-q', 'cake'); await page.waitForTimeout(100);
    const cakeN = await page.$$eval('#menu-list .menu__item', l => l.length);
    ok(T('search filters'), cakeN === 6, `cake -> ${cakeN} items (5 cakes + pancakes), count text: "${await page.textContent('#menu-count')}"`);
    await page.fill('#menu-q', 'zzzz'); ok(T('empty state'), !!(await page.$('#menu-list .empty')));
    await page.fill('#menu-q', ''); await page.click('#menu-chips [data-cat="Retail Store"]');
    ok(T('chips filter'), await page.$$eval('#menu-list .menu__item', l => l.length) === 3);
    await page.click('#menu-chips [data-cat="All"]');
    // tabs
    await page.focus('#tab-deli'); await page.keyboard.press('ArrowRight');
    ok(T('tabs arrow right'), await page.$eval('#tab-cakes', t => t.getAttribute('aria-selected')) === 'true' && await page.$eval('#panel-cakes', p => !p.hidden) && await page.evaluate(() => document.activeElement.id) === 'tab-cakes');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    ok(T('tabs wrap with arrow left'), await page.$eval('#tab-market', t => t.getAttribute('aria-selected')) === 'true' && await page.$eval('.spot__media picture[data-for="tab-market"]', p => p.classList.contains('is-active')));
    // lightbox
    const tiles = await page.$$eval('.tile', t => t.length);
    await page.click('.tile >> nth=0'); await page.waitForTimeout(300);
    ok(T('lightbox opens'), await page.$eval('#lightbox', l => l.classList.contains('is-open')) && (await page.textContent('.lightbox__count')) === `1 / ${tiles}`);
    await page.keyboard.press('ArrowRight'); const c2 = await page.textContent('.lightbox__count');
    ok(T('lightbox → next'), c2 === `2 / ${tiles}`, c2);
    ok(T('lightbox video tile plays inline'), !!(await page.$('.lightbox__media video')));
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    ok(T('lightbox ← wraps'), (await page.textContent('.lightbox__count')) === `${tiles} / ${tiles}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(T('lightbox Esc closes, focus returns'), !(await page.$eval('#lightbox', l => l.classList.contains('is-open'))) && await page.evaluate(() => document.activeElement.classList.contains('tile')));
    // links
    const hrefs = await page.$$eval('a[href]', a => a.map(x => x.getAttribute('href')));
    const tel = hrefs.filter(h => h.startsWith('tel:')), badTel = tel.filter(h => !/^tel:\+1876\d{7}$/.test(h));
    ok(T('tel: links E.164'), tel.length > 0 && !badTel.length, `${tel.length} links ${badTel.join(',')}`);
    ok(T('maps links well-formed'), hrefs.filter(h => h.includes('google.com/maps')).every(h => /^https:\/\/www\.google\.com\/maps(\/dir\/\?api=1&destination=|\?q=)[^ ]+$/.test(h)));
    ok(T('mailto + instagram'), hrefs.some(h => h.startsWith('mailto:sealandfoodscoltd@gmail.com')) && hrefs.some(h => h === 'https://www.instagram.com/sealandsub/'));
    // open now badge vs. independent calc
    const badge = await page.textContent('[data-status]');
    const expect = await page.evaluate(() => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Jamaica' })); const day = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
      const close = day === 0 ? 0 : day === 5 ? 19 * 60 : 17 * 60; return day !== 0 && m >= 480 && m < close ? 'Open now' : 'Closed now'; });
    ok(T('open-now badge'), badge === expect, `${badge}; today row: ${await page.$eval('.hours tr.is-today th', t => t.textContent)}`);
    // tap targets on phones
    if (w < 900) {
      const small = await page.$$eval('a,button,input', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && e.offsetParent !== null && (r.height < 32 || r.width < 32) && !e.closest('.menu,.footer li,.vrow,p'); }).map(e => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height)));
      ok(T('tap targets ≥ ~44px (key controls)'), small.length === 0, small.slice(0, 6).join(' | '));
    }
    ok(T('no JS errors'), errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---------- opening intro ----------
  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const t0 = Date.now(); await page.goto(base);
    await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, `intro-${label}-1.5s.png`) });
    const playing = await page.evaluate(() => { const v = document.querySelector('.opener__video'); return !!v && !v.paused && v.currentTime > 0; });
    ok(`[${label}] intro video plays`, playing);
    await page.mouse.wheel(0, 800); await page.waitForTimeout(200);
    ok(`[${label}] page can't scroll during intro`, await page.evaluate(() => scrollY) === 0);
    await page.waitForTimeout(4800 - (Date.now() - t0)); await page.screenshot({ path: path.join(out, `intro-${label}-4.8s.png`) });
    ok(`[${label}] logo shows`, await page.evaluate(() => { const o = document.getElementById('opener'); return !o || o.classList.contains('is-logo'); }));
    await page.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 9000 }).catch(() => {});
    const inAt = (Date.now() - t0) / 1000;
    ok(`[${label}] site fully in between 4 and 8 s`, inAt >= 4 && inAt <= 8.3, `${inAt.toFixed(1)} s`);
    await page.waitForTimeout(Math.max(0, 8000 - (Date.now() - t0))); await page.screenshot({ path: path.join(out, `intro-${label}-8s.png`) });
    await page.reload(); await page.waitForTimeout(500);
    ok(`[${label}] no intro on reload`, !(await page.evaluate(() => document.documentElement.classList.contains('opener-on'))));
    await ctx.close();
  }
  { // skip is first tab stop; skip + Esc
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
    await page.goto(base); await page.waitForTimeout(600); await page.keyboard.press('Tab');
    ok('Skip intro is the first Tab stop', await page.evaluate(() => document.activeElement.matches('[data-opener-skip]')));
    const t = Date.now(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 3000 }).catch(() => {});
    ok('Skip reveals at once', (Date.now() - t) < 1500, `${Date.now() - t} ms`); await ctx.close();
    const c2 = await browser.newContext(); const p2 = await c2.newPage(); await p2.goto(base); await p2.waitForTimeout(600);
    const t2 = Date.now(); await p2.keyboard.press('Escape');
    await p2.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 3000 }).catch(() => {});
    ok('Esc reveals at once', (Date.now() - t2) < 1500, `${Date.now() - t2} ms`); await c2.close();
  }
  { const ctx = await browser.newContext({ reducedMotion: 'reduce' }); const page = await ctx.newPage(); await page.goto(base); await page.waitForTimeout(300);
    ok('no intro with reduced motion', !(await page.evaluate(() => document.documentElement.classList.contains('opener-on'))) && await page.$eval('#opener', o => getComputedStyle(o).display) === 'none');
    ok('hero shows poster only with reduced motion', await page.$eval('.hero__media video', v => !v.querySelector('source') && v.paused));
    await ctx.close(); }
  { const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage(); await page.goto(base); await page.waitForTimeout(300);
    ok('no intro without JavaScript', await page.$eval('#opener', o => getComputedStyle(o).display) === 'none');
    ok('content visible without JavaScript', await page.$eval('.hero h1 .mask>span', s => getComputedStyle(s).transform === 'none' || getComputedStyle(s).transform === 'matrix(1, 0, 0, 1, 0, 0)'));
    await ctx.close(); }
  { const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.route(/intro/, r => r.abort());
    const t = Date.now(); await page.goto(base);
    await page.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 9000 }).catch(() => {});
    const s = (Date.now() - t) / 1000; ok('intro video blocked: site appears fast', s < 4.8, `${s.toFixed(1)} s (logo 1.25 s + wipe 1.1 s after the failure)`); await ctx.close(); }

  await browser.close(); server.close();
  fs.writeFileSync(path.join(out, 'interact.txt'), results.join('\n'));
  console.log(results.join('\n')); process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
