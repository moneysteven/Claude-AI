# VIDEO PLAYBOOK v3: silent website tours (no voice)
### Steven Scale Solutions · keep next to MASTER_PROMPT.md and CLAUDE.md

Use this whenever Steven asks for a video of a website: "showcase", "tour", "walkthrough", "promo of the site".
The video just shows the site and its options. A guided cursor moves to each option and uses it, with no voice and
no captions. It is a 1080p tour of about 3 minutes that shows every small detail, includes a phone section and ends
on the DONE BY end card.
v2 (Nov 2026) was narrated by a Kokoro voice. Steven asked for the voice to be taken out, so v3 keeps the same
tour and timing and drops the voice. Every script in this file ran end to end on 2026-11-15, on the ChillPops Jamaica
site. The same files are in `video-kit/`.

## Standing rules (from Steven)
1. **Never use Higgsfield, or any other paid generator that spends credits,** for video, music or upscaling, unless
   Steven explicitly asks for it in that conversation.
2. **No voice.** No narration, no voiceover and no text-to-speech of any kind. The picture does the explaining: the
   cursor goes to each option and uses it. The MP4 still carries a silent audio track, so every player and platform
   accepts it. Add music only if Steven sends a track to use.
3. **No captions.** Keep the picture clean. Add captions or on-screen labels only if Steven asks for them.
4. **Show the details and don't rush.** "Small things are really big." Show every small detail the site has: the
   ribbon pausing when you hover over it, hover zooms, live counts, empty states, today's hours highlighted, the footer
   line and the credit. Hold each detail long enough to take in, keep scrolling gently, and never jump past a section
   without showing it. Don't drag either: keep the pace `plan.py` sets, which is the pace Steven approved in v2.
5. **Start and finish.** Open on the site's opening intro, as a fresh visit, with the cursor visible. End on the brand
   end card with the DONE BY Stevenscalesolutions.com image. Deliver a 1920x1080 MP4 (H.264 video and a silent AAC
   track), and offer a 9:16 phone cut.
6. **Only show what the site really does.** Record the real site working, live. Never use edited screens, mock pages
   or faked states.
7. **Steven decides when it's perfect.** Change only what he asks for, then re-time and re-check (step 8) before
   sending again.

## Length
| Cut | Shots | Length | When |
|---|---|---|---|
| Detailed (default) | 20-25, one per detail | about 3 min | "showcase", "tour", "walkthrough" |
| Short | 9, one per feature | 60-70 s | only when Steven asks for a short or quick one |

The same kit makes both: only `shots.json` and the step list in `record_tour.js` change.

## Pipeline (about 30 minutes)
0. **Set up.** Nothing is downloaded. The kit needs Playwright with Chromium, ffmpeg, and Python with Pillow and numpy.
   - Copy the kit into the scratchpad: `cp -r video-kit <scratchpad>/video`. If there is no `video-kit/` folder, write
     each file from "The kit" below.
   - Serve the site with `node serve.js <site_dir> 8090`. Run it in the background with the longest timeout allowed,
     because a server that stops mid-recording ruins the take.
   - Check that the site answers with `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/` before every
     recording.
1. **Take a detail inventory.** This is the step that stops the video rushing. Walk the built site page by page, top
   to bottom, and write down every small detail.
   - **Also search the site's CSS and JS** for `:hover`, `@keyframes`, `animation`, `marquee`, `parallax`, `data-` and
     `aria-live`, so nothing is missed.
   - **Typical list for a master-prompt site:**
     - opener;
     - hero footage and its pause button;
     - Order popup, with each option;
     - nav bar turning solid, with the current section marked;
     - welcome photos and the traced name behind them;
     - the **ribbon/marquee: show it moving, then pausing under the cursor**;
     - dish hover cards (zoom and description);
     - price card;
     - parallax band;
     - menu search with its live count;
     - category chips;
     - empty state and its reset;
     - dotted price leaders and tags;
     - each vibe tab;
     - event cards;
     - gallery hover captions and silent video previews;
     - viewer counter and arrows;
     - hours, directions, live Open-now badge and today's row;
     - footer line and credit;
     - each extra page (events, contact form check);
     - phone drawer menu and floating call button.
2. **Write the shot list** in `shots.json`.
   - **Shots:** one shot per detail, in tour order.
   - **`show`:** one sentence, 8-20 words, naming what is on screen and each action in the order it happens. It is
     never spoken or shown. The tour times each action to a word in it (see "How the sync works"), and its length sets
     how long the shot holds.
   - **`hold`:** optional seconds that override that length. Use it for the intro (as long as the site's opening plays,
     about 8.5 s) and the end card (about 5.5 s).
   - **`gap`** is the time before each shot:

     | Before a shot where... | gap |
     |---|---|
     | the thing is already on screen | 0.4-1.2 s |
     | the tour scrolls to a new section | 2.4-3.3 s |
     | the tour changes page | 4-4.5 s |

   - **Order:** keep `phone` and then `close` as the last two shots.
3. **Make the plan:** `python3 plan.py`. It prints the number of shots and the total length. Check that no shot holds
   for more than about 9 s. Split any that does.
4. **Record the tour.**
   - Rewrite the step list in `record_tour.js` for this site and keep the helpers as they are.
   - The pattern for each shot:
     1. Scroll to the section before the shot starts: `until(L.x.at - 2.5)`, then `scrollTo(..., 2300)`.
     2. Time each action to the word that names it: `until(w('x', 'word'))`.
   - Run `node record_tour.js`. It must print `late steps: []`.
5. **Record the phone part.** Check the selectors in `record_phone.js` (`.burger`, the drawer's close button, `.fab`)
   and the words it times to in the `phone` shot. Run `node record_phone.js`. It must print `late: []`.
6. **Make the phone frame and the end card:**
   - `python3 phone_frame.py '#<brand hex>'`
   - `node end_card.js <site_dir> <site_dir>/_source/done-by-sss.jpg`
7. **Assemble:** `python3 assemble.py /home/user/sites/<slug>-website-tour.mp4`.
8. **Check before sending.** The late log can be clean while the picture is wrong, so look at the frames.
   - **Every shot:** grab a frame at 60% of each shot (`ffmpeg -ss T -frames:v 1`), tile them into one sheet and look
     at every frame. The screen must show what the shot's `show` text says.
   - **The phone part:** frames every 0.8 s. The drawer must open **and close**, and the call button must be visible.
   - **Durations:** video and audio must be equal (`ffprobe`).
   - **Silent:** `ffmpeg -i out.mp4 -af volumedetect -f null -` must report `max_volume: -91.0 dB`.
   - **First frame:** the site's own intro, not a white page.
   - **No voice and no captions** anywhere.
9. **Send** the video with SendUserFile, and end the message with the site's preview link.

**After any change to the shot list, run steps 3 to 8 again.** The times move, so every timed action moves with them.
In v2, a slower voice moved the phone drawer's close click to before the drawer had opened; a longer or shorter shot
does the same.

## How the sync works
- `w(id, word, lead = 0.25)` gives the moment a shot reaches a word in its `show` text: the shot's start, plus its hold
  times the word's character position divided by the text length, minus `lead`. Actions happen in the order the text
  names them, spread across the shot.
- `end(id)` is when a shot finishes. `until(t, label)` waits for time `t` and logs `[wanted, actual, label]`. Steps more
  than 0.3 s late are printed.
- **When a step is late,** the action before it (a glide or scroll in ms) ran past the next word. Shorten that action or
  start it earlier. Run independent moves together with `Promise.all([glide(...), scrollTo(...)])`.
- **Timeline:** `plan.py` adds 0.6 s for each crossfade.
  - The phone section starts 1.4 s before the `phone` shot.
  - The end card starts 1.2 s before the `close` shot.
  - The video ends 1.4 s after the `close` shot's hold.

## Lessons learned (each cost a re-take)
- **Pacing:**
  - `plan.py` holds each shot for 0.5 s, plus 0.28 s per word and 0.28 s per comma or full stop in its `show` text.
    That matches the v2 pace Steven approved; don't speed it up.
  - Three-minute tours need scrolling between almost every shot. Plan 2.4-3.3 s gaps for scrolls instead of cutting
    the scroll short.
- **The ribbon/marquee:**
  1. Centre it and let it run for about 2 s.
  2. Hover so it visibly stops.
  3. Glide off so it moves again.
- **Parallax** only shows while scrolling. Keep scrolling slowly through the whole shot, with the glide and the scroll
  run together.
- **Empty states:** type something the site doesn't have (for example "pizza"), then click its reset button.
- **Animated layers** (drawer, popup, viewer):
  - Never measure or click an element while it is still sliding in. Wait at least 1 s after opening.
  - Then check the new state with `page.waitForFunction(...)`, so a missed click stops the run with an error instead
    of quietly ruining the take. The phone drawer once stayed open for the whole phone part.
- **The background server** stops at its time limit. Start it with the longest timeout and `curl` it before each
  recording.
- **Smooth cursor:**
  - Move the visible cursor inside the page (`window.__glide`, requestAnimationFrame).
  - Then send one real `page.mouse.move` at the end, which triggers the hover state.
  - A CDP mouse move for every step is slow while the screen is being captured, and the schedule drifted by up to 13 s.
- **Navigation:** click links with `Promise.all([page.waitForURL(...), click()])`. A plain `waitForLoadState` can return
  for the old page, and the next `evaluate` then fails with "Execution context was destroyed".
- **Frame capture:** a CDP screencast gives about 30-55 fps at 1920x1080.
  - Gaps in the timestamps during still moments are normal, because no frame is sent when nothing changes.
  - Rebuild a constant 30 fps from the timestamps with the concat demuxer.
- **Page set-up:**
  - Set `scroll-behavior:auto` while recording, or the page's smooth scrolling fights the scripted scroll.
  - Remove the Google Maps iframe if the network blocks it. The page's own fallback card then shows instead of a grey
    error frame.
- **Crossfades:** set `fps=30,settb=AVTB` on every input, or ffmpeg rejects the mismatched timebases.
- **Silent track:** make it exactly as long as the picture with `-t LENGTH`; never use `-shortest`.
- **9:16 cut:** this is not in the kit yet. If Steven wants one, extend `record_phone.js` across the whole shot list.

## The kit
Files, in the order they are used:

| File | Job |
|---|---|
| `shots.json` | the shot list (Eleven's as the example) |
| `plan.py` | when each shot starts and how long it holds |
| `serve.js` | local server with byte ranges, so videos play |
| `cursor_overlay.js` | the visible cursor and click ring, in the site's `--brand` colour |
| `record_tour.js` | desktop tour (Eleven's steps as the example) |
| `record_phone.js` | phone part |
| `phone_frame.py` | phone bezel and background |
| `end_card.js` | logo, glow and DONE BY credit |
| `assemble.py` | the final MP4: no voice, no captions, a silent audio track |

### shots.json
```json
{
 "_note": "The shot list: one shot per detail, in the order the tour reaches it. 'show' says what is on screen and each action, in order; it is never spoken or shown, and record_tour.js times each action to a word in it. Its length sets how long the shot holds; 'hold' (seconds) overrides that. gap = seconds before the shot (time to scroll or change page). Keep 'phone' and 'close' as the last two shots.",
 "lines": [
  {
   "id": "intro",
   "gap": 0.6,
   "hold": 8.5,
   "show": "The new website for Eleven Restaurant and Lounge, in Savanna-la-Mar, opens like a movie, with a few seconds of their own footage."
  },
  {
   "id": "hero",
   "gap": 0.8,
   "show": "Behind the headline, three panels of real footage keep playing. And for anyone who prefers less movement, there's a pause button."
  },
  {
   "id": "order",
   "gap": 1.2,
   "show": "Every Order now button opens one simple menu. Guests can call, message on Instagram, send an email, or get directions."
  },
  {
   "id": "navbar",
   "gap": 1.0,
   "show": "As you scroll, the menu bar turns solid, and it always shows which part of the page you're on."
  },
  {
   "id": "welcome",
   "gap": 0.4,
   "show": "The welcome section uses their own photos, with the Eleven name traced softly behind them."
  },
  {
   "id": "ribbon",
   "gap": 2.4,
   "show": "This ribbon of highlights keeps gliding across the page, and it pauses the moment you hover over it."
  },
  {
   "id": "dishes",
   "gap": 3.1,
   "show": "Signature dishes come alive as you hover: the photo zooms in, and a short description slides up."
  },
  {
   "id": "lobster",
   "gap": 1.6,
   "show": "The lobster gets a bold price card of its own."
  },
  {
   "id": "band",
   "gap": 2.6,
   "show": "This photo band drifts with a gentle parallax as you scroll past."
  },
  {
   "id": "search",
   "gap": 3.0,
   "show": "The whole menu is searchable. Type shrimp, and it filters instantly, with a live count of what matched."
  },
  {
   "id": "chips",
   "gap": 0.6,
   "show": "Or tap a category, like drinks."
  },
  {
   "id": "empty",
   "gap": 1.0,
   "show": "Search for something they don't serve, and a friendly message offers the full menu back in one tap."
  },
  {
   "id": "leaders",
   "gap": 1.6,
   "show": "Prices sit on dotted leaders, just like a printed menu, and guest favourites are tagged."
  },
  {
   "id": "vibe",
   "gap": 2.6,
   "show": "Pick your vibe sets the mood: the food, the lounge, or the crew. Each tab brings its own photo and colour."
  },
  {
   "id": "whatson",
   "gap": 2.6,
   "show": "What's on shows Cabaret Live every Thursday, and what's coming next."
  },
  {
   "id": "gallery",
   "gap": 2.6,
   "show": "In the gallery, captions slide up as you hover, and the video tiles preview silently."
  },
  {
   "id": "viewer",
   "gap": 1.4,
   "show": "Open one, and it plays full screen, with a counter and arrows to step through the photos."
  },
  {
   "id": "visit",
   "gap": 3.3,
   "show": "Hours, directions, and a live open now badge. It checks the time in Jamaica, and today's hours are highlighted."
  },
  {
   "id": "footer",
   "gap": 3.0,
   "show": "Even the footer has a story: its line comes from the neon sign inside Eleven. You are exactly where you need to be."
  },
  {
   "id": "events",
   "gap": 4.4,
   "show": "Events get their own page, from Cabaret Live to past show nights, like their fire and aerial show."
  },
  {
   "id": "contact",
   "gap": 2.6,
   "show": "The contact page puts every way to reach them in one place, and the message form checks itself before sending."
  },
  {
   "id": "phone",
   "gap": 1.4,
   "show": "And on a phone, the menu slides in from the side, and a call button follows you down the page."
  },
  {
   "id": "close",
   "gap": 1.2,
   "hold": 5.5,
   "show": "End card: the Eleven logo, then the DONE BY Stevenscalesolutions.com credit."
  }
 ]
}
```

### plan.py
```python
# Builds plan.json (when each shot starts and how long it holds) from shots.json. No voice: the shot list sets the timing.
# usage: python3 plan.py
import json, os, re
D = os.path.dirname(os.path.abspath(__file__))
shots = json.load(open(f'{D}/shots.json'))['lines']

def hold(text):     # the calm pace Steven approved in v2: about 3.6 words a second, plus a beat at each comma, colon or full stop
    return 0.5 + 0.28 * len(text.split()) + 0.28 * len(re.findall(r'[,.:;]', text))

lines, t = [], 0.0
for s in shots:
    dur = s.get('hold') or hold(s['show'])
    if s['id'] == 'phone': t += 0.6                      # crossfade from the desktop tour into the phone
    if s['id'] == 'close': t += 0.6                      # crossfade into the end card
    t += s['gap']
    lines.append({'id': s['id'], 'at': round(t, 2), 'dur': round(dur, 2), 'show': s['show']})
    t += dur
by = {l['id']: l for l in lines}
plan = {
    'lines': lines,
    'phone_start': round(by['phone']['at'] - 1.4, 2),
    'end_card_at': round(by['close']['at'] - 1.2, 2),
    'length': round(by['close']['at'] + by['close']['dur'] + 1.4, 2),
}
json.dump(plan, open(f'{D}/plan.json', 'w'), indent=1)
print(f"{len(lines)} shots; phone {plan['phone_start']} s; end card {plan['end_card_at']} s; "
      f"total {plan['length']} s ({plan['length'] // 60:.0f}:{plan['length'] % 60:04.1f})")
```

### serve.js
```js
// Static server with byte ranges (videos need them), for viewing the site from this session.
// usage: node serve.js <site_dir> <port>
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || '.'), port = +(process.argv[3] || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const size = fs.statSync(f).size, range = req.headers.range, type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
  if (range) {
    const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? Math.min(+b, size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`serving ${root} on :${port}`));
```

### cursor_overlay.js
```js
// Page overlay for recordings: smooth in-page cursor (window.__glide), click ring in the site's --brand colour, no map iframe.
const CURSOR = () => {
  const style = document.createElement('style');
  style.textContent = `html{scroll-behavior:auto!important}
    #__cur{position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .4s;filter:drop-shadow(0 2px 5px rgba(0,0,0,.7))}
    #__cur.on{opacity:1}
    #__cur::before{content:"";position:absolute;left:-14px;top:-14px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--brand,#A3CF3E) 45%,transparent),transparent 70%)}
    #__ring{position:fixed;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:3px solid var(--brand,#A3CF3E);z-index:2147483646;pointer-events:none;opacity:0}
    #__ring.go{animation:__ring .55s ease-out}
    @keyframes __ring{from{opacity:.95;transform:scale(.25)}to{opacity:0;transform:scale(1.5)}}`;
  const add = () => {
    document.head.appendChild(style);
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" style="position:relative"><path d="M4 2l15 9.5-6.6 1.4 3.9 7.4-2.7 1.4-3.9-7.5L4 19z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = '__ring';
    document.body.append(c, r);
    // the visible cursor animates in the page (smooth at full frame rate); real mouse events only land at the end of a move
    let cx = innerWidth / 2, cy = innerHeight * 0.8;
    try { const p = JSON.parse(sessionStorage.getItem('__cur') || 'null'); if (p) { cx = p[0]; cy = p[1]; c.classList.add('on'); } } catch (e) {}
    const place = () => { c.style.transform = `translate(${cx - 4}px,${cy - 3}px)`; try { sessionStorage.setItem('__cur', JSON.stringify([cx, cy])); } catch (e) {} };
    place();
    window.__glide = (x, y, ms) => new Promise(res => {
      c.classList.add('on'); const sx = cx, sy = cy, t = performance.now();
      const st = n => { const p = Math.min(1, (n - t) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; cx = sx + (x - sx) * e; cy = sy + (y - sy) * e; place(); p < 1 ? requestAnimationFrame(st) : res(); };
      requestAnimationFrame(st);
    });
    addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; place(); c.classList.add('on'); }, true);
    addEventListener('mousedown', e => { r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); }, true);
    document.querySelectorAll('iframe[src*="google.com/maps"]').forEach(f => f.remove());
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
};
module.exports = { CURSOR };
```

### record_tour.js
```js
// Desktop tour (1920x1080), timed to plan.json: every action lands on the word that names it in the shot list.
// usage: node record_tour.js [out_dir]     site served at SITE_URL (default http://127.0.0.1:8090/)
// The helpers are reusable as they are. The step list below is the Eleven tour: rewrite it for each site.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { CURSOR } = require('./cursor_overlay.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'frames_tour'));
const W = 1920, H = 1080, BASE = process.env.SITE_URL || 'http://127.0.0.1:8090/';
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json')));
const L = Object.fromEntries(plan.lines.map(l => [l.id, l]));
// when (seconds) a shot reaches a word in its 'show' text: by its position in the text, a touch early so the action leads the word
const w = (id, word, lead = 0.25) => { const l = L[id], i = l.show.indexOf(word); if (i < 0) throw new Error(`"${word}" not in ${id}`); return l.at + l.dur * (i / l.show.length) - lead; };
const end = id => L[id].at + L[id].dur;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.route(/google\.com/, r => r.abort());
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const index = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'));
    index.push([file, f.metadata.timestamp]);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  let t0 = 0; const log = [];
  const now = () => Date.now() / 1000 - t0;
  const until = async (t, label = '') => { const d = (t - now()) * 1000; if (d > 0) await page.waitForTimeout(d); log.push([+t.toFixed(2), +now().toFixed(2), label]); };
  const glide = async (x, y, ms = 700) => { await page.evaluate(({ x, y, ms }) => window.__glide(x, y, ms), { x, y, ms }); await page.mouse.move(x, y); };
  const box = async sel => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('no box: ' + sel); return b; };
  const glideTo = async (sel, ms = 700, dx = 0.5, dy = 0.5) => { const b = await box(sel); await glide(b.x + b.width * dx, b.y + b.height * dy, ms); };
  const click = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
  const scrollTo = (y, ms) => page.evaluate(({ y, ms }) => new Promise(res => {
    const s = scrollY, d = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)) - s, t = performance.now();
    const step = nw => { const p = Math.min(1, (nw - t) / ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; scrollTo(0, s + d * e); p < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), { y, ms });
  const topOf = (sel, off = 0) => page.evaluate(({ sel, off }) => document.querySelector(sel).getBoundingClientRect().top + scrollY - off, { sel, off });
  const centreOn = async (sel, ms, frac = 0.5) => { const y = await page.evaluate(({ sel, frac }) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top + scrollY - (innerHeight * frac - r.height / 2); }, { sel, frac }); await scrollTo(y, ms); };
  const goTo = async (href, label) => { await glideTo(`.nav__links a[href="${href}"]`, 700); await Promise.all([page.waitForURL('**/' + href, { waitUntil: 'domcontentloaded' }), click()]); log.push([0, +now().toFixed(2), label]); };

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  t0 = Date.now() / 1000;
  // intro: the opening plays untouched
  await page.goto(BASE + 'index.html', { waitUntil: 'commit' });
  // hero: footage, then the pause button
  await until(w('hero', 'pause') - 1.4, 'hero'); await glideTo('.hero .motion-toggle', 1400);
  // order popup: each option as it's named
  await until(L.order.at - 1.1, 'to order'); await glideTo('.hero .btn--solid', 900);
  await until(L.order.at + 0.2); await click();
  await until(w('order', 'Guests'), 'menu'); await glideTo('#order .opt', 700, 0.3);
  await until(w('order', 'call')); await glideTo('#order a.opt[href^="tel:"]', 400, 0.3);
  await until(w('order', 'Instagram') - 0.2); await glideTo('#order a.opt[href*="ig.me"]', 500, 0.3);
  await until(w('order', 'email') - 0.2); await glideTo('#order a.opt[href^="mailto:"]', 500, 0.3);
  await until(w('order', 'directions') - 0.2); await glideTo('#order a.opt[href*="maps/dir"]', 500, 0.3);
  await until(end('order') + 0.3); await page.keyboard.press('Escape');
  // menu bar: a slow scroll into the welcome section while the bar turns solid
  await until(L.navbar.at + 0.1, 'navbar');
  const navScroll = scrollTo(await topOf('#welcome', 40), (L.navbar.dur - 0.4) * 1000);
  await until(w('navbar', 'shows')); await glideTo('.nav__links a[aria-current], .nav__links a.is-active', 900, 0.5, 1.1);
  await navScroll;
  // welcome: photos, then the traced ELEVEN behind them
  await until(L.welcome.at + 0.1, 'welcome'); await glideTo('#welcome .intro__photo', 800);
  await until(w('welcome', 'traced')); await glideTo('#welcome .ghost-word', 900, 0.3, 0.5);
  // ribbon: it keeps moving, then pauses under the cursor, then moves again
  await until(L.ribbon.at - 2.4, 'to ribbon'); await centreOn('.marquee', 2200, 0.55);
  await until(w('ribbon', 'pauses') - 0.6, 'ribbon'); await glideTo('.marquee', 700, 0.42);
  await until(end('ribbon') + 0.15); await glide(W * 0.42, H * 0.25, 500);
  // dishes: hover zoom + description
  await until(L.dishes.at - 2.5, 'to dishes'); await scrollTo(await topOf('#favorites', 40), 2300);
  await until(L.dishes.at + 0.1, 'dishes'); await glideTo('#favorites .card:nth-of-type(1)', 700, 0.5, 0.45);
  await until(w('dishes', 'zooms')); await glideTo('#favorites .card:nth-of-type(2)', 600, 0.5, 0.45);
  await until(w('dishes', 'description')); await glideTo('#favorites .card:nth-of-type(3)', 600, 0.5, 0.45);
  // lobster type card on the second row
  await until(L.lobster.at - 1.5, 'to lobster'); await centreOn('#favorites .card--type', 1300, 0.5);
  await until(L.lobster.at + 0.1, 'lobster'); await glideTo('#favorites .card--type', 700, 0.5, 0.4);
  // photo band with parallax: keep scrolling gently while it's talked about
  await until(L.band.at - 2.5, 'to band'); await centreOn('.promo', 2400, 0.5);
  await until(L.band.at + 0.1, 'band');
  await Promise.all([glide(W * 0.62, H * 0.62, 900), scrollTo(await page.evaluate(() => scrollY + 260), (L.band.dur - 0.6) * 1000)]);
  // search
  await until(L.search.at - 2.5, 'to search'); await scrollTo(await topOf('#menu', 30), 2300);
  await until(L.search.at + 0.1, 'search'); await glideTo('#menu input[type="search"]', 800, 0.35);
  await until(w('search', 'searchable') + 0.4); await click();
  await until(w('search', 'shrimp') - 0.15); await page.keyboard.type('shrimp', { delay: 90 });
  await until(w('search', 'count')); await glideTo('#menu [data-count]', 700, 0.3);
  // category chip
  await until(L.chips.at - 0.55, 'chips'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await glideTo('#menu .chip[data-cat="Drinks"]', 600);
  await until(w('chips', 'drinks')); await click();
  // empty state, then the one-tap reset
  await until(L.empty.at - 0.9, 'empty'); await glideTo('#menu input[type="search"]', 600, 0.35); await click();
  await until(w('empty', 'something')); await page.keyboard.type('pizza', { delay: 100 });
  await until(w('empty', 'full menu') - 0.4); await glideTo('#menu .menu-empty [data-reset]', 700);
  await until(w('empty', 'one tap') + 0.2); await click();
  // dotted leaders and tags
  await until(L.leaders.at - 1.5, 'to leaders'); await scrollTo(await topOf('#menu .menu-list', 120), 1400);
  await until(L.leaders.at + 0.1, 'leaders'); await glideTo('#menu .item__end', 500, 0.05);
  await glideTo('#menu .item__end', 1300, 0.95);
  await until(w('leaders', 'tagged') - 0.3); await glideTo('#menu .tag', 700);
  // pick your vibe
  await until(L.vibe.at - 2.5, 'to vibe'); await scrollTo(await topOf('#vibe', 40), 2300);
  const tab = async i => { const b = await page.locator('#vibe [role="tab"]').nth(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x, y] = await tab(0); await until(L.vibe.at + 0.2, 'vibe'); await glide(x, y, 800);
  await until(w('vibe', 'the food')); await click();
  [x, y] = await tab(1); await glide(x, y, 450); await until(w('vibe', 'the lounge')); await click();
  [x, y] = await tab(2); await glide(x, y, 450); await until(w('vibe', 'the crew')); await click();
  await until(w('vibe', 'photo') - 0.5); await glideTo('#vibe img', 900, 0.5, 0.45);
  // what's on
  await until(L.whatson.at - 2.5, 'to whatson'); await scrollTo(await topOf('#whats-on', 40), 2300);
  await until(w('whatson', 'Cabaret'), 'whatson'); await glideTo('#whats-on .event:nth-of-type(1)', 700, 0.6, 0.4);
  await until(w('whatson', 'coming')); await glideTo('#whats-on .event:nth-of-type(2)', 700, 0.6, 0.4);
  // gallery: hover captions, then a video tile previewing
  await until(L.gallery.at - 2.5, 'to gallery'); await scrollTo(await topOf('#gallery', 20), 2300);
  await until(L.gallery.at + 0.1, 'gallery'); await glideTo('#gallery a.tile:not([data-type])', 800, 0.5, 0.55);
  await until(w('gallery', 'video')); await glideTo('#gallery a.tile[data-type="video"]', 800, 0.5, 0.55);
  // viewer: the fire & aerial show, counter, arrows
  await until(L.viewer.at - 1.3, 'to viewer'); await centreOn('#show-video', 1200, 0.5);
  await until(L.viewer.at + 0.1, 'viewer'); await glideTo('#show-video', 600);
  await until(L.viewer.at + 0.8); await click();
  await until(w('viewer', 'counter')); await glideTo('.lb__count', 700);
  await until(w('viewer', 'arrows')); await glideTo('.lb__next', 700);
  await until(w('viewer', 'step')); await click();
  await until(w('viewer', 'photos') + 0.3); await click();
  await until(end('viewer') + 0.05); await page.keyboard.press('Escape');
  // visit: hours, directions, live badge, today's row
  await until(L.visit.at - 2.9, 'to visit'); await scrollTo(await topOf('#visit', 30), 2600);
  await until(L.visit.at - 0.3, 'visit'); await glideTo('#visit .hours', 450, 0.3, 0.2);
  await until(w('visit', 'directions')); await glideTo('#visit a[href*="maps/dir"]', 700);
  await until(w('visit', 'open now')); await glideTo('#visit [data-open]', 800);
  await until(w('visit', 'today')); await glideTo('#visit .hours tr.is-today', 800, 0.25);
  // footer: the neon-sign line, then the credit
  await until(L.footer.at - 2.9, 'to footer'); await scrollTo(await topOf('.footer', 0), 2600);
  await until(w('footer', 'neon'), 'footer'); await glideTo('.footer__big', 900, 0.35, 0.6);
  await until(end('footer') + 0.3, 'credit'); await scrollTo(1e7, 1800); await glideTo('.footer__legal .credit', 800);
  // events page
  await until(L.events.at - 1.6, 'to events'); await goTo('events.html', 'events loaded');
  await until(w('events', 'Cabaret') - 0.5, 'events'); await scrollTo(await topOf('#weekly', 40), 1000);
  await until(w('events', 'past') - 0.2); await scrollTo(await topOf('#past', 40), 1500);
  await until(w('events', 'fire')); await glideTo('#past .event--wide', 800, 0.3, 0.4);
  // contact page: every way to reach them, then the form checking itself
  await until(L.contact.at - 2.4, 'to contact'); await goTo('contact.html', 'contact loaded');
  await until(L.contact.at - 0.4, 'contact'); await scrollTo(await topOf('#reach', 40), 1100);
  await until(w('contact', 'every')); await glideTo('#reach .ccard', 800);
  await until(w('contact', 'message form') - 1.1); await scrollTo(await topOf('#message', 40), 1300);
  await glideTo('[data-mailto] button[type="submit"]', 700);
  await until(w('contact', 'checks')); await click();
  await until(plan.phone_start + 0.4, 'desktop end');
  await cdp.send('Page.stopScreencast'); await page.waitForTimeout(300);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ t0, frames: index, log }));
  const late = log.filter(([want, got, label]) => want && got - want > 0.3);
  console.log(`${index.length} frames, ${now().toFixed(1)} s; late steps: ${JSON.stringify(late)}`);
  await browser.close();
})();
```

### record_phone.js
```js
// Phone section: 390x844 at 2x, with a touch dot. Its clock starts at the crossfade from the desktop tour.
// usage: node record_phone.js [out_dir]     site served at SITE_URL (default http://127.0.0.1:8090/)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { CURSOR } = require('./cursor_overlay.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'frames_phone'));
const W = 390, H = 844, BASE = process.env.SITE_URL || 'http://127.0.0.1:8090/';
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json')));
const P = plan.lines.find(l => l.id === 'phone');
const T0 = plan.phone_start - 0.6;                                  // video time of this recording's first frame
const w = (word, lead = 0.25) => { const i = P.show.indexOf(word); if (i < 0) throw new Error(word); return P.at + P.dur * (i / P.show.length) - lead - T0; };
const STOP = plan.end_card_at - T0 + 0.2;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.route(/google\.com/, r => r.abort());
  // the desktop part already showed the intro: mark it seen. 'opener-seen' is the master prompt's key; older sites used their own.
  await ctx.addInitScript(keys => { try { keys.forEach(k => sessionStorage.setItem(k, '1')); } catch (e) {} }, (process.env.INTRO_KEY || 'opener-seen,eleven-intro').split(','));
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');   // a touch dot instead of an arrow
    s.textContent = '#__cur svg{display:none}#__cur::before{display:none}#__cur{width:40px;height:40px;margin:-17px 0 0 -16px;border-radius:50%;background:rgba(255,255,255,.32);border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 6px color-mix(in srgb,var(--brand,#A3CF3E) 25%,transparent)}';
    document.head.appendChild(s);
  }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const index = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'));
    index.push([file, f.metadata.timestamp]);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  // load and settle before the clock starts, so the phone opens on a finished hero
  await page.goto(BASE + 'index.html', { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1800);
  let t0 = 0; const log = [];
  const now = () => Date.now() / 1000 - t0;
  const until = async (t, label = '') => { const d = (t - now()) * 1000; if (d > 0) await page.waitForTimeout(d); log.push([+t.toFixed(2), +now().toFixed(2), label]); };
  const glide = async (x, y, ms = 600) => { await page.evaluate(({ x, y, ms }) => window.__glide(x, y, ms), { x, y, ms }); await page.mouse.move(x, y); };
  const glideTo = async (sel, ms = 600, dx = 0.5, dy = 0.5) => { const b = await page.locator(sel).first().boundingBox(); await glide(b.x + b.width * dx, b.y + b.height * dy, ms); };
  const click = async () => { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
  const scrollBy = (dy, ms) => page.evaluate(({ dy, ms }) => new Promise(res => { const s = scrollY, t = performance.now();
    const st = n => { const p = Math.min(1, (n - t) / ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; scrollTo(0, s + dy * e); p < 1 ? requestAnimationFrame(st) : res(); }; requestAnimationFrame(st); }), { dy, ms });

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  t0 = Date.now() / 1000;
  await until(w('menu') - 1.0, 'to burger'); await glideTo('.burger', 700);
  await until(w('menu'), 'drawer'); await click();                    // "the menu slides in from the side"
  // the close button is measured only once the drawer has finished sliding in (>= 1 s after the click)
  await until(w('call button') - 1.5, 'close drawer'); await glideTo('#drawer button[aria-label="Close menu"]', 450); await click();
  await page.waitForFunction(() => !document.querySelector('#drawer').classList.contains('is-open'), null, { timeout: 1500 })
    .catch(() => { throw new Error('drawer did not close'); });
  await page.waitForTimeout(200);
  await Promise.all([glide(W * 0.5, H * 0.62, 500), scrollBy(1250, 1200)]);   // the call button appears once you're past the hero
  await until(w('follows'), 'fab'); await glideTo('.fab', 600);
  await scrollBy(700, 1400);                                         // ...and stays with you
  await until(STOP);
  await cdp.send('Page.stopScreencast'); await page.waitForTimeout(200);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ t0, frames: index, log, T0 }));
  console.log(`${index.length} frames, ${now().toFixed(1)} s; late: ${JSON.stringify(log.filter(([a, b]) => b - a > 0.3))}`);
  await browser.close();
})();
```

### phone_frame.py
```python
# Background and phone bezel for the phone section (screen area left transparent).
# usage: python3 phone_frame.py [#brandhex]   -> phone_bg.png + phone_frame.png next to this script
import os, sys
from PIL import Image, ImageDraw, ImageFilter
D = os.path.dirname(os.path.abspath(__file__))
hx = (sys.argv[1] if len(sys.argv) > 1 else '#A3CF3E').lstrip('#')
GLOW = tuple(int(int(hx[i:i + 2], 16) * 0.25) for i in (0, 2, 4))     # the brand colour, dimmed
W, H = 1920, 1080
SX, SY, SW, SH = 752, 90, 416, 900         # where the phone screen sits
bg = Image.new('RGB', (W, H), (8, 8, 9))
glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).ellipse([W * .25, H * .05, W * .75, H * .95], fill=80)
bg = Image.composite(Image.new('RGB', (W, H), GLOW), bg, glow.filter(ImageFilter.GaussianBlur(200)))
bg.save(f'{D}/phone_bg.png')
S = 2   # draw the bezel at 2x for smooth corners
fr = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(fr)
b = 18
d.rounded_rectangle([(SX - b) * S, (SY - b) * S, (SX + SW + b) * S, (SY + SH + b) * S], radius=62 * S, fill=(24, 24, 27, 255), outline=(70, 72, 76, 255), width=3 * S)
hole = Image.new('L', fr.size, 0); ImageDraw.Draw(hole).rounded_rectangle([SX * S, SY * S, (SX + SW) * S, (SY + SH) * S], radius=46 * S, fill=255)
fr.putalpha(Image.composite(Image.new('L', fr.size, 0), fr.getchannel('A'), hole))
d = ImageDraw.Draw(fr)
d.rounded_rectangle([(SX + SW / 2 - 52) * S, (SY + 10) * S, (SX + SW / 2 + 52) * S, (SY + 40) * S], radius=15 * S, fill=(0, 0, 0, 255))   # camera island
fr.resize((W, H), Image.LANCZOS).save(f'{D}/phone_frame.png')
print('phone_bg.png + phone_frame.png')
```

### end_card.js
```js
// End card: the site's own logo (assets/img/logo.svg) over a glow in its --brand colour, then the DONE BY credit image.
// usage: node end_card.js <site_dir> <done-by image> [out.png]     (default out: endcard.png next to this script)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const site = path.resolve(process.argv[2]), credit = path.resolve(process.argv[3]);
const out = path.resolve(process.argv[4] || path.join(__dirname, 'endcard.png'));
const css = fs.readFileSync(path.join(site, 'css/styles.css'), 'utf8');
const brand = (css.match(/--brand:\s*(#[0-9a-fA-F]{3,8})/) || [])[1] || '#A3CF3E';
const logo = fs.readFileSync(path.join(site, 'assets/img/logo.svg'), 'utf8').replace('<svg ', '<svg style="display:block;width:100%;height:auto" ');
const mime = /\.png$/i.test(credit) ? 'image/png' : 'image/jpeg';
const html = `<!doctype html><html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;background:#08080a">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse 46% 56% at 50% 42%,color-mix(in srgb,${brand} 17%,transparent),transparent 100%)"></div>
  <div style="position:absolute;left:550px;top:330px;width:820px">${logo}</div>
  <img src="data:${mime};base64,${fs.readFileSync(credit).toString('base64')}" style="position:absolute;left:510px;top:690px;width:900px;border-radius:18px">
</body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out });
  await browser.close();
  console.log('end card ->', out, 'brand', brand);
})();
```

### assemble.py
```python
# Silent website tour: desktop tour + phone section + end card. No voice, no captions; a silent audio track so every player accepts it.
# usage: python3 assemble.py /path/to/<client>-website-tour.mp4
import json, os, subprocess, sys
import numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(f'{D}/plan.json'))
LEN, PS, EC, XF = plan['length'], plan['phone_start'], plan['end_card_at'], 0.6
OUT = sys.argv[1]
run = lambda *a: subprocess.run(list(a), check=True)

def frames_to_mp4(folder, out, w, h, start_offset=0.0):
    """screencast frames -> constant 30 fps, on the plan's clock (t = timestamp - t0 + start_offset)"""
    idx = json.load(open(f'{D}/{folder}/index.json')); t0, fr = idx['t0'], idx['frames']
    k = next(i for i, (fn, _) in enumerate(fr) if np.asarray(Image.open(f'{D}/{folder}/{fn}').convert('L').resize((32, 18))).mean() < 200)
    fr = fr[k:]
    with open(f'{D}/{folder}/concat.txt', 'w') as f:
        f.write(f"file '{fr[0][0]}'\nduration {fr[0][1] - t0 + start_offset:.4f}\n")
        for (a, ta), (_, tb) in zip(fr, fr[1:]): f.write(f"file '{a}'\nduration {max(tb - ta, 0.001):.4f}\n")
        f.write(f"file '{fr[-1][0]}'\nduration 1.0\nfile '{fr[-1][0]}'\n")
    run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{D}/{folder}/concat.txt', '-vf', f'scale={w}:{h}:flags=lanczos,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', out)

# 1. desktop tour and the phone section (screen inside the bezel)
frames_to_mp4('frames_tour', f'{D}/d.mp4', 1920, 1080)
frames_to_mp4('frames_phone', f'{D}/p_screen.mp4', 416, 900)
run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', f'{D}/phone_bg.png', '-i', f'{D}/p_screen.mp4', '-loop', '1', '-i', f'{D}/phone_frame.png', '-filter_complex',
    '[0:v][1:v]overlay=752:90:shortest=1[a];[a][2:v]overlay=0:0:shortest=1,format=yuv420p[v]', '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', f'{D}/p.mp4')

# 2. picture: tour -> phone -> end card, fade out
run('ffmpeg', '-v', 'error', '-y', '-i', f'{D}/d.mp4', '-i', f'{D}/p.mp4', '-loop', '1', '-t', f'{LEN - EC + XF + 0.2:.2f}', '-i', f'{D}/endcard.png', '-filter_complex',
    f"[0:v]trim=duration={PS + 0.05:.3f},fps=30,setsar=1,settb=AVTB[a];[1:v]fps=30,setsar=1,settb=AVTB[b];[2:v]scale=1920:1080,fps=30,format=yuv420p,setsar=1,settb=AVTB[c];"
    f"[a][b]xfade=transition=fade:duration={XF}:offset={PS - XF:.3f}[ab];[ab][c]xfade=transition=fade:duration={XF}:offset={EC - XF:.3f},"
    f"fade=t=out:st={LEN - 0.8:.3f}:d=0.8,format=yuv420p[v]",
    '-map', '[v]', '-t', f'{LEN:.2f}', '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', f'{D}/picture_d.mp4')

# 3. a silent stereo track exactly as long as the picture, then mux
run('ffmpeg', '-v', 'error', '-y', '-i', f'{D}/picture_d.mp4', '-f', 'lavfi', '-t', f'{LEN:.2f}', '-i', 'anullsrc=r=48000:cl=stereo',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', f'{LEN:.2f}', '-movflags', '+faststart', OUT)
print(OUT, f'{os.path.getsize(OUT) / 1e6:.1f} MB, {LEN:.1f} s, silent')
```
