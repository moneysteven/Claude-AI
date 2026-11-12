/* Minify JavaScript read from stdin: comments removed, every line trimmed of its indentation.
   Uses the TypeScript compiler's printer (a faithful re-print of the code, so behaviour is unchanged).
   If TypeScript isn't installed, the input is passed through untouched.
     node tools/minify-js.js < in.js > out.js */
const fs = require('fs');
const src = fs.readFileSync(0, 'utf8');
let ts = null;
for (const p of ['typescript', '/usr/local/lib/node_modules_global/typescript', '/usr/local/lib/node_modules/typescript', '/usr/lib/node_modules/typescript']) {
  try { ts = require(p); break; } catch (e) {}
}
if (!ts) { process.stdout.write(src); process.exit(0); }
const file = ts.createSourceFile('in.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let out = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(file);
/* leading indentation never matters in JS; only trim lines when no template literal could span them */
if (!out.includes('`')) out = out.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
process.stdout.write(out);
