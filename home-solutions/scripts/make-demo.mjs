// Packs a self-contained preview for the claude.ai Artifact viewer into demo-dist/.
// The viewer runs pages in a sandboxed frame with an opaque ("null") origin, so
// any CORS-mode request (module scripts, crossorigin stylesheets, web fonts) to
// the page's own files is blocked; on iPhone that left the page unstyled. So:
//  - build with vite.demo.config.js: one classic IIFE script, fonts as data URIs;
//  - inline that CSS and JS straight into the page;
//  - make root-absolute media URLs relative and copy only referenced media
//    (images/videos load fine cross-origin without CORS).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist-demo"), out = path.join(root, "demo-dist");
if (!process.argv.includes("--no-build")) execSync("npx vite build -c vite.demo.config.js", { cwd: root, stdio: "inherit" });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const rel = (s) => s.replace(/(^|[\s"'(,=])\/(img|video|favicon\.svg|apple-touch-icon\.png|og-image\.jpg)\b/g, "$1$2");
const used = new Set();
const collect = (s) => { for (const m of s.matchAll(/(?:^|[\s"'(,=`])((?:img|video)\/[\w.\-]+)/g)) used.add(m[1]); };

const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const cssFile = head.match(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"/)[1];
const jsFile = (head + body).match(/<script[^>]*src="\/?(assets\/[^"]+\.js)"[^>]*><\/script>/)[1];
const css = rel(fs.readFileSync(path.join(dist, cssFile), "utf8")).replace(/<\/style/gi, "<\\/style");
const js = rel(fs.readFileSync(path.join(dist, jsFile), "utf8")).replace(/<\/script/gi, "<\\/script");
const keepHead = head.split("\n").filter((l) => /<title|<meta name="description"|<script>document/.test(l)).join("\n");
const bodyClean = rel(body).replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
const page = `${keepHead}\n<style>${css}</style>\n${bodyClean}\n<script>${js}</script>\n`;
fs.writeFileSync(path.join(out, "index.html"), page);
collect(page);

let copied = 0, bytes = 0;
for (const u of used) {
  const src = path.join(root, "public", u);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(path.join(out, u)), { recursive: true });
  fs.copyFileSync(src, path.join(out, u));
  copied++; bytes += fs.statSync(src).size;
}
const pageKB = (fs.statSync(path.join(out, "index.html")).size / 1024).toFixed(0);
console.log(`demo-dist: index.html ${pageKB} KB (CSS+JS+fonts inline) + ${copied} media files, ${(bytes / 1e6).toFixed(1)} MB`);
