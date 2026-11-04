// Renders photoreal-style catalogue shots of the products that have no photo
// (three.js, headless Chromium via Playwright) -> assets/own/product-3d-<id>.png
// (1024x1024, pure white background, object centred at ~84% of the frame).
// Models live in scripts/product-renders/scene.js.
//   node scripts/render-products.mjs            # all
//   node scripts/render-products.mjs alu-slider # just some ids
import { build } from "esbuild";
import sharp from "sharp";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = 1024, FILL = 0.8, LOGO_ROOM = 70; // keep clear of the logo pill (bottom-right)

const bundle = await build({ entryPoints: [path.join(root, "scripts/product-renders/scene.js")], bundle: true, format: "iife", write: false, minify: true, logLevel: "error" });
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><script>${js}</script></body></html>`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const all = await page.evaluate(() => window.productIds);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

for (const id of ids) {
  if (!all.includes(id)) { console.error(`unknown product ${id}`); continue; }
  const t0 = Date.now();
  const url = await page.evaluate((i) => window.renderProduct(i), id);
  const png = Buffer.from(url.split(",")[1], "base64");
  // crop to the visible object (alpha), then fit into the square and flatten on white
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const scale = (OUT * FILL) / Math.max(w, h);
  const rw = Math.round(w * scale), rh = Math.round(h * scale);
  const obj = await sharp(png).extract({ left: x0, top: y0, width: w, height: h }).resize(rw, rh, { kernel: "lanczos3" }).png().toBuffer();
  const file = path.join(root, "assets/own", `product-3d-${id}.png`);
  await sharp({ create: { width: OUT, height: OUT, channels: 3, background: "#ffffff" } })
    .composite([{ input: obj, left: Math.round((OUT - rw) / 2), top: Math.round((OUT - LOGO_ROOM - rh) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`product-3d-${id}.png  ${w}x${h} -> ${rw}x${rh}  ${Date.now() - t0}ms`);
}
await browser.close();
