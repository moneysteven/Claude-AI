// Packs dist/ into demo-dist/ for a claude.ai Artifact preview:
//  - root-absolute URLs (/img, /video, /assets, /favicon…) become relative,
//  - index.html becomes a body fragment (the Artifact host supplies <html>/<head>),
//  - only files actually referenced are copied (keeps the upload small).
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist"), out = path.join(root, "demo-dist");
fs.rmSync(out, { recursive: true, force: true });
const rel = (s) => s.replace(/(^|[\s"'(,=])\/(img|video|assets|favicon\.svg|apple-touch-icon\.png|og-image\.jpg)/g, "$1$2");
const used = new Set();
const collect = (s) => { for (const m of s.matchAll(/(?:^|[\s"'(,=`])((?:img|video|assets)\/[\w.\-]+)/g)) used.add(m[1]); };
let html = rel(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keepHead = head.split("\n").filter((l) => /<title|<link rel="stylesheet"|<link rel="modulepreload"|<script|<meta name="description"|<link rel="icon"/.test(l)).join("\n");
const frag = keepHead.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, "") + "\n" + body +
  (head.match(/<script type="module"[^>]*><\/script>/) || [""])[0];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), frag);
collect(frag);
// assets: rewrite + collect from css/js
for (const f of fs.readdirSync(path.join(dist, "assets"))) {
  const p = path.join(dist, "assets", f);
  if (/\.(js|css)$/.test(f)) {
    let s = fs.readFileSync(p, "utf8");
    // CSS url() resolves against the stylesheet (in assets/), JS strings against the page.
    s = f.endsWith(".css") ? s.replace(/url\(\/assets\//g, "url(").replace(/url\(\/(img|video)\//g, "url(../$1/") : rel(s); collect(s); fs.mkdirSync(path.join(out, "assets"), { recursive: true }); fs.writeFileSync(path.join(out, "assets", f), s); }
}
for (const u of used) {
  const src = path.join(dist, u);
  if (!fs.existsSync(src)) continue;
  if (u.startsWith("assets/") && /\.(js|css)$/.test(u)) continue;
  fs.mkdirSync(path.dirname(path.join(out, u)), { recursive: true });
  fs.copyFileSync(src, path.join(out, u));
}
// fonts referenced from css with ./ paths
for (const f of fs.readdirSync(path.join(dist, "assets"))) if (/\.woff2?$/.test(f)) fs.copyFileSync(path.join(dist, "assets", f), path.join(out, "assets", f));
let n = 0, bytes = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } };
walk(out);
console.log(`demo-dist: ${n} files, ${(bytes / 1e6).toFixed(1)} MB`);
