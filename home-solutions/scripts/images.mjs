// Converts every raster in /assets to responsive WebP (+ AVIF where smaller)
// at 640/1024/1600/2400 widths (never upscaled) and writes
// public/img/manifest.json: { "<name>": { w, h, widths:[...], avif:[...] } }.
// Product thumbnails (300x300) are emitted at native size only.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "public", "img");
const WIDTHS = [640, 1024, 1600, 2400];
const SKIP = /^oldsite-banner-/; // baked-in text: never used (BRIEF §7)

await fs.mkdir(OUT, { recursive: true });
const manifest = {};
for (const dir of ["own", "stock"]) {
  const files = (await fs.readdir(path.join(ROOT, "assets", dir))).filter((f) => /\.(jpe?g|png)$/i.test(f) && !SKIP.test(f));
  for (const file of files) {
    const name = file.replace(/\.(jpe?g|png)$/i, "");
    const src = path.join(ROOT, "assets", dir, file);
    const meta = await sharp(src).metadata();
    const isLogo = name.startsWith("logo");
    const widths = meta.width <= 640 || isLogo ? [meta.width] : WIDTHS.filter((w) => w <= meta.width);
    if (!isLogo && meta.width > 640 && !widths.includes(meta.width) && meta.width < 2400) widths.push(meta.width);
    const entry = { w: meta.width, h: meta.height, widths: [], avif: [], alpha: !!meta.hasAlpha };
    for (const w of widths) {
      const base = sharp(src).resize({ width: w, withoutEnlargement: true });
      const webp = await base.clone().webp({ quality: 86, effort: 5 }).toBuffer();
      await fs.writeFile(path.join(OUT, `${name}-${w}.webp`), webp);
      entry.widths.push(w);
      if (!isLogo) {
        const avif = await base.clone().avif({ quality: 60, effort: 4 }).toBuffer();
        if (avif.length < webp.length) {
          await fs.writeFile(path.join(OUT, `${name}-${w}.avif`), avif);
          entry.avif.push(w);
        }
      }
    }
    if (isLogo) await fs.copyFile(src, path.join(OUT, file));
    manifest[name] = entry;
    process.stdout.write(`${name} ${widths.join("/")}\n`);
  }
}
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
