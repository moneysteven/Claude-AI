// Writes a single self-contained simulator page (audio embedded) to share:
//   npm run simulator -- path/to/call-simulator.html
const fs = require('fs');
const { render } = require('../src/simulator');

const out = process.argv[2] || 'call-simulator.html';
fs.writeFileSync(out, render({ embedAudio: true, wrap: false }));
console.log(`Simulator written to ${out}`);
