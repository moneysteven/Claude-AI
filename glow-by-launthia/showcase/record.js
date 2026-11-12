/* Record a showcase film to an MP4 (video only), frame-accurately, even on a slow machine.

   node showcase/record.js <film.html> <out.mp4> <width> <height> [slow=10]

   Every clock in the page runs `slow` times slower (scripts, rAF, timers, CSS/WAAPI animations and the
   video clips), the browser's frames are streamed with their timestamps, and each one is mapped back to
   film time. A steady 30 fps sequence is piped straight into ffmpeg, so nothing piles up on disk.
   Needs Playwright with Chromium and ffmpeg on PATH. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const [,, film, out, W = '1080', H = '1920', SLOWARG = '10'] = process.argv;
const SLOW = Number(SLOWARG), FPS = 30, DUR = Number(process.env.FILM_SECONDS || 60);
const THREE = process.env.THREE_JS; /* optional local three.min.js when cdnjs is unreachable */

const timeScale = `(() => {
  const SLOW = ${SLOW};
  const rNow = performance.now.bind(performance), t0 = rNow(), d0 = Date.now();
  performance.now = () => t0 + (rNow() - t0) / SLOW;
  Date.now = () => d0 + (rNow() - t0) / SLOW;
  const rRAF = window.requestAnimationFrame.bind(window);
  window.__raf = 0;
  /* frame timestamps come from the one slowed clock (the browser's own animation clock is slowed separately over CDP) */
  window.requestAnimationFrame = cb => rRAF(() => { window.__raf++; cb(performance.now()); });
  const rST = window.setTimeout.bind(window), rSI = window.setInterval.bind(window);
  window.setTimeout = (fn, ms, ...a) => rST(fn, (Number(ms) || 0) * SLOW, ...a);
  window.setInterval = (fn, ms, ...a) => rSI(fn, (Number(ms) || 0) * SLOW, ...a);
  const pr = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
  const touched = new WeakSet();
  Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', { configurable: true,
    get() { return pr.get.call(this) * SLOW; },
    /* clamp to Chrome's slowest rate (1/16): a slow-motion moment (0.6x) slowed 10x would throw, and that error
       would stop the site's frame loop, freezing every WebGL effect after it */
    set(v) { touched.add(this); pr.set.call(this, Math.max(0.0625, v / SLOW)); } });
  const slowMedia = e => { const m = e.target; if (m instanceof HTMLMediaElement && !touched.has(m)) { touched.add(m); pr.set.call(m, 1 / SLOW); } };
  ['loadstart', 'play', 'playing'].forEach(t => document.addEventListener(t, slowMedia, true));
  if (window.top === window) window.__glowCapture = true;
  /* report any WebGL context the browser drops, so a bad take is caught in the log */
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, o) {
    const c = gc.call(this, t, o);
    if (c && /webgl/.test(t) && !this.__watched) { this.__watched = 1; this.addEventListener('webglcontextlost', () => console.warn('GLOW_CTX_LOST ' + (this.id || this.className || 'canvas'))); }
    return c;
  };
})();`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (/GLOW_CTX_LOST|Context Lost/.test(m.text())) console.error('webgl:', m.text()); });
  if (THREE) await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: THREE, contentType: 'application/javascript' }));
  await page.addInitScript(timeScale);
  const cdp = await context.newCDPSession(page);

  /* the encoder runs at low priority so it never starves the page's renderer */
  const ff = spawn('nice', ['-n', '15', 'ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-movflags', '+faststart', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });

  await page.goto('file://' + path.resolve(film), { waitUntil: 'commit' });
  /* CSS + WAAPI animations follow the same slowed clock */
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
  console.log('page loaded; waiting for the film to start');
  await page.waitForFunction(() => window.__glowFilm && window.__glowFilm.playing(), null, { timeout: 600000 });
  /* anchor: real wall time at which film time 0 occurred */
  const a0 = Date.now() / 1000, ft0 = await page.evaluate(() => window.__glowFilm.time()), a1 = Date.now() / 1000;
  let zero = (a0 + a1) / 2 - ft0 * SLOW;
  const samples = [];

  let last = null, nextOut = 0, frames = 0, done = false;
  const total = DUR * FPS;
  const write = buf => new Promise(res => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', res); else res(); });
  let chain = Promise.resolve();
  cdp.on('Page.screencastFrame', ev => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    const buf = Buffer.from(ev.data, 'base64'), ft = (ev.metadata.timestamp - zero) / SLOW;
    frames++;
    chain = chain.then(async () => {
      if (done) return;
      if (ft < 0) { last = buf; return; }
      while (nextOut < total && nextOut / FPS <= ft) { await write(last || buf); nextOut++; }
      last = buf;
    });
  });
  console.log('film started; recording');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: +W, maxHeight: +H, everyNthFrame: 1 });

  /* keep the time map honest (and report progress) */
  while (true) {
    await new Promise(r => setTimeout(r, 4000));
    const b0 = Date.now() / 1000, t = await page.evaluate(() => window.__glowFilm.time()), b1 = Date.now() / 1000;
    samples.push([(b0 + b1) / 2, t]);
    const est = ((b0 + b1) / 2 - zero) / SLOW;
    if (Math.abs(est - t) > 0.05) zero = (b0 + b1) / 2 - t * SLOW; /* re-anchor if the film clock drifted */
    process.stdout.write(`film ${t.toFixed(2)}s  frames ${frames}  written ${nextOut}/${total}\n`);
    if (t >= DUR - 0.01) break;
  }
  await new Promise(r => setTimeout(r, 1500));
  await cdp.send('Page.stopScreencast');
  await chain;
  done = true;
  while (nextOut < total && last) { await write(last); nextOut++; }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  const drift = samples.map(([w, t]) => (((w - zero) / SLOW) - t).toFixed(3));
  console.log('drift samples (s):', drift.slice(-5).join(' '));
  console.log(`wrote ${out}: ${nextOut} frames from ${frames} captured`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
