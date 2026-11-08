// Records a captioned walkthrough of the Chappa Auto site (1280x720) via the Chrome screencast stream.
// usage: node tools/walkthrough/record.js . _walk   then:
//   ffmpeg -f concat -safe 0 -i _walk/list.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 21 -movflags +faststart -an walkthrough.mp4
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const site = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]), here = __dirname;
fs.rmSync(path.join(out, 'frames'), { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/__') ? path.join(here, p.slice(3)) : path.join(site, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);

// caption card + visible cursor, injected into every top-level page
const OVERLAY = () => {
  if (window.top !== window) return;
  addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const st = document.createElement('style');
    st.textContent = `
    #wt-cap{position:fixed;left:34px;bottom:30px;z-index:2147483000;max-width:540px;padding:18px 22px 18px 24px;border-radius:16px;
      background:rgba(6,8,22,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.12);
      box-shadow:0 20px 50px rgba(0,0,0,.55);color:#fff;font-family:Inter,system-ui,sans-serif;opacity:0;transform:translateY(16px);
      transition:opacity .45s cubic-bezier(.2,.7,.2,1),transform .45s cubic-bezier(.2,.7,.2,1)}
    #wt-cap::before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:4px;border-radius:0 4px 4px 0;background:linear-gradient(#e8382f,#fcd21a)}
    #wt-cap.on{opacity:1;transform:none}
    #wt-cap.top{bottom:auto;top:28px}
    #wt-cap .n{font:800 11px/1 Inter,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#fcd21a}
    #wt-cap .t{margin:8px 0 6px;font:700 30px/1 Oswald,Impact,sans-serif;text-transform:uppercase;letter-spacing:.01em}
    #wt-cap .x{font:500 15.5px/1.5 Inter,sans-serif;color:#dfe2ee}
    #wt-cur{position:fixed;left:0;top:0;z-index:2147483001;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;pointer-events:none;
      background:rgba(255,255,255,.92);border:2px solid #0b0d1c;box-shadow:0 0 0 3px rgba(232,56,47,.55),0 6px 16px rgba(0,0,0,.5);opacity:0;transition:opacity .3s}
    .wt-ring{position:fixed;z-index:2147483000;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:3px solid #fcd21a;pointer-events:none;
      animation:wtring .6s cubic-bezier(.2,.7,.2,1) forwards}
    @keyframes wtring{to{transform:scale(3.2);opacity:0}}`;
    document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'wt-cap'; document.body.appendChild(cap);
    const cur = document.createElement('div'); cur.id = 'wt-cur'; document.body.appendChild(cur);
    window.__cap = (n, t, x, top) => {
      cap.classList.remove('on');
      setTimeout(() => { cap.classList.toggle('top', !!top); cap.innerHTML = `<div class="n">${n}</div><div class="t">${t}</div><div class="x">${x}</div>`; cap.classList.add('on'); }, cap.innerHTML ? 260 : 0);
    };
    window.__capOff = () => cap.classList.remove('on');
    window.__cursor = (x, y) => { cur.style.opacity = 1; cur.style.transform = `translate(${x}px,${y}px)`; };
    window.__tap = (x, y) => { const r = document.createElement('div'); r.className = 'wt-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); };
    addEventListener('mousemove', e => window.__cursor(e.clientX, e.clientY), true);
    addEventListener('mousedown', e => window.__tap(e.clientX, e.clientY), true);
  });
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const cdp = await ctx.newCDPSession(page); const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(out, 'frames', String(n++).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push([file, f.metadata.timestamp]);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });

  const W = ms => page.waitForTimeout(ms);
  let mx = 640, my = 400;
  const glide = async (x, y, ms = 700) => { const s = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my;
    for (let i = 1; i <= s; i++) { const k = i / s, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await W(16); }
    mx = x; my = y; };
  const box = async sel => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const hover = async (sel, ms = 700) => { const [x, y] = await box(sel); await glide(x, y, ms); };
  const click = async (sel, ms = 700) => { await hover(sel, ms); await W(150); await page.mouse.down(); await W(60); await page.mouse.up(); };
  const scroll = (target, offset = 70, dur = 1400) => page.evaluate(({ target, offset, dur }) => new Promise(res => {
    const el = typeof target === 'number' ? null : document.querySelector(target);
    const y0 = scrollY, y1 = el ? el.getBoundingClientRect().top + scrollY - offset : target, t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    (function step(now) { const k = Math.min(1, (now - t0) / dur); scrollTo(0, y0 + (y1 - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : res(); })(t0);
  }), { target, offset, dur });
  const cap = (n, t, x, top) => page.evaluate(([n, t, x, top]) => window.__cap(n, t, x, top), [n, t, x, top]);
  const TOT = 18, c = i => `${String(i).padStart(2, '0')} / ${TOT}`;
  const card = async (t1, t2, k, s, ms) => { await page.goto(base + '__card.html?' + new URLSearchParams({ t1, t2, k, s }), { waitUntil: 'networkidle' }); await W(ms); };

  // ---------------- title ----------------
  await card('Chappa Auto', 'Website walkthrough', 'How the site works · every feature', 'A seven-page redesign concept: auto parts, tyres, Shell lubricants, wholesale, locations and about.', 4200);

  // 1 opening film
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => window.__cap);
  await cap(c(1), 'Opening film', 'Plays once per visit: brakes, tyres, Shell oils, the Kingston store, then the logo. Skip intro or Esc ends it at once.', true);
  await page.waitForFunction(() => !document.getElementById('opener'), null, { timeout: 12000 }); await W(600);

  // 2 hero
  await cap(c(2), 'Hero', 'The Molynes Road storefront in motion, with passing car lights. Get a quote is always one click away, top right.');
  await hover('.hero .btn--solid', 900); await W(1600); await hover('.nav__links a[href="tyres.html"]', 700); await W(900);

  // 3 gauges
  await scroll('.dash', 140); await cap(c(3), 'Dashboard gauges', 'Needles sweep and numbers count up: 20+ years, 5 branches, 4 of Jamaica’s 14 parishes, 5 brands.'); await W(3200);

  // 4 welcome + makes
  await scroll('#welcome', 70); await cap(c(4), 'Welcome', 'The story in plain words, written only from the owner’s published facts.'); await W(2400);
  await scroll('.makes-strip', 260, 1200); await cap(c(4), 'Tyre-tread band & makes', 'A rolling tread band, the red marquee and the vehicle makes customers ask about.'); await W(3000);

  // 5 product cards
  await scroll('#featured .cards', 110); await cap(c(5), 'Product cards', 'Cards lean toward the mouse with a moving light. Tyres roll. “Ask” opens a quote for that product.');
  await W(900); await hover('.cards .card:nth-child(1)', 800); await W(700); await glide(mx + 120, my - 60, 600); await hover('.cards .card:nth-child(3)', 900); await W(1000);
  await scroll('.cards .card:nth-child(4)', 120, 900); await hover('.cards .card:nth-child(4)', 700); await W(1200);

  // 6 search the range
  await scroll('.cat-tools', 190); await cap(c(6), 'Search the range', 'Type or pick a department to filter. No prices are online, so every line has “Ask”.'); await W(800);
  await click('#cat-q'); await page.keyboard.type('helix', { delay: 160 }); await W(1500);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await W(500);
  await click('#cat-chips .chip[data-cat="Tyres"]'); await W(1500); await click('#cat-chips .chip[data-cat="All"]'); await W(700);

  // 7 spotlight
  await scroll('.spot__grid', 100); await cap(c(7), 'Pick your fit', 'Brakes, tyres or oils: the picture whips across and the story changes. Arrow keys work too.'); await W(1000);
  await click('#tab-tyres'); await W(1700); await click('#tab-oils'); await W(1700);

  // 8 gallery
  await scroll('.masonry', 100); await cap(c(8), 'Gallery', 'Click any picture for the full-screen viewer, then use the arrows (or swipe on a phone). Esc closes it.'); await W(900);
  await click('.g-item:nth-child(1)'); await W(1300); await page.keyboard.press('ArrowRight'); await W(1100); await page.keyboard.press('ArrowRight'); await W(1100); await page.keyboard.press('Escape'); await W(700);

  // 9 branch finder
  await scroll('#branch-finder', 96); await cap(c(9), 'Branch finder', 'Five branches with WhatsApp, call and directions. Tap a tab or a town on the map. Hours are flagged until the owner confirms them.');
  await W(1800); await click('#bt-lucea'); await W(1600); await click('#bt-river-bay-road'); await W(1400); await click('[data-pin="kingston"] .pin__dot', 900); await W(1400);
  await hover('#bp-molynes-road .btn--solid', 700); await W(900);

  // 10 quote pop-up
  await cap(c(10), 'Quote pop-up', 'Every button opens it: pick a branch, then WhatsApp, call or email a ready-made quote request.');
  await click('.nav__cta', 900); await W(1500); await click('#action-chips .chip:nth-child(4)'); await W(1300); await hover('#action-opts li:first-child .opt', 600); await W(1000);
  await hover('#action-opts li:last-child .opt', 600); await W(900); await page.keyboard.press('Escape'); await W(600);

  // 11 footer
  await scroll(99999, 0, 1800); await cap(c(11), 'Footer', 'Every branch number on every page, socials, the brand notice and the credit link to stevenscalesolutions.com.'); await W(2400);
  await hover('.credit', 800); await W(1000);
  await cap(c(11), 'Back to the top', 'Click the Chappa Auto logo, top left, to glide straight back to the top.'); await W(900);
  await click('.nav .brand', 900); await W(2600);

  // 12-17 inner pages
  const tour = async (i, pg, t, x, act) => {
    await page.goto(base + pg, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__cap); await cap(c(i), t, x); await W(1800);
    if (act) await act(); await scroll(Math.round(await page.evaluate(() => innerHeight * .9)), 0, 1600); await W(1300);
    await scroll(Math.round(await page.evaluate(() => innerHeight * 1.9)), 0, 1600); await W(1300);
  };
  await tour(12, 'auto-parts.html', 'Auto Parts', 'BMK disc pads and brake shoes, Power King (details to confirm), parts for popular makes and how to get a quote.');
  await tour(13, 'tyres.html', 'Tyres', 'iLink and Aoteli, plus a guide to reading the size on your tyre’s sidewall. No fake stock lists.');
  await tour(14, 'shell-lubricants.html', 'Shell Lubricants', 'The Shell story since 2019, the Helix, Rimula and Omala ranges, and Shell’s own LubeMatch tool.', () => hover('.hero .btn--outline', 700));
  await tour(15, 'wholesale.html', 'Wholesale', 'Benefits, sectors, the two wholesale branches and an application form that opens the email app.');
  await page.goto(base + 'locations.html', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__cap);
  await cap(c(16), 'Locations', 'All five branches exactly as published, the town map, and a retail / wholesale filter.'); await W(1600);
  await scroll('.mapcard', 90); await W(2400); await scroll('#branch-filter', 120, 1000); await click('#branch-filter .chip[data-kind="wholesale"]'); await W(1500);
  await click('#branch-filter .chip[data-kind="all"]'); await W(800);
  await tour(17, 'about.html', 'About', 'Founded in 2003 by Ms. Hazel Tomlinson, the gauges, the timeline and the brands Chappa Auto distributes.');

  // 18 phone
  await page.goto(base + '__device.html', { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__cap);
  const fr = page.frameLocator('#f'); await W(1200);
  await cap(c(18), 'On a phone', 'Built for one thumb: the menu drawer, a floating WhatsApp button and the same quote pop-up.'); await W(1600);
  const tapIn = async sel => { const b = await fr.locator(sel).first().boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2, 700); await W(120);
    await page.mouse.down(); await W(60); await page.mouse.up(); };
  await tapIn('.burger'); await W(1700); await tapIn('.drawer__close'); await W(900);
  await page.frame({ url: /index\.html$/ }).evaluate(() => new Promise(r => { const y0 = scrollY, t0 = performance.now();
    (function s(n) { const k = Math.min(1, (n - t0) / 1800); scrollTo(0, y0 + 1500 * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)); k < 1 ? requestAnimationFrame(s) : r(); })(t0); }));
  await W(1300); await tapIn('.fab'); await W(1900); await page.frame({ url: /index\.html$/ }).evaluate(() => document.querySelector('.modal__close').click()); await W(900);

  // end card
  await card('Private preview', 'Ready to share', 'Next: the owner confirms the details', 'Opening hours, the sixth location, plaza spelling, phone numbers and photo permissions. Then it can go live.', 5200);

  await cdp.send('Page.stopScreencast'); await W(200);
  // build a constant-frame-rate video from the timestamped frames
  const lines = []; for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1][1] - frames[i][1] : 1; lines.push(`file '${frames[i][0]}'`, `duration ${Math.max(0.001, d).toFixed(4)}`); }
  lines.push(`file '${frames[frames.length - 1][0]}'`);
  fs.writeFileSync(path.join(out, 'list.txt'), lines.join('\n'));
  console.log('frames', frames.length, 'seconds', (frames[frames.length - 1][1] - frames[0][1]).toFixed(1));
  await browser.close(); server.close();
})();
