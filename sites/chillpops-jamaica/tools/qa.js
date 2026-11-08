// usage: node tools/qa.js <site_dir> <out_dir> [page.html ...]   (default: every .html page in the site folder)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
const pages = process.argv.slice(4).length ? process.argv.slice(4) : fs.readdirSync(root).filter(f => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon','.woff2':'font/woff2' };
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
  for (const pg of pages) {
    const tag = pg.replace('.html', '');
    for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      // the opening intro has its own checks; here we test the page itself, so mark it as already seen
      await page.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });
      // third-party map embeds are not ours to test (and are blocked offline)
      await page.route(/google\.com\/maps/, r => r.abort());
      page.on('console', m => { if (m.type() === 'error' && !/google\.com\/maps|ERR_FAILED|net::ERR/.test(m.text())) problems.push(`[${tag} ${w}] console: ${m.text()}`); });
      page.on('pageerror', e => problems.push(`[${tag} ${w}] js error: ${e.message}`));
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`[${tag} ${w}] ${r.status()} ${r.url().replace(base, '/')}`); });
      await page.goto(base + pg, { waitUntil: 'networkidle' });
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += h / 2) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 1) problems.push(`[${tag} ${w}] horizontal overflow: page is ${sw}px wide`);
      (await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'))))
        .forEach(s => problems.push(`[${tag} ${w}] broken image: ${s}`));
      const noAlt = await page.evaluate(() => [...document.images].filter(i => !i.hasAttribute('alt')).length);
      if (noAlt) problems.push(`[${tag} ${w}] ${noAlt} image(s) without alt`);
      (await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h))))
        .forEach(a => problems.push(`[${tag} ${w}] link to missing section ${a}`));
      (await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^[\w-]+\.html$/.test(h))))
        .forEach(h => { if (!fs.existsSync(path.join(root, h))) problems.push(`[${tag} ${w}] link to missing page ${h}`); });
      await page.screenshot({ path: path.join(out, `${tag}-full-${w}.png`), fullPage: true });
      await page.screenshot({ path: path.join(out, `${tag}-top-${w}.png`) });
      await page.close();
    }
  }
  await browser.close(); server.close();
  const uniq = [...new Set(problems)];
  fs.writeFileSync(path.join(out, 'report.txt'), uniq.join('\n') || 'No problems found');
  console.log(uniq.length ? uniq.join('\n') : 'QA: no problems found'); process.exit(uniq.length ? 1 : 0);
})();
