// Puts the Home Solutions logo on every product picture (client request):
// assets/own/product-*.jpg (store photos), product-ai-*.png (AI renders) and
// product-3d-*.png (three.js renders)
// -> assets/own/productb-<productId>.jpg, and points BUSINESS.products[].img
// at them (src/config.js). The logo is the vector wordmark from
// src/sections/header/logo.js, so it stays crisp at any size.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { logoSVG } from "../src/sections/header/logo.js";
import { BUSINESS } from "../src/config.js";

// Original (unbranded) store photos per product, so the script can be re-run.
const ORIGINALS = {"alu-vent":"product-alu-projecting-vent.jpg","upvc-closet":"product-upvc-sliding-closet-door.jpg","steel-6p-32w":"product-steel-6-panel-white.jpg","steel-6p-32b":"product-steel-6-panel-bronze.jpg","steel-6p-36w":"product-steel-6-panel-white.jpg","steel-6p-36b":"product-steel-6-panel-bronze.jpg","steel-sidelite":"product-half-door-side-lite.jpg","wi-french":"product-wrought-iron-french.jpg","wi-texas":"product-wrought-iron-texas.jpg","wi-tuscany":"product-wrought-iron-tuscany.jpg","shower-sliding":"product-sliding-frameless-shower.jpg","shower-swing":"product-swing-frameless-shower.jpg","railing":"product-frameless-railing.jpg"};

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const own = (f) => path.join(root, "assets/own", f);

// Vector logo with the CSS-variable fallbacks resolved for librsvg.
const svg = logoSVG({ className: "" })
  .replace(/var\(--[\w-]+,\s*(#[0-9a-fA-F]{3,8})\)/g, "$1")
  .replace(/style="[^"]*"/g, "")
  .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');

async function brand(srcFile, outFile) {
  const src = sharp(own(srcFile)).flatten({ background: "#ffffff" });
  const { width, height } = await src.metadata();
  const size = Math.max(width, height);
  const base = await src.resize(size, size, { fit: "contain", background: "#ffffff" }).toBuffer();
  const logoW = Math.round(size * 0.34);
  const logo = await sharp(Buffer.from(svg), { density: 600 }).resize({ width: logoW }).png().toBuffer();
  const lm = await sharp(logo).metadata();
  const pad = Math.round(size * 0.035), padX = Math.round(lm.height * 0.55), padY = Math.round(lm.height * 0.38);
  const pillW = lm.width + padX * 2, pillH = lm.height + padY * 2;
  const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}"><rect width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#fff" fill-opacity=".92" stroke="#DCE0E5" stroke-width="${Math.max(1, size / 600)}"/></svg>`);
  const left = size - pillW - pad, top = size - pillH - pad;
  await sharp(base)
    .composite([{ input: pill, left, top }, { input: logo, left: left + padX, top: top + padY }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(own(outFile));
  return `${outFile} ${size}px`;
}

const cfgPath = path.join(root, "src/config.js");
let cfg = fs.readFileSync(cfgPath, "utf8");
for (const p of BUSINESS.products) {
  // AI render (product-ai-<id>.png) wins, then the three.js render
  // (product-3d-<id>.png, scripts/render-products.mjs), then the store photo.
  const src = [`product-ai-${p.id}.png`, `product-3d-${p.id}.png`].find((f) => fs.existsSync(own(f))) || ORIGINALS[p.id] || null;
  if (!src) continue;
  const out = `productb-${p.id}.jpg`;
  console.log(await brand(src, out));
  // point the product at the branded file
  // (a trailing // comment after the entry is kept)
  const re = new RegExp(`(\\{ id:"${p.id}",[^\\n]*?)(, img:"[^"]*")?( \\},?)([^\\n]*)\\n`);
  cfg = cfg.replace(re, (m, a, _img, b, tail) => `${a}, img:"/assets/own/${out}"${b}${tail}\n`);
}
fs.writeFileSync(cfgPath, cfg);
