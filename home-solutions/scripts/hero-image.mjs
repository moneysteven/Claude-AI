// Hero background (client request): the living room with sliding glass doors
// and pool. Desktop 1920w landscape; phone 1080x1920 portrait crop centred on
// the glass doors. Also used as the (unused-by-default) video poster.
import sharp from "sharp";
const root = new URL("..", import.meta.url).pathname;
const src = root + "assets/stock/photo-interior-living-sliding-doors-pool.jpg";
const { width: W, height: H } = await sharp(src).metadata();
await sharp(src).resize({ width: 1920 }).webp({ quality: 86, effort: 6 }).toFile(root + "public/img/hero-living-doors-1920.webp");
// Portrait crop: doors are centred at ~76% of the width.
const cw = Math.round((H * 9) / 16), cx = Math.round(W * 0.76);
const left = Math.min(W - cw, Math.max(0, cx - Math.round(cw / 2)));
await sharp(src).extract({ left, top: 0, width: cw, height: H }).resize(1080, 1920).webp({ quality: 86, effort: 6 }).toFile(root + "public/img/hero-living-doors-1080.webp");
await sharp(src).resize({ width: 1920 }).webp({ quality: 86, effort: 6 }).toFile(root + "public/video/hero-poster.webp");
console.log("hero images written", { cw, left });
