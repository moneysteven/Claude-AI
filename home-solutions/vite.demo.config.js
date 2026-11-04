// Build for the claude.ai Artifact preview (scripts/make-demo.mjs). The preview
// runs inside a sandboxed frame with an opaque ("null") origin, where module
// scripts and crossorigin stylesheets/fonts are blocked by CORS. So this build
// emits ONE classic (IIFE) script with every dynamic import inlined and fonts
// inlined as data URIs; make-demo then inlines the CSS and JS into the page.
import base from "./vite.config.js";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: "dist-demo",
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 400000,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
};
