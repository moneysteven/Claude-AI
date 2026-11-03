// Vite config + a small build-time renderer: every section's markup is
// generated from src/config.js (BUSINESS) in Node and injected into
// index.html, so all content is real HTML (readable without JS, crawlable),
// while behaviour is progressively enhanced by each section's index.js.
import { defineConfig } from "vite";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Order = page order. Each entry is a folder in src/sections/ with markup.js
// (default export: (ctx) => html string). Missing folders are skipped so the
// site builds while sections are in progress.
export const SECTIONS = [
  "header", "hero", "catalogue", "finishes", "estimator", "why", "beforeafter",
  "gallery", "showers", "reviews", "branches", "faq", "cta", "footer", "booking", "mobilebar", "jsonld",
];

async function renderSections() {
  const bust = `?t=${Date.now()}`;
  const { BUSINESS } = await import(pathToFileURL(path.resolve("src/config.js")).href + bust);
  const media = await import(pathToFileURL(path.resolve("src/lib/media.js")).href);
  const ui = await import(pathToFileURL(path.resolve("src/lib/ui.js")).href + bust);
  const fmt = await import(pathToFileURL(path.resolve("src/lib/format.js")).href);
  const hours = await import(pathToFileURL(path.resolve("src/lib/hours.js")).href);
  const contact = await import(pathToFileURL(path.resolve("src/lib/contact.js")).href);
  const icons = await import(pathToFileURL(path.resolve("src/lib/icons.js")).href + bust);
  const ctx = { B: BUSINESS, ...media, ...ui, fmt, hours, contact, icons, year: new Date().getFullYear() };
  const out = { header: "", main: "", after: "" };
  for (const name of SECTIONS) {
    const file = path.resolve("src/sections", name, "markup.js");
    if (!fs.existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href + bust);
    const html = await mod.default(ctx);
    const slot = name === "header" ? "header" : ["footer", "booking", "mobilebar", "jsonld"].includes(name) ? "after" : "main";
    out[slot] += `\n<!-- section:${name} -->\n${html}\n`;
  }
  return out;
}

const sectionsPlugin = () => ({
  name: "hs-sections",
  async transformIndexHtml(html) {
    const s = await renderSections();
    return html.replace("<!--@header-->", s.header).replace("<!--@main-->", s.main).replace("<!--@after-->", s.after);
  },
  handleHotUpdate({ file, server }) {
    if (/src[\\/](sections[\\/].+[\\/]markup|lib|config)/.test(file)) server.ws.send({ type: "full-reload" });
  },
});

export default defineConfig({
  plugins: [sectionsPlugin()],
  build: { target: "es2020", cssCodeSplit: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 600 },
  server: { host: true },
});
