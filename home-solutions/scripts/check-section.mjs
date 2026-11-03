// Usage: node scripts/check-section.mjs <section> [<section>...]
// Renders each section's markup.js with the real build ctx (no full build
// needed), checks the HTML for common mistakes, and bundles its index.js +
// style.css with esbuild to catch syntax/import errors. Exit 1 on problems.
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const imp = (p) => import(pathToFileURL(path.join(root, p)).href + `?t=${Date.now()}`);
const { BUSINESS } = await imp("src/config.js");
const ctx = { B: BUSINESS, ...(await imp("src/lib/media.js")), ...(await imp("src/lib/ui.js")), fmt: await imp("src/lib/format.js"),
  hours: await imp("src/lib/hours.js"), contact: await imp("src/lib/contact.js"), icons: await imp("src/lib/icons.js"), year: new Date().getFullYear() };

let bad = 0;
for (const name of process.argv.slice(2)) {
  const dir = path.join(root, "src/sections", name);
  const problems = [];
  if (fs.existsSync(path.join(dir, "markup.js"))) {
    try {
      const html = await (await imp(`src/sections/${name}/markup.js`)).default(ctx);
      if (typeof html !== "string" || !html.trim()) problems.push("markup returned empty/non-string");
      else {
        if (/undefined|\[object Object\]|NaN/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) problems.push("markup contains 'undefined' / '[object Object]' / 'NaN'");
        if (/lorem|ipsum/i.test(html)) problems.push("lorem ipsum found");
        const imgs = html.match(/<img\b[^>]*>/g) || [];
        imgs.filter((t) => !/\salt=/.test(t)).forEach((t) => problems.push("img without alt: " + t.slice(0, 80)));
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
        const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        if (dup.length) problems.push("duplicate ids: " + [...new Set(dup)].join(", "));
        // crude tag balance for common containers
        for (const t of ["section", "div", "ul", "ol", "li", "button", "a", "form", "header", "footer", "nav", "figure", "dialog", "table", "svg"]) {
          const o = (html.match(new RegExp(`<${t}[\\s>]`, "g")) || []).length, c = (html.match(new RegExp(`</${t}>`, "g")) || []).length;
          if (o !== c) problems.push(`<${t}> open ${o} / close ${c}`);
        }
        fs.mkdirSync(path.join(root, ".check"), { recursive: true });
        fs.writeFileSync(path.join(root, ".check", `${name}.html`), html);
        console.log(`${name}: markup ${html.length} chars -> .check/${name}.html`);
      }
    } catch (e) { problems.push("markup threw: " + (e.stack || e.message)); }
  }
  for (const f of ["index.js", "style.css"]) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    try {
      const r = await build({ entryPoints: [p], bundle: true, write: false, format: "esm", minify: true, logLevel: "silent", loader: { ".json": "json", ".woff2": "empty", ".woff": "empty", ".png": "empty", ".svg": "text" }, external: ["leaflet", "leaflet/*"] });
      const bytes = r.outputFiles.reduce((s, o) => s + o.contents.length, 0);
      console.log(`${name}/${f}: ok (${(bytes / 1024).toFixed(1)} KB minified incl. deps)`);
    } catch (e) { problems.push(`${f}: ${e.message}`); }
  }
  if (problems.length) { bad++; console.log(`${name}: PROBLEMS\n - ` + problems.join("\n - ")); }
}
process.exit(bad ? 1 : 0);
