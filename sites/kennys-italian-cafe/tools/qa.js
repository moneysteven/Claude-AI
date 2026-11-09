// usage: node tools/qa.js <site_dir> <out_dir> [page.html ...]
// Serves the site, scrolls every page at 375, 768 and 1440 px, saves screenshots, and fails on console or JS errors,
// missing files, broken images, images without alt, broken #anchors, links to missing pages, or horizontal overflow.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
const pages = process.argv.slice(4).length ? process.argv.slice(4) : fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(); const problems = [];
  for (const file of pages) {
    for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
      const tag = `[${file} ${w}]`;
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      // the opening intro has its own checks; here we test the page itself, so mark it as already seen
      await page.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });
      // external hosts (fonts, maps) are not part of the test: block them so the run is deterministic
      await page.route(u => !u.href.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com/.test(u.host), r => r.abort());
      page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) problems.push(`${tag} console: ${m.text()}`); });
      page.on('pageerror', e => problems.push(`${tag} js error: ${e.message}`));
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`${tag} ${r.status()} ${r.url().replace(base, '/')}`); });
      await page.goto(base + file, { waitUntil: 'load' });
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += h / 2) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(90); }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500);
      // make sure every lazy image has loaded before checking
      await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.loading === 'lazy' ? (i.loading = 'eager', i.decode().catch(() => {})) : i.decode().catch(() => {}))); });
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 1) problems.push(`${tag} horizontal overflow: page is ${sw}px wide`);
      (await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.getAttribute('src'))))
        .forEach(s => problems.push(`${tag} broken image: ${s}`));
      const noAlt = await page.evaluate(() => [...document.images].filter(i => !i.hasAttribute('alt')).length);
      if (noAlt) problems.push(`${tag} ${noAlt} image(s) without alt`);
      (await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h))))
        .forEach(a => problems.push(`${tag} link to missing section ${a}`));
      (await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^[\w-]+\.html/.test(h)).map(h => h.split(/[?#]/)[0])))
        .forEach(p => { if (!fs.existsSync(path.join(root, p))) problems.push(`${tag} link to missing page ${p}`); });
      const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
      if (h1 !== 1) problems.push(`${tag} ${h1} h1 elements (want 1)`);
      const small = await page.evaluate(() => [...document.querySelectorAll('a[href],button')].filter(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return r.width > 0 && cs.visibility !== 'hidden' && !el.closest('[inert],[aria-hidden="true"]') && !el.closest('p,dd,address,li.item') && (r.height < 40 || r.width < 40);
      }).map(el => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
      if (w === 375) small.forEach(s => problems.push(`${tag} small tap target: ${s}`));
      const name = file.replace('.html', '');
      if (w !== 768) await page.screenshot({ path: path.join(out, `${name}-full-${w}.png`), fullPage: true });
      await page.screenshot({ path: path.join(out, `${name}-top-${w}.png`) });
      await page.close();
    }
  }
  await browser.close(); server.close();
  const uniq = [...new Set(problems)];
  fs.writeFileSync(path.join(out, 'report.txt'), uniq.join('\n') || 'No problems found');
  console.log(uniq.length ? uniq.join('\n') : 'QA: no problems found'); process.exit(uniq.length ? 1 : 0);
})();
