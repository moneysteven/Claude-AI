// usage: node tools/render_intro.js            (run from the site folder; needs Playwright, ffmpeg and _source/)
// Renders tools/intro/scene.html frame by frame at 120 fps, then blends every 4 frames into one (real motion blur)
// and encodes 30 fps videos:  assets/video/intro.mp4/.webm (1280x720)  and  intro-mobile.mp4/.webm (540x960).
// Options: --only=intro|intro-mobile   --keep (keep the PNG/JPG frames in _frames/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = process.cwd(), DUR = 4.4, FPS = 120, BLEND = 4;
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7), keep = process.argv.includes('--keep');
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

(async () => {
  const browser = await chromium.launch();
  const jobs = [['intro', 1280, 720, 1280, 720, 26], ['intro-mobile', 720, 1280, 540, 960, 26]].filter(j => !only || j[0] === only);
  for (const [name, w, h, ow, oh, crf] of jobs) {
    const dir = path.join(root, '_frames', name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/intro/scene.html`);
    await page.evaluate(() => window.ready);
    const n = Math.round(DUR * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => window.render(t), i / FPS);
      fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 92 }));
      if (i % 120 === 0) process.stdout.write(`${name}: frame ${i}/${n}\n`);
    }
    await page.close();
    const mp4 = path.join(root, 'assets/video', name + '.mp4'), webm = mp4.replace('.mp4', '.webm');
    ff(['-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-vf', `tmix=frames=${BLEND},fps=30,scale=${ow}:${oh}:flags=lanczos,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-movflags', '+faststart', mp4]);
    ff(['-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-an', webm]);
    console.log(name, { mp4: (fs.statSync(mp4).size / 1024 | 0) + ' KB', webm: (fs.statSync(webm).size / 1024 | 0) + ' KB' });
    if (!keep) fs.rmSync(dir, { recursive: true, force: true });
  }
  if (!keep) fs.rmSync(path.join(root, '_frames'), { recursive: true, force: true });
  await browser.close(); server.close();
})();
