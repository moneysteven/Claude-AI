// usage: node tools/interactions.js <site_dir> <out_dir>
// Hands-on checks from the master prompt (section 10): drawer, action modal from every CTA, lightbox keys, tabs,
// catalog search, link formats, the "open now" logic and the opening intro (timing, skip, Esc, once per visit,
// reduced motion, no JavaScript, video blocked). Prints PASS/FAIL lines and saves intro screenshots.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const seen = async ctx => ctx.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });

  // ---------- page features (intro marked as seen) ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await seen(ctx);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  // drawer
  await page.click('.burger');
  ok(await page.locator('#drawer.is-open').count() === 1, 'drawer opens from the burger');
  ok(await page.evaluate(() => document.activeElement.classList.contains('drawer__close')), 'drawer moves focus inside');
  ok(await page.evaluate(() => document.documentElement.classList.contains('lock')), 'drawer locks page scroll');
  await page.keyboard.press('Escape');
  ok(await page.locator('#drawer.is-open').count() === 0, 'Esc closes the drawer');
  ok(await page.evaluate(() => document.activeElement.classList.contains('burger')), 'focus returns to the burger');
  await page.click('.burger'); await page.waitForTimeout(500); await page.mouse.click(20, 400);
  ok(await page.locator('#drawer.is-open').count() === 0, 'backdrop tap closes the drawer');
  // action modal from every CTA
  const sel = 'main [data-action], header [data-action], footer [data-action], .fab';
  const ctas = await page.locator(sel).count(); let opened = 0, tried = 0;
  for (let i = 0; i < ctas; i++) {
    const el = page.locator(sel).nth(i);
    await el.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(80);
    if (!(await el.isVisible())) continue;
    tried++; await el.click();
    if (await page.locator('#action.is-open').count()) opened++;
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  }
  ok(opened === tried && tried > 5, `action modal opens from every visible CTA (${opened}/${tried})`);
  await page.evaluate(() => scrollTo(0, 0)); await page.click('.burger'); await page.waitForTimeout(500);
  await page.click('#drawer [data-action]');
  ok(await page.locator('#action.is-open').count() === 1 && await page.locator('#drawer.is-open').count() === 0, 'drawer CTA closes the drawer and opens the modal');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.locator('.cat-item__ask').first().click();
  const rows = await page.$$eval('#action-opts a', as => as.map(a => a.href));
  ok(rows.some(h => /^https:\/\/wa\.me\/1876\d{7}\?text=/.test(h)), 'WhatsApp link is wa.me/1876xxxxxxx with a message');
  ok(rows.some(h => /^tel:\+1876\d{7}$/.test(h)), 'call link is tel:+1876xxxxxxx');
  ok(rows.some(h => h.startsWith('mailto:chappasales@gmail.com?subject=Quote%20request')), 'email row opens a quote request to chappasales@gmail.com');
  ok((await page.textContent('.modal__eyebrow')).includes('BMK Disc Pads'), 'modal carries the product the visitor asked about');
  await page.click('#action-chips .chip >> nth=1');
  ok((await page.textContent('#action-foot')).includes('Lucea'), 'branch chips switch the branch in the modal');
  await page.keyboard.press('Escape');
  ok(await page.locator('#action.is-open').count() === 0, 'Esc closes the action modal');
  // catalog
  await page.fill('#cat-q', 'rimula');
  ok((await page.$$eval('.cat-item:not([hidden])', l => l.length)) === 1, 'search filters the catalog');
  await page.fill('#cat-q', 'zzzz');
  ok(await page.isVisible('#cat-empty'), 'empty state shows when nothing matches');
  await page.fill('#cat-q', ''); await page.click('#cat-chips .chip[data-cat="Tyres"]');
  ok((await page.$$eval('.cat-item:not([hidden])', l => l.length)) === 2, 'category chip filters the catalog');
  ok(/2 lines in Tyres/.test(await page.textContent('#cat-count')), 'result count is announced');
  // spotlight tabs (arrow keys)
  await page.focus('#tab-brakes'); await page.keyboard.press('ArrowRight');
  ok(await page.getAttribute('#tab-tyres', 'aria-selected') === 'true' && !(await page.isHidden('#panel-tyres')), 'ArrowRight moves to the Tyres tab');
  await page.keyboard.press('End');
  ok(await page.getAttribute('#tab-oils', 'aria-selected') === 'true', 'End key selects the last tab');
  // branch finder
  await page.focus('#bt-molynes-road'); await page.keyboard.press('Home');
  ok(!(await page.isHidden('#bp-savanna-la-mar')) && await page.getAttribute('#branch-finder', 'data-on') === 'bt-savanna-la-mar', 'branch tabs switch the card and the map pin');
  await page.locator('[data-pin="kingston"]').scrollIntoViewIfNeeded(); await page.locator('[data-pin="kingston"] .pin__hit').click({ force: true });
  ok(await page.getAttribute('#bt-molynes-road', 'aria-selected') === 'true', 'tapping a map pin selects that branch');
  // lightbox
  await page.locator('.g-item').first().scrollIntoViewIfNeeded(); await page.locator('.g-item').first().click(); await page.waitForTimeout(300);
  ok(await page.locator('#lightbox.is-open').count() === 1, 'lightbox opens from a gallery tile');
  const c1 = await page.textContent('.lb__count'); await page.keyboard.press('ArrowRight'); const c2 = await page.textContent('.lb__count');
  ok(c1.startsWith('1 /') && c2.startsWith('2 /'), `→ moves to the next image (${c1} → ${c2})`);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  ok((await page.textContent('.lb__count')).startsWith('14 /'), '← wraps to the last image');
  await page.keyboard.press('Escape');
  ok(await page.locator('#lightbox.is-open').count() === 0 && await page.evaluate(() => document.activeElement.classList.contains('g-item')), 'Esc closes the lightbox and focus returns to the tile');
  // floating action button
  await page.evaluate(() => scrollTo(0, 2000)); await page.waitForTimeout(600);
  ok(await page.locator('.fab.is-visible').count() === 1, 'floating WhatsApp button appears after the hero on phones');
  // logo goes back to the top on the home page
  await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => scrollTo(0, 3000)); await page.waitForTimeout(400);
  await page.click('.nav .brand'); await page.waitForTimeout(1800);
  ok(await page.evaluate(() => scrollY) < 5 && page.url().endsWith('/'), 'clicking the logo on the home page glides back to the top');
  const credit = await page.$eval('.credit', a => [a.getAttribute('href'), a.getAttribute('target'), a.textContent.trim()]);
  ok(credit[0] === 'https://stevenscalesolutions.com' && credit[1] === '_blank' && credit[2] === 'Website by stevenscalesolutions.com', 'footer credit reads and links to stevenscalesolutions.com');
  await page.setViewportSize({ width: 390, height: 844 });
  // links
  const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  ok(links.filter(h => h.startsWith('tel:')).every(h => /^tel:\+1876\d{7}$/.test(h)), 'every tel: link is E.164');
  ok(links.filter(h => h.includes('google.com/maps')).every(h => h.startsWith('https://www.google.com/maps/dir/?api=1&destination=')), 'directions links are well formed');
  // open-now logic with confirmed hours (simulated): 24/7 -> open, empty -> closed
  ok(await page.evaluate(() => openNow({ mon: [['00:00', '24:00']], tue: [['00:00', '24:00']], wed: [['00:00', '24:00']], thu: [['00:00', '24:00']], fri: [['00:00', '24:00']], sat: [['00:00', '24:00']], sun: [['00:00', '24:00']] }, 'America/Jamaica')), 'openNow() is true inside opening hours');
  ok(!(await page.evaluate(() => openNow({}, 'America/Jamaica'))), 'openNow() is false with no hours');
  ok((await page.evaluate(() => hoursHTML({ hours: { mon: [['08:30', '17:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } }))).includes('8:30 AM – 5:00 PM'), 'confirmed hours render as a table');
  // inner-page forms + filter
  await page.goto(base + 'tyres.html', { waitUntil: 'networkidle' }); await page.evaluate(() => scrollTo(0, 1500));
  await page.click('.nav .burger').catch(() => {}); await page.waitForTimeout(400);
  await Promise.all([page.waitForNavigation(), page.click('#drawer a[href="index.html"]')]); await page.waitForTimeout(500);
  ok(page.url().endsWith('index.html') && await page.evaluate(() => scrollY) === 0, 'Home on an inner page opens the home page at the top');
  await page.goto(base + 'locations.html', { waitUntil: 'networkidle' });
  await page.click('#branch-filter .chip[data-kind="wholesale"]');
  ok((await page.$$eval('#branch-grid > li:not([hidden])', l => l.length)) === 2, 'locations filter shows the 2 wholesale branches');
  await page.goto(base + 'wholesale.html', { waitUntil: 'networkidle' });
  await page.fill('#w-name', 'Test'); await page.fill('#w-company', 'Test Co'); await page.fill('#w-phone', '876-000-0000');
  const href = await page.evaluate(() => new Promise(res => {
    const f = document.querySelector('form[data-mailto]');
    f.addEventListener('submit', () => setTimeout(() => res(document.querySelector('.form__status').textContent), 50)); f.requestSubmit();
  }));
  ok(/Nothing is sent until you press Send/.test(href), 'wholesale form hands over to the email app with an honest status');
  ok(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  await ctx.close();

  // ---------- opening intro ----------
  for (const [w, h, name] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage();
    const t0 = Date.now(); await p.goto(base);
    ok(await p.evaluate(() => document.documentElement.classList.contains('opener-on')), `[${name}] intro starts on a fresh visit`);
    await p.waitForTimeout(1500 - (Date.now() - t0)); await p.screenshot({ path: path.join(out, `intro-${name}-1.5s.png`) });
    ok(await p.locator('.opener.is-playing').count() === 1, `[${name}] intro video is playing at 1.5 s`);
    ok(await p.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'), `[${name}] page cannot scroll during the intro`);
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.activeElement.hasAttribute('data-opener-skip')), `[${name}] "Skip intro" is the first Tab stop`);
    await p.waitForTimeout(4800 - (Date.now() - t0)); await p.screenshot({ path: path.join(out, `intro-${name}-4.8s.png`) });
    ok(await p.locator('.opener.is-logo').count() === 1, `[${name}] logo is showing at 4.8 s`);
    await p.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 9000 });
    const t = (Date.now() - t0) / 1000;
    ok(t >= 4 && t <= 8, `[${name}] site fully in at ${t.toFixed(1)} s (4–8 s)`);
    await p.waitForTimeout(Math.max(0, 8000 - (Date.now() - t0))); await p.screenshot({ path: path.join(out, `intro-${name}-8s.png`) });
    await p.reload();
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))), `[${name}] no intro on reload in the same visit`);
    await p.goto(base + 'tyres.html');
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))), `[${name}] no intro on another page in the same visit`);
    await c.close();
  }
  for (const [label, key] of [['Skip button', 'skip'], ['Esc key', 'esc']]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
    await p.goto(base); await p.waitForTimeout(900); const t0 = Date.now();
    if (key === 'skip') await p.click('[data-opener-skip]'); else await p.keyboard.press('Escape');
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))), `${label} reveals the site at once`);
    await p.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 3000 });
    ok(Date.now() - t0 < 1600, `${label}: overlay gone in ${Date.now() - t0} ms`); await c.close();
  }
  { const c = await browser.newContext({ reducedMotion: 'reduce' }); const p = await c.newPage(); await p.goto(base);
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('opener-on'))), 'no intro with reduced motion'); await c.close(); }
  { const c = await browser.newContext({ javaScriptEnabled: false }); const p = await c.newPage(); await p.goto(base);
    ok(!(await p.isVisible('#opener')), 'no intro without JavaScript');
    ok(await p.isVisible('#hero-title'), 'page content shows without JavaScript'); await c.close(); }
  { const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
    await p.route(/intro/, r => r.abort()); const t0 = Date.now(); await p.goto(base);
    await p.waitForFunction(() => !document.documentElement.classList.contains('opener-on'), null, { timeout: 6000 });
    const t = (Date.now() - t0) / 1000; ok(t < 2.9, `intro video blocked: site appears at ${t.toFixed(1)} s`); await c.close(); }

  await browser.close(); server.close();
  console.log(fails ? `${fails} check(s) failed` : 'Interactions: all checks passed'); process.exit(fails ? 1 : 0);
})();
