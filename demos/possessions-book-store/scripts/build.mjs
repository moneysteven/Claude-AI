// Builds the static site into ./dist
//  - CSS minified and inlined (no render-blocking request)
//  - UI script minified and inlined at the end of <body>
//  - 3D header (three.js, tree-shaken) minified into a hashed, deferred file
//  - only the font weights actually used are copied; first-screen fonts are preloaded
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const target = ['es2020', 'chrome90', 'safari15', 'firefox90', 'edge90'];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
await fs.mkdir(path.join(dist, 'fonts'), { recursive: true });
await fs.mkdir(path.join(dist, 'img'), { recursive: true });

const read = (p) => fs.readFile(path.join(src, p), 'utf8');

// fonts (woff2, latin subset only)
const fonts = {
  'cormorant-garamond-500.woff2': ['cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2'],
  'cormorant-garamond-500-italic.woff2': ['cormorant-garamond', 'cormorant-garamond-latin-500-italic.woff2'],
  'jost-400.woff2': ['jost', 'jost-latin-400-normal.woff2'],
  'jost-500.woff2': ['jost', 'jost-latin-500-normal.woff2'],
  'pinyon-script-400.woff2': ['pinyon-script', 'pinyon-script-latin-400-normal.woff2'],
};
for (const [out, [pkg, file]] of Object.entries(fonts)) {
  await fs.copyFile(path.join(root, 'node_modules/@fontsource', pkg, 'files', file), path.join(dist, 'fonts', out));
}
const preload = ['jost-500.woff2', 'cormorant-garamond-500.woff2', 'pinyon-script-400.woff2']
  .map((f) => `<link rel="preload" href="fonts/${f}" as="font" type="font/woff2" crossorigin>`)
  .join('\n');

// static files
for (const f of await fs.readdir(path.join(src, 'static/img'))) {
  await fs.copyFile(path.join(src, 'static/img', f), path.join(dist, 'img', f));
}
await fs.copyFile(path.join(src, 'static/favicon.svg'), path.join(dist, 'favicon.svg'));

// css
const css = (await esbuild.transform(await read('styles.css'), { loader: 'css', minify: true, target: ['chrome90', 'safari15', 'firefox90'] })).code.trim();

// ui script
const app = await esbuild.build({
  entryPoints: [path.join(src, 'app.js')], bundle: true, minify: true, format: 'iife', target, write: false, legalComments: 'none',
});
const appCode = app.outputFiles[0].text.trim().replace(/<\/script/gi, '<\\/script');

// 3d header
const scene = await esbuild.build({
  entryPoints: [path.join(src, 'scene.js')], bundle: true, minify: true, format: 'iife', target, write: false,
  treeShaking: true, legalComments: 'eof', define: { 'process.env.NODE_ENV': '"production"' },
});
const sceneCode = scene.outputFiles[0].contents;
const hash = crypto.createHash('sha256').update(sceneCode).digest('hex').slice(0, 10);
const sceneName = `assets/scene.${hash}.js`;
await fs.writeFile(path.join(dist, sceneName), sceneCode);

// html
const meta = JSON.parse(await read('generated/meta.json'));
let html = await read('index.html');
const swap = {
  '@@FONT_PRELOADS@@': preload,
  '@@CSS@@': css,
  '@@APP@@': appCode,
  '@@SCENE_SRC@@': sceneName,
  '@@SPRITE@@': (await read('generated/sprite.html')).trim(),
  '@@WORDMARK@@': (await read('generated/wordmark.html')).trim(),
  '@@RING@@': (await read('generated/ring.html')).trim(),
  '@@CAPS_VB@@': `${meta.capsW} ${meta.capsH}`,
};
for (const [k, v] of Object.entries(swap)) html = html.split(k).join(v);
if (/@@[A-Z_]+@@/.test(html)) throw new Error('unreplaced token: ' + html.match(/@@[A-Z_]+@@/)[0]);
html = html.replace(/<!--(?!\[)[\s\S]*?-->/g, '').replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n');
await fs.writeFile(path.join(dist, 'index.html'), html);

// host hints (Netlify / Cloudflare Pages); harmless elsewhere
await fs.writeFile(path.join(dist, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=604800
`);
await fs.writeFile(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const zlib = await import('node:zlib');
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
console.log('index.html', kb(Buffer.byteLength(html)), '(gzip', kb(gz(html)) + ')');
console.log(sceneName, kb(sceneCode.length), '(gzip', kb(gz(sceneCode)) + ')');
console.log('inline css', kb(css.length), '· inline js', kb(appCode.length));
