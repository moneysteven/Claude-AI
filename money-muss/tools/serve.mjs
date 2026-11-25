// Tiny static server for previewing the site locally:  npm run dev
// (The live site needs no server-side code; any static host works.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, clean);
  if (!file.startsWith(ROOT)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  // Keep build tooling and dependencies out of what the preview serves.
  const blocked = file && /[/\\](node_modules|tools)[/\\]/.test(file);
  if (!file || blocked) {
    const body = await readFile(join(ROOT, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  let body = await readFile(file);
  const longLived = /\.(woff2|avif|webp|jpg|jpeg|png|svg)$/i.test(file);
  const headers = {
    'content-type': type,
    'cache-control': longLived ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  // Compress text the way any real host does, so local speed tests are realistic.
  const text = /^(text\/|application\/(json|manifest\+json|xml)|image\/svg)/.test(type);
  if (text && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, () => {
  console.log(`Money Muss preview: http://localhost:${PORT}`);
});
