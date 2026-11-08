// usage: node tools/qa.js <site_dir> <out_dir>
// Serves the site, scrolls every page at 375 / 768 / 1440 px, saves screenshots, and fails on console or JS errors,
// missing files, broken images, images without alt, broken #anchors (same page or other pages) or horizontal overflow.
// Errors from third-party hosts (Google Fonts / Maps, YouTube) are reported separately as "external" and don't fail the run,
// because sandboxed environments often block them.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon','.woff2':'font/woff2','.pdf':'application/pdf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  const size = fs.statSync(f).size, range = req.headers.range, type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
  if (range) {   // videos need byte ranges in Chromium
    const [a, b] = range.replace('bytes=', '').split('-'), s = +a, e = b ? +b : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const PAGES = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(); const problems = [], external = new Set();
  const ids = {};
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
    for (const file of PAGES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const tag = `[${w} ${file}]`;
      // the opening intro has its own checks; here we test the page itself, so mark it as already seen
      await page.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });
      page.on('console', m => { if (m.type() !== 'error') return; const loc = m.location()?.url || '';
        if (loc && !loc.startsWith(base)) external.add(`${m.text()} (${loc.split('?')[0]})`); else if (/ERR_|net::/.test(m.text()) && !loc) external.add(m.text()); else problems.push(`${tag} console: ${m.text()} ${loc}`); });
      page.on('pageerror', e => problems.push(`${tag} js error: ${e.message}`));
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`${tag} ${r.status()} ${r.url().replace(base, '/')}`); });
      page.on('requestfailed', r => { if (r.url().startsWith(base) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) problems.push(`${tag} failed ${r.url().replace(base, '/')}`); });
      await page.goto(base + file, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('load').catch(() => {});
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += h / 2) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(110); }
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 1) problems.push(`${tag} horizontal overflow: page is ${sw}px wide`);
      (await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.currentSrc || i.getAttribute('src'))))
        .forEach(s => problems.push(`${tag} broken image: ${s}`));
      const noAlt = await page.evaluate(() => [...document.images].filter(i => !i.hasAttribute('alt')).length);
      if (noAlt) problems.push(`${tag} ${noAlt} image(s) without alt`);
      (await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h))))
        .forEach(a => problems.push(`${tag} link to missing section ${a}`));
      ids[file] = await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e => e.id));
      const cross = await page.evaluate(() => [...document.querySelectorAll('a[href*=".html"]')].map(a => a.getAttribute('href')).filter(h => !/^https?:/.test(h)));
      cross.forEach(href => { const [f, hash] = href.split('#'); if (!PAGES.includes(f)) problems.push(`${tag} link to missing page ${href}`); else if (hash) (page._x = page._x || []).push([f, hash]); });
      (page._x || []).forEach(([f, hash]) => (globalThis.__cross = globalThis.__cross || []).push([tag, f, hash]));
      const small = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,summary,[role="tab"]')].filter(e => {
        const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return r.width && r.height && s.visibility !== 'hidden' && !e.closest('p,li:not(.drawer__links li),td,small,.info,.footer__bottom,.note,figcaption,.a,.concept') && (r.height < 40 || r.width < 40);
      }).map(e => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)));
      if (w === 375 && small.length) problems.push(`${tag} small tap targets (<40px): ${[...new Set(small)].join(' | ')}`);
      // sections below the fold use content-visibility:auto (rendered as you scroll); force them on for the full-page capture
      await page.addStyleTag({ content: 'main>*{content-visibility:visible!important}' }); await page.waitForTimeout(300);
      const name = file.replace('.html', '');
      await page.screenshot({ path: path.join(out, `full-${name}-${w}.png`), fullPage: true });
      if (file === 'index.html') await page.screenshot({ path: path.join(out, `top-${w}.png`) });
      await page.close();
    }
  }
  // cross-page anchors: menu.html#m-specials is rendered by JS, so check against the ids seen after load
  (globalThis.__cross || []).forEach(([tag, f, hash]) => { if (!ids[f]?.includes(hash)) problems.push(`${tag} link to missing section ${f}#${hash}`); });
  await browser.close(); server.close();
  const uniq = [...new Set(problems)];
  const ext = [...external];
  fs.writeFileSync(path.join(out, 'report.txt'), (uniq.join('\n') || 'No problems found') + (ext.length ? `\n\nExternal (not counted):\n${ext.join('\n')}` : ''));
  if (ext.length) console.log(`(external hosts, not counted: ${ext.length})`);
  console.log(uniq.length ? uniq.join('\n') : 'QA: no problems found'); process.exit(uniq.length ? 1 : 0);
})();
