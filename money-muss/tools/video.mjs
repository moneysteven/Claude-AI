// Web copies of the owner's video clips:  npm run video
//
// For each clip in tools/clips.mjs whose original is in video/source:
//   1. the part that is used is cut out, turned the right way up, cropped to its frame and sized;
//   2. iPhone HDR footage is brought down to ordinary (SDR) colour, so it looks right in every browser;
//   3. it gets the same warm grade as the photos (or the crimson two-tone, for the bar), with the same vignette;
//   4. it is saved twice, as AV1 (small, for browsers that play it) and H.264 (plays everywhere), with no sound;
//   5. its first frame is saved as a still (AVIF, WebP, JPG). The still is what shows until the video plays,
//      and all that shows for visitors who prefer less motion or are saving data.
// video/manifest.json lists what was made; "npm run build" writes the clips into the page from it.
//
// Needs ffmpeg and ffprobe on the computer (they are not npm packages). The originals stay out of git; when an
// original is not here, its web copies in video/opt are kept as they are.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CLIPS, SOURCE_EXTENSIONS } from './clips.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = join(ROOT, 'video', 'source');
const OPT = join(ROOT, 'video', 'opt');
const MANIFEST = join(ROOT, 'video', 'manifest.json');
const FPS = 30;
const VERSION = 5;            // bump to re-make every clip

// The same grade as the photos (see GRADE and DUO in tools/build.mjs).
const GRADE = { saturation: 1.06, gain: [0.945, 0.93, 0.895], lift: [15, 12, 10], vignette: 0.26 };
const DUO = { stops: [[0, [0x1c, 0x0a, 0x0c]], [0.55, [0x8e, 0x1b, 0x1b]], [1, [0xb5, 0x33, 0x2d]]], vignette: 0.42 };
const VIGNETTE_COLOUR = [0x1a, 0x0d, 0x0a];

const log = (...a) => console.log(...a);
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

function need(tool) {
  const r = spawnSync(tool, ['-version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`\n  ${tool} is not installed. It is needed to make the web copies of the videos.\n  Install it (for example "brew install ffmpeg" or "sudo apt install ffmpeg") and run "npm run video" again.\n`);
    process.exit(1);
  }
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function findSource(name) {
  for (const ext of SOURCE_EXTENSIONS) for (const e of [ext, ext.toUpperCase()]) {
    const file = join(SRC, `${name}.${e}`);
    if (existsSync(file)) return file;
  }
  return null;
}

// The vignette, the same radial gradient the photos get: 0 inside 55% of the way out, rising to `strength` at the edge.
function vignetteMask(w, h, strength) {
  const mask = new Float32Array(w * h);
  if (!strength) return mask;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (x + 0.5 - w / 2) / (0.75 * w);
      const dy = (y + 0.5 - h / 2) / (0.75 * h);
      const t = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 0.55) / 0.45));
      mask[y * w + x] = t * strength;
    }
  }
  return mask;
}

function warm(frame, mask) {
  const { saturation: s, gain, lift } = GRADE;
  for (let i = 0, p = 0; i < frame.length; i += 3, p += 1) {
    const r = frame[i], g = frame[i + 1], b = frame[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const a = mask[p];
    for (let c = 0; c < 3; c += 1) {
      let v = y + ((c === 0 ? r : c === 1 ? g : b) - y) * s;
      v = v * gain[c] + lift[c];
      v = v * (1 - a) + VIGNETTE_COLOUR[c] * a;
      frame[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return frame;
}

// The two-tone: brightness only, stretched over the whole clip's range (so it does not flicker), mapped onto the crimson stops.
function duoTable(frames) {
  const hist = new Float64Array(256);
  let count = 0;
  for (const f of frames) for (let i = 0; i < f.length; i += 3) { hist[Math.round(0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2])] += 1; count += 1; }
  const at = (share) => { let seen = 0; for (let v = 0; v < 256; v += 1) { seen += hist[v]; if (seen >= count * share) return v; } return 255; };
  const lo = at(0.01), hi = Math.max(lo + 1, at(0.99));
  const lut = [];
  for (let v = 0; v < 256; v += 1) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))) ** 0.92;
    let k = 0; while (k < DUO.stops.length - 2 && t > DUO.stops[k + 1][0]) k += 1;
    const [t0, c0] = DUO.stops[k], [t1, c1] = DUO.stops[k + 1];
    const f = (t - t0) / (t1 - t0);
    lut.push(c0.map((c, n) => c + (c1[n] - c) * f));
  }
  return lut;
}
function duo(frame, lut, mask) {
  for (let i = 0, p = 0; i < frame.length; i += 3, p += 1) {
    const c = lut[Math.round(0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2])];
    const a = mask[p];
    for (let n = 0; n < 3; n += 1) frame[i + n] = c[n] * (1 - a) + VIGNETTE_COLOUR[n] * a;
  }
  return frame;
}

// Blurs and darkens a band right across the frame (soft at its edges), for anything that must not be made out.
function soften(frame, w, h, band) {
  const top = Math.max(0, Math.floor(band[0] * h));
  const bottom = Math.min(h, Math.ceil(band[1] * h));
  const feather = Math.max(1, Math.round(0.035 * h));
  const r = Math.max(4, Math.round(w * 0.03));
  const from = Math.max(0, top - feather);
  const to = Math.min(h, bottom + feather);
  const rows = to - from;
  const src = Float32Array.from(frame.subarray(from * w * 3, to * w * 3));
  const tmp = new Float32Array(src.length);
  const blurPass = (a, b) => {          // three box blurs, across then down: close to a gaussian
    for (let y = 0; y < rows; y += 1) for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let x = -r; x <= r; x += 1) sum += a[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
      for (let x = 0; x < w; x += 1) {
        b[(y * w + x) * 3 + c] = sum / (2 * r + 1);
        sum += a[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - a[(y * w + Math.max(0, x - r)) * 3 + c];
      }
    }
    for (let x = 0; x < w; x += 1) for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) sum += b[(Math.min(rows - 1, Math.max(0, y)) * w + x) * 3 + c];
      for (let y = 0; y < rows; y += 1) {
        a[(y * w + x) * 3 + c] = sum / (2 * r + 1);
        sum += b[(Math.min(rows - 1, y + r + 1) * w + x) * 3 + c] - b[(Math.max(0, y - r) * w + x) * 3 + c];
      }
    }
  };
  const blurred = Float32Array.from(src);
  for (let k = 0; k < 3; k += 1) blurPass(blurred, tmp);
  for (let y = from; y < to; y += 1) {
    const edge = y < top ? (y - from) / feather : y >= bottom ? (to - 1 - y) / feather : 1;
    const t = Math.max(0, Math.min(1, edge));
    const keep = 1 - 0.35 * t;          // darkened as well as blurred
    for (let x = 0; x < w; x += 1) for (let c = 0; c < 3; c += 1) {
      const i = (y * w + x) * 3 + c;
      const j = ((y - from) * w + x) * 3 + c;
      frame[i] = (src[j] * (1 - t) + blurred[j] * t) * keep;
    }
  }
  return frame;
}

// Reads the cut, cropped, sized and tone-mapped frames from ffmpeg, one Buffer per frame.
async function* decode(file, clip, shape, info) {
  const [aw, ah] = shape.aspect;
  const want = aw / ah;
  let cw = info.w, ch = info.h;
  if (info.w / info.h > want) cw = info.h * want; else ch = info.w / want;
  cw = even(cw); ch = even(ch);
  const x = even((info.w - cw) / 2);
  const y = even((info.h - ch) * (shape.focus ?? 0.5));
  const outW = even(shape.width);
  const outH = even(shape.width / want);
  const hdr = ['arib-std-b67', 'smpte2084'].includes(info.transfer);
  const toRgb = hdr
    ? 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=pc,format=rgb24'
    : 'scale=out_color_matrix=bt709:out_range=pc,format=rgb24';
  const filters = `fps=${FPS / clip.speed},crop=${cw}:${ch}:${x}:${y},scale=${outW}:${outH}:flags=lanczos,${toRgb}`;
  const args = ['-v', 'error', '-ss', String(clip.from || 0)];
  if (clip.to) args.push('-t', String(clip.to - (clip.from || 0)));
  args.push('-i', file, '-map', '0:v:0', '-vf', filters, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  const size = outW * outH * 3;
  let pending = Buffer.alloc(0);
  for await (const chunk of ff.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      yield { frame: Buffer.from(pending.subarray(0, size)), w: outW, h: outH };
      pending = pending.subarray(size);
    }
  }
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) throw new Error(`ffmpeg could not read ${file}`);
}

function encoder(kind, w, h, out) {
  const input = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-'];
  const colour = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv:in_range=pc,format=yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
  const codec = kind === 'av1'
    ? ['-c:v', 'libsvtav1', '-preset', '5', '-crf', '40', '-g', '150']
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high', '-level:v', '3.1', '-g', '60', '-tag:v', 'avc1'];
  const ff = spawn('ffmpeg', [...input, ...colour, ...codec, '-an', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'inherit'], env: { ...process.env, SVT_LOG: '1' } });      // the AV1 encoder: errors only
  const done = new Promise((r, j) => ff.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg could not write ${out}`)))));
  return {
    write: (buf) => (ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r))),
    end: () => { ff.stdin.end(); return done; },
  };
}

// What a browser is asked ("can you play this?") before it is given the file.
function codecString(file, kind) {
  const v = probe(file).streams.find((s) => s.codec_type === 'video');
  if (kind === 'h264') {
    const profile = { High: '64', Main: '4D', 'Constrained Baseline': '42', Baseline: '42' }[v.profile] || '64';
    return `avc1.${profile}00${Number(v.level).toString(16).toUpperCase().padStart(2, '0')}`;
  }
  // AV1 Main profile, 8-bit. Level from the picture size at 30 frames a second: 3.0 up to 665,856 pixels, 3.1 up to 1,065,024.
  const level = v.width * v.height <= 665856 ? '04' : v.width * v.height <= 1065024 ? '05' : '08';
  return `av01.0.${level}M.08`;
}

const stillFiles = (still) => Object.values(still).filter((v) => typeof v === 'string');

async function makeClip(clip, file, old) {
  const st = await stat(file);
  const stamp = JSON.stringify({ VERSION, size: st.size, time: Math.round(st.mtimeMs), clip, GRADE: clip.look === 'warm' ? GRADE : DUO });
  const p = probe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const rotation = Math.abs(Number(((v.side_data_list || []).find((d) => d.rotation !== undefined) || {}).rotation || (v.tags && v.tags.rotate) || 0)) % 180;
  const info = { w: rotation === 90 ? v.height : v.width, h: rotation === 90 ? v.width : v.height, transfer: v.color_transfer, duration: Number(p.format.duration) };
  const outputs = [];
  const fresh = old && old.stamp === stamp && old.shapes.every((s) => s.files.every((f) => existsSync(join(ROOT, f.src))) && stillFiles(s.still).every((f) => existsSync(join(ROOT, f))));
  if (fresh) { log(`  video  ${clip.name}  [unchanged]`); return old; }

  for (const shape of clip.shapes) {
    const base = `${clip.name}-${shape.key}`;
    let frames = [];
    let w = 0, h = 0;
    const mask = { m: null };
    const av1 = { file: join(OPT, `${base}.av1.mp4`) };
    const h264 = { file: join(OPT, `${base}.h264.mp4`) };
    let encoders = null;
    let first = null;
    let count = 0;
    const streaming = clip.loop === 'forward' && clip.look === 'warm';
    for await (const f of decode(file, clip, shape, info)) {
      if (!mask.m) { w = f.w; h = f.h; mask.m = vignetteMask(w, h, clip.look === 'duo' ? DUO.vignette : GRADE.vignette); }
      if (streaming) {
        const out = warm(f.frame, mask.m);
        if (!encoders) encoders = [encoder('av1', w, h, av1.file), encoder('h264', w, h, h264.file)];
        if (!first) first = Buffer.from(out);
        await Promise.all(encoders.map((e) => e.write(out)));
        count += 1;
      } else frames.push(shape.soften ? soften(f.frame, f.w, f.h, shape.soften) : f.frame);
    }
    if (!streaming) {
      if (clip.look === 'duo') { const lut = duoTable(frames); frames = frames.map((f) => duo(f, lut, mask.m)); } else frames = frames.map((f) => warm(f, mask.m));
      // Forward, then back again without repeating the turning frames: the loop has no seam.
      const order = clip.loop === 'boomerang' ? [...frames, ...frames.slice(1, -1).reverse()] : frames;
      encoders = [encoder('av1', w, h, av1.file), encoder('h264', w, h, h264.file)];
      first = frames[0];
      for (const f of order) { await Promise.all(encoders.map((e) => e.write(f))); count += 1; }
    }
    await Promise.all(encoders.map((e) => e.end()));

    // The still at full size and at 70% (for small frames and small screens), in three formats.
    const still = { width: w, height: h };
    const smallW = even(w * 0.7);
    const img = (width) => { const s = sharp(first, { raw: { width: w, height: h, channels: 3 } }); return width === w ? s : s.resize({ width }); };
    for (const [ext, run] of [['avif', (s) => s.avif({ quality: 52, effort: 4 })], ['webp', (s) => s.webp({ quality: 78, effort: 5 })], ['jpg', (s) => s.jpeg({ quality: 80, mozjpeg: true })]]) {
      await run(img(w)).toFile(join(OPT, `${base}-still.${ext}`));
      await run(img(smallW)).toFile(join(OPT, `${base}-still-small.${ext}`));
      still[ext] = `video/opt/${base}-still.${ext}`;
      still[`${ext}Small`] = `video/opt/${base}-still-small.${ext}`;
    }
    still.smallWidth = smallW;
    const files = [
      { src: `video/opt/${base}.av1.mp4`, type: `video/mp4; codecs="${codecString(av1.file, 'av1')}"`, bytes: (await stat(av1.file)).size },
      { src: `video/opt/${base}.h264.mp4`, type: `video/mp4; codecs="${codecString(h264.file, 'h264')}"`, bytes: (await stat(h264.file)).size },
    ];
    outputs.push({ key: shape.key, media: shape.media || '', width: w, height: h, seconds: Math.round((count / FPS) * 100) / 100, files, still });
    log(`  video  ${base}  ${w}x${h}, ${(count / FPS).toFixed(1)}s ${clip.loop}  AV1 ${(files[0].bytes / 1024).toFixed(0)} KB, H.264 ${(files[1].bytes / 1024).toFixed(0)} KB`);
  }
  return { present: true, source: `video/source/${file.split('/').pop()}`, stamp, look: clip.look, loop: clip.loop, shapes: outputs };
}

async function main() {
  need('ffmpeg'); need('ffprobe');
  await mkdir(OPT, { recursive: true });
  const old = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
  const manifest = {};
  log('Money Muss videos');
  for (const clip of CLIPS) {
    const file = findSource(clip.name);
    if (file) { manifest[clip.name] = await makeClip(clip, file, old[clip.name]); continue; }
    const kept = old[clip.name];
    if (kept && kept.present && kept.shapes.every((s) => s.files.every((f) => existsSync(join(ROOT, f.src))))) {
      manifest[clip.name] = kept;
      log(`  video  ${clip.name}  [original not in video/source: the web copies already made are kept]`);
    } else {
      manifest[clip.name] = { present: false };
      log(`  video  ${clip.name}  MISSING: put the original in video/source/${clip.name}.mov (the frame is left off the page until then)`);
    }
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  log('Done. Run "npm run build" to put them in the page.');
}

main().catch((e) => { console.error(e); process.exit(1); });
