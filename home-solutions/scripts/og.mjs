// Composes the 1200x630 Open Graph image (BRIEF §7): hillside villa photo,
// white glass panel, logo, and "Windows · Doors · Glass". Also renders
// apple-touch-icon.png from public/favicon.svg when present.
import sharp from "sharp";
import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const photo = await sharp(root + "assets/stock/photo-caribbean-hillside-villa.jpg").resize(1200, 630, { fit: "cover", position: "centre" }).toBuffer();
const logo = await sharp(root + "assets/own/logo-navy.png").resize({ width: 440 }).toBuffer();
const panel = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".7" stop-color="#fff" stop-opacity=".88"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect width="940" height="630" fill="url(#w)"/>
  <rect x="64" y="378" width="40" height="2" fill="#26A8E0"/>
  <text x="64" y="452" font-family="Manrope, DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="54" fill="#182333" letter-spacing="-1">Windows · Doors · Glass</text>
  <text x="64" y="510" font-family="DM Sans, DejaVu Sans, Arial, sans-serif" font-size="28" fill="#3A4555">9 branches across western &amp; central Jamaica</text>
</svg>`);
await sharp(photo).composite([{ input: panel }, { input: logo, left: 64, top: 250 }]).jpeg({ quality: 86, mozjpeg: true }).toFile(root + "public/og-image.jpg");
console.log("og-image.jpg written");
if (fs.existsSync(root + "public/favicon.svg")) {
  await sharp(root + "public/favicon.svg", { density: 600 }).resize(180, 180, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toFile(root + "public/apple-touch-icon.png");
  console.log("apple-touch-icon.png written");
}
