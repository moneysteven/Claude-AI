// usage: node tools/record_walkthrough.js <desktop|phone> <out.mp4>   (run from the site folder; needs ffmpeg)
// Records the site from the opening intro to the footer, section by section, as a promo/walkthrough video.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const mode = process.argv[2] || 'desktop', outFile = path.resolve(process.argv[3] || `walkthrough-${mode}.mp4`);
const root = process.cwd(), tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rec-'));
const types = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f), type = types[path.extname(f).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const V = mode === 'phone' ? { vw: 414, vh: 736, out: { width: 1080, height: 1920 } } : { vw: 1920, vh: 1080, out: { width: 1920, height: 1080 } };

(async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // desktop: Playwright's recorder. phone: Chrome's screencast at full device resolution (the recorder only captures CSS pixels)
  const phone = mode === 'phone';
  const ctx = await browser.newContext({ viewport: { width: V.vw, height: V.vh }, deviceScaleFactor: V.out.width / V.vw, isMobile: phone, hasTouch: phone,
    ...(phone ? {} : { recordVideo: { dir: tmp, size: V.out } }) });
  // the preview frame can't show Google Maps; drop the iframe so the map card shows instead
  await ctx.route(/google\.com\/maps/, r => r.abort());
  const page = await ctx.newPage(); const t0 = Date.now();
  const frames = []; let cdp = null;
  if (phone) {
    cdp = await ctx.newCDPSession(page);
    cdp.on('Page.screencastFrame', f => { const n = frames.length; const file = path.join(tmp, `f${String(n).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ file, t: f.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: V.out.width, maxHeight: V.out.height, everyNthFrame: 1 });
  }
  const wait = ms => page.waitForTimeout(ms);
  const glide = (y, ms = 1500) => page.evaluate(([y, ms]) => new Promise(done => {
    const s = scrollY, d = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)) - s, t = performance.now();
    const e = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    (function f(n) { const k = Math.min(1, (n - t) / ms); scrollTo(0, s + d * e(k)); k < 1 ? requestAnimationFrame(f) : done(); })(t);
  }), [y, ms]);
  const top = sel => page.evaluate(sel => { const el = document.querySelector(sel); const nav = document.querySelector('.nav').offsetHeight;
    return el.getBoundingClientRect().top + scrollY - (el.matches('.marquee, .promo, .footer') ? 0 : nav - 4); }, sel);
  const visit = async (sel, hold = 2200, ms = 1500) => { await glide(await top(sel), ms); await wait(hold); };
  const through = async (sel, ms) => { // slow scroll through a tall section
    const [a, h] = await page.evaluate(sel => { const el = document.querySelector(sel); return [el.getBoundingClientRect().top + scrollY, el.offsetHeight]; }, sel);
    const nav = await page.evaluate(() => document.querySelector('.nav').offsetHeight);
    await glide(a - nav + 4, 1400); await wait(1400); await glide(a + h - V.vh, ms); await wait(1200); };

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const tStart = (Date.now() - t0) / 1000;
  await page.evaluate(() => document.querySelectorAll('.map iframe').forEach(f => f.remove()));
  await wait(7200);                                  // opening intro → logo → site forms in
  await wait(5600);                                  // hero: the walk-in from the storefront through the doors
  await visit('#welcome', 2600);
  await visit('#christmas', 2800).catch(() => {});   // only while the Christmas extras are on
  await visit('#favorites', 1000);
  const card = await page.$('.card:nth-child(2)'); if (card && mode !== 'phone') { const b = await card.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); }
  await wait(1800); await page.mouse.move(5, 5);
  if (mode === 'phone') await through('#favorites', 5200);
  await through('#sealection', mode === 'phone' ? 9000 : 3200);
  await visit('.promo', 2400);
  await (mode === 'phone' ? through('#deals', 2600) : visit('#deals', 2600));
  await visit('#store', 900);
  await page.click('#menu-q'); await page.keyboard.type('snapper', { delay: 140 }); await wait(1500);
  await page.fill('#menu-q', ''); await wait(300);
  await page.click('#menu-chips [data-cat="Pork"]'); await wait(1600);
  await page.click('#menu-chips [data-cat="All"]'); await wait(400);
  await visit('.spotlight', 1500);
  if (mode === 'phone') await glide(await top('.spotlight') + 120, 600);
  await page.click('#tab-cakes'); await wait(1800); await page.click('#tab-market'); await wait(1800); await page.click('#tab-deli'); await wait(800);
  await through('#gallery', mode === 'phone' ? 9000 : 4200);
  await visit('#gallery', 600, 900);
  await page.click('.tile >> nth=0'); await wait(1600); await page.keyboard.press('ArrowRight'); await wait(1600);
  await page.keyboard.press('ArrowRight'); await wait(1400); await page.keyboard.press('Escape'); await wait(500);
  await (mode === 'phone' ? through('#visit', 3500) : visit('#visit', 3000));
  await visit('.footer', 1200, 1400);
  await glide(await page.evaluate(() => document.documentElement.scrollHeight), 1800); await wait(2200);
  await page.click('.footer__top [data-action]'); await wait(3800);   // finish on the order options
  if (phone) {
    await cdp.send('Page.stopScreencast'); await ctx.close(); await browser.close(); server.close();
    // frames arrive only when the screen changes: give each one its real on-screen duration
    const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1] ? frames[i + 1].t : f.t + 0.5) - f.t).toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
    fs.writeFileSync(path.join(tmp, 'list.txt'), list);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-ss', (tStart + 0.3).toFixed(2),
      '-vf', `scale=${V.out.width}:${V.out.height}:force_original_aspect_ratio=decrease,pad=${V.out.width}:${V.out.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', '-an', outFile]);
    console.log(outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB', frames.length + ' frames', frames[0] && (frames[0].file));
    return;
  }
  const video = page.video(); await ctx.close(); const src = await video.path();
  await browser.close(); server.close();
  // trim the blank start, re-encode to H.264 MP4
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', (tStart + 0.45).toFixed(2), '-i', src, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '20', '-movflags', '+faststart', '-an', outFile]);
  console.log(outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB');
})();
