// ChillPops end card (the kit's layout): the site's wordmark over a glow in its brand colour, then the credit.
// The site has no logo.svg and done-by-sss.jpg was not supplied, so the wordmark is set in the site's fonts and the
// credit is the master prompt's text fallback. Swap in the image with the kit's end_card.js once it exists.
// usage: node end_card_cp.js [out.png]
const { chromium } = require('playwright');
const path = require('path');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'endcard.png'));
const pop = '<svg viewBox="0 0 24 40" style="height:150px;width:auto;filter:drop-shadow(0 0 40px rgba(255,45,135,.55))"><path d="M3 12a9 9 0 0 1 18 0v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#FF2D87"/><path d="M9 10v15M15 10v15" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/><rect x="10" y="29" width="4" height="10" rx="2" fill="#E3B27E"/></svg>';
const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:opsz,wght@9..40,500..800&family=Instrument+Serif:ital@1&display=block">
<style>body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0E060D;font-family:"DM Sans",sans-serif}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 46% 56% at 50% 42%,rgba(217,17,111,.24),transparent 100%)}
.mark{position:absolute;left:0;right:0;top:250px;display:flex;align-items:center;justify-content:center;gap:34px}
.word{font:400 210px/1 Anton;letter-spacing:.01em;background:linear-gradient(180deg,#FF2D87,#C2105F);-webkit-background-clip:text;color:transparent}
.ja{position:absolute;left:0;right:0;top:500px;text-align:center;font:italic 400 84px/1 "Instrument Serif";color:#FFC53D}
.credit{position:absolute;left:510px;top:690px;width:900px;height:122px;box-sizing:border-box;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:22px;
  background:#170A16;border:2px solid rgba(255,197,61,.55);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#FFF6EE;font-size:40px;font-weight:500}
.credit b{font-weight:800;color:#fff;text-decoration:underline;text-decoration-color:#FFC53D;text-underline-offset:8px;text-decoration-thickness:3px}</style></head>
<body><div class="glow"></div><div class="mark">${pop}<span class="word">CHILLPOPS</span></div><div class="ja">Taste the Island</div>
<div class="credit">Website by <b>stevenscalesolutions.com</b></div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(html, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('end card ->', out);
})();
