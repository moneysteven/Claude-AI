// Writes a single self-contained simulator page (recordings embedded):
//   npm run simulator -- path/to/file.html              (fragment, for sharing as a preview)
//   npm run simulator -- ../docs/index.html --standalone (full web page, for GitHub Pages)
const fs = require('fs');
const path = require('path');
const { render } = require('../src/simulator');

const out = process.argv[2] || 'call-simulator.html';
const standalone = process.argv.includes('--standalone');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, render({ embedAudio: true, wrap: standalone }));
console.log(`Simulator written to ${out}`);
