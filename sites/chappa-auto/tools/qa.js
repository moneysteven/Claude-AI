// usage: node tools/qa.js <site_dir> <out_dir>   (checks every .html page in the site folder)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [root, out] = [path.resolve(process.argv[2] || '.'), path.resolve(process.argv[3] || 'qa')];
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
  const pages = ['index.html', ...fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html').sort()];
  for (const pg of pages) for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
    const tag = pg === 'index.html' ? '' : pg.replace('.html', '') + '-';
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    // the opening intro has its own checks (below); here we test the page itself, so mark it as already seen
    await page.addInitScript(() => { try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {} });
    page.on('console', m => { if (m.type() === 'error') problems.push(`[${pg} ${w}] console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`[${pg} ${w}] js error: ${e.message}`));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`[${pg} ${w}] ${r.status()} ${r.url().replace(base, '/')}`); });
    await page.goto(base + (pg === 'index.html' ? '' : pg), { waitUntil: 'networkidle' });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += h / 2) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w + 1) problems.push(`[${pg} ${w}] horizontal overflow: page is ${sw}px wide`);
    (await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'))))
      .forEach(s => problems.push(`[${pg} ${w}] broken image: ${s}`));
    const noAlt = await page.evaluate(() => [...document.images].filter(i => !i.hasAttribute('alt')).length);
    if (noAlt) problems.push(`[${pg} ${w}] ${noAlt} image(s) without alt`);
    (await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h))))
      .forEach(a => problems.push(`[${pg} ${w}] link to missing section ${a}`));
    await page.screenshot({ path: path.join(out, `full-${tag}${w}.png`), fullPage: true });
    await page.screenshot({ path: path.join(out, `top-${tag}${w}.png`) });
    await page.close();
  }
  await browser.close(); server.close();
  const uniq = [...new Set(problems)];
  fs.writeFileSync(path.join(out, 'report.txt'), uniq.join('\n') || 'No problems found');
  console.log(uniq.length ? uniq.join('\n') : 'QA: no problems found'); process.exit(uniq.length ? 1 : 0);
})();
