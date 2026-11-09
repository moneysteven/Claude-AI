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
