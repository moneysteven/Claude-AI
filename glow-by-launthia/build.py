#!/usr/bin/env python3
"""Build the Glow by Launthia site.

  python3 build.py                      -> index.html: one self-contained file, every photo and clip the page
                                           uses inlined as a data URI (three.js still loads from cdnjs)
  python3 build.py --fragment out.html  -> the same, body-only, for hosts that add their own <html>/<head>
  python3 build.py --dist               -> dist/: the optimised site for hosting. Photos as AVIF / WebP / JPEG
                                           at several widths (<picture> + srcset/sizes, lazy below the first
                                           screen), clips as H.264 MP4 + VP9 WebM with posters, the app script
                                           and three.js deferred, fonts preloaded, CSS and JS minified.
                                           Add "--fragment out.html" to also write its body-only page.

CSS is minified here; JavaScript through tools/minify-js.js (needs Node; minifies only if the TypeScript
compiler is installed, otherwise the code is kept as is).
"""
import base64
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4"}
HEAD = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')


# ---------------------------------------------------------------- minifying
def min_css(css: str) -> str:
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};,>])\s*', r'\1', css)
    return css.replace(';}', '}').strip()


def min_js(js: str) -> str:
    # a leading "... SETTINGS ..." comment (the booking hours block) stays, so the settings keep their instructions
    head = re.match(r'\s*(/\*[^*]*?SETTINGS.*?\*/)\s*', js, re.S)
    keep = head.group(1) + '\n' if head else ''
    try:
        r = subprocess.run(['node', str(HERE / 'tools' / 'minify-js.js')], input=js, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and r.stdout.strip():
            return keep + r.stdout
    except (OSError, subprocess.TimeoutExpired):
        pass
    return js


def minify_page(html: str) -> str:
    html = re.sub(r'<style>(.*?)</style>', lambda m: '<style>' + min_css(m.group(1)) + '</style>', html, flags=re.S)
    def js(m):
        body = m.group(1)
        if len(body) < 400: return m.group(0)
        return '<script>' + min_js(body) + '</script>'
    return re.sub(r'<script>(.*?)</script>', js, html, flags=re.S)


# ---------------------------------------------------------------- single file
def build() -> str:
    page = (HERE / "src" / "page.html").read_text(encoding="utf-8")
    media = {}
    for f in sorted((HERE / "assets").iterdir()):
        mime = TYPES.get(f.suffix.lower())
        # only files the page names (as "key" or 'key'), so unused photos never weigh down the download
        if mime and (f'"{f.stem}"' in page or f"'{f.stem}'" in page):
            media[f.stem] = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode("ascii")
    marker = "/*MEDIA*/{}"
    if marker not in page:
        sys.exit("media marker not found in src/page.html")
    page = minify_page(page)
    page = page.replace(marker, json.dumps(media, separators=(",", ":")))
    return inline_vendor(page)


def inline_vendor(page: str) -> str:
    """single file: three.js and the font files are embedded, so nothing loads from another site"""
    page = re.sub(r'<link rel="preload" as="font"[^>]*>\n?', '', page)
    def font(m):
        f = HERE / 'vendor' / 'fonts' / m.group(1)
        return 'url(data:font/woff2;base64,' + base64.b64encode(f.read_bytes()).decode('ascii') + ')'
    page = re.sub(r'url\(["\']?vendor/fonts/([\w.-]+\.woff2)["\']?\)', font, page)
    three = (HERE / 'vendor' / 'three.min.js').read_text(encoding='utf-8')
    tag = '<script src="vendor/three.min.js"></script>'
    assert tag in page, 'three.js tag'
    return page.replace(tag, '<script>' + three.replace('</script', '<\\/script') + '</script>', 1)


# ---------------------------------------------------------------- optimised multi-file build
WIDTHS = [480, 800, 1200]


def widths_for(natural: int) -> list:
    ws = [w for w in WIDTHS if w < natural * 0.9]
    return ws + [natural]


def encode_images(keys, media_dir: pathlib.Path) -> dict:
    from PIL import Image
    out = {}
    for key in keys:
        src = HERE / 'assets' / f'{key}.webp'
        im = Image.open(src).convert('RGB')
        ws = widths_for(im.width)
        for w in ws:
            h = round(im.height * w / im.width)
            r = im if w == im.width else im.resize((w, h), Image.LANCZOS)
            for ext, kw in (('avif', dict(quality=58, speed=4)), ('webp', dict(quality=82, method=6)),
                            ('jpg', dict(quality=84, optimize=True, progressive=True))):
                f = media_dir / f'{key}-{w}.{ext}'
                if not f.exists() or f.stat().st_mtime < src.stat().st_mtime:
                    r.save(f, **kw)
        out[key] = {'w': im.width, 'h': im.height, 'widths': ws}
    return out


def encode_videos(keys, posters, media_dir: pathlib.Path) -> None:
    for key in keys:
        src = HERE / 'assets' / f'{key}.mp4'
        jobs = {
            # the clips are already compact H.264: keep the stream, drop any audio, index at the front for quick start
            f'{key}.mp4': ['-an', '-c:v', 'copy', '-movflags', '+faststart'],
            f'{key}.webm': ['-an', '-c:v', 'libvpx-vp9', '-crf', '42', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2'],
        }
        for name, args in jobs.items():
            f = media_dir / name
            if not f.exists() or f.stat().st_mtime < src.stat().st_mtime:
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), *args, str(f)], check=True)
    from PIL import Image
    for key in posters:
        src = HERE / 'assets' / f'{key}.webp'
        f = media_dir / f'{key}.jpg'
        if not f.exists() or f.stat().st_mtime < src.stat().st_mtime:
            Image.open(src).convert('RGB').save(f, quality=82, optimize=True, progressive=True)


def attrs_of(tag: str) -> list:
    return re.findall(r'\s([\w:-]+)(?:="([^"]*)")?', tag[len('<img'):-1] if tag.startswith('<img') else tag)


# how wide each photo is drawn, by the container it sits in (for the browser to pick the right file)
SIZES = [
    ('hero-fallback', None),
    ('zoom-frame', '(min-width:900px) 56vh, 100vw'),
    ('zs"', '(min-width:760px) 10vw, 25vw'),
    ('about-stage', '(min-width:960px) 500px, 92vw'),
    ('svc-ph', '(min-width:860px) 200px, (min-width:600px) 22vw, 46vw'),
    ('svc-media', '(min-width:860px) 400px, (min-width:600px) 44vw, 92vw'),
    ('bridal-art', '(min-width:960px) 520px, 72vw'),
    ('bridal-photo', '(min-width:960px) 230px, 34vw'),
    ('bk-thumb', '56px'),
    ('foot-avatar', '48px'),
]


def sizes_for(html: str, pos: int, tag: str) -> str:
    if 'foot-avatar' in tag: return '48px'
    ctx = html[max(0, pos - 400):pos]
    best, at = '100vw', -1
    for marker, sz in SIZES:
        i = ctx.rfind(marker)
        if i > at and sz: best, at = sz, i
    return best


def build_dist(fragment_out=None) -> None:
    dist = HERE / 'dist'; media_dir = dist / 'media'; media_dir.mkdir(parents=True, exist_ok=True)
    page = (HERE / 'src' / 'page.html').read_text(encoding='utf-8')
    img_keys = sorted(set(re.findall(r'<img[^>]*\sdata-media="([^"]+)"', page)) | set(re.findall(r'data-thumb="([^"]+)"', page)))
    vid = re.findall(r'<video[^>]*\sdata-media="([^"]+)"[^>]*\sdata-poster="([^"]+)"', page)
    info = encode_images(img_keys, media_dir)
    encode_videos([k for k, _ in vid], [p for _, p in vid], media_dir)

    # <img data-media> -> <picture> with AVIF, WebP and JPEG at every width
    def picture(m):
        tag = m.group(0); key = re.search(r'data-media="([^"]+)"', tag).group(1); i = info[key]
        a = re.sub(r'\sdata-media="[^"]*"', '', tag)
        a = re.sub(r'\s(loading|decoding|fetchpriority)="[^"]*"', '', a)
        if ' width=' not in a: a = a.replace('<img', f'<img width="{i["w"]}" height="{i["h"]}"', 1)
        if 'hero-photo' in tag:
            # the hero photo: the very file the WebGL backdrop uses (one download), fetched first
            src = f'media/{key}-{i["w"]}.webp'
            return a[:-1] + f' src="{src}" fetchpriority="high" decoding="async">'
        sz = sizes_for(page, m.start(), tag); ws = i['widths']
        ss = lambda ext: ', '.join(f'media/{key}-{w}.{ext} {w}w' for w in ws)
        fallback = f'media/{key}-{ws[min(1, len(ws) - 1)]}.jpg'
        cors = ' crossorigin="anonymous"' if 'about-photo' in tag else ''   # drawn into WebGL as a texture
        img = a[:-1] + f' src="{fallback}" srcset="{ss("jpg")}" sizes="{sz}" loading="lazy" decoding="async"{cors}>'
        return (f'<picture><source type="image/avif" srcset="{ss("avif")}" sizes="{sz}">'
                f'<source type="image/webp" srcset="{ss("webp")}" sizes="{sz}">{img}</picture>')
    html = re.sub(r'<img[^>]*\sdata-media="[^"]+"[^>]*>', picture, page)

    # <video data-media data-poster> -> WebM + MP4 sources and a JPEG poster
    def video(m):
        tag, key, poster = m.group(0), m.group(1), m.group(2)
        open_tag = re.sub(r'\sdata-(media|poster)="[^"]*"', '', tag[:tag.index('>') + 1])
        pre = 'auto' if key == 'intro-montage' else 'metadata'   # the intro clip plays four seconds in
        open_tag = re.sub(r'\spreload="[^"]*"', '', open_tag)[:-1] + f' preload="{pre}" poster="media/{poster}.jpg"' + (' crossorigin="anonymous"' if key == 'intro-montage' else '') + '>'
        return open_tag + f'<source src="media/{key}.webm" type="video/webm"><source src="media/{key}.mp4" type="video/mp4"></video>'
    html = re.sub(r'<video[^>]*\sdata-media="([^"]+)"[^>]*\sdata-poster="([^"]+)"[^>]*></video>', video, html)

    # head: the hero photo first; deferred scripts
    hero = info.get('hero-portrait')
    if hero:
        anchor = '<link rel="preload" as="font"'
        assert anchor in html, 'font preload'
        html = html.replace(anchor, f'<link rel="preload" as="image" href="media/hero-portrait-{hero["w"]}.webp" fetchpriority="high">\n' + anchor, 1)
    html = html.replace('<style>', '<style>picture{display:contents}', 1)

    # the main app (needs three.js) becomes app.js; both deferred, in order
    import shutil
    (dist / 'vendor' / 'fonts').mkdir(parents=True, exist_ok=True)
    shutil.copy2(HERE / 'vendor' / 'three.min.js', dist / 'vendor' / 'three.min.js')
    for f in (HERE / 'vendor' / 'fonts').glob('*.woff2'): shutil.copy2(f, dist / 'vendor' / 'fonts' / f.name)
    three = '<script src="vendor/three.min.js"></script>'
    assert three in html, 'three.js tag'
    i = html.index(three) + len(three)
    m = re.compile(r'\s*<script>(.*?)</script>', re.S).match(html, i); assert m, 'app script'
    app = m.group(1)
    media = {}
    for key, v in info.items():
        media[key] = f'media/{key}-{v["w"] if key == "hero-portrait" else v["widths"][min(1, len(v["widths"]) - 1)]}.webp'
    for _, p in vid: media[p] = f'media/{p}.jpg'
    tail = re.search(r'<script>window\.GLOW && GLOW\.mediaReady\(/\*MEDIA\*/\{\}\);</script>', html); assert tail
    app += '\nwindow.GLOW && GLOW.mediaReady(' + json.dumps(media, separators=(',', ':')) + ');\n'
    html = html[:tail.start()] + html[tail.end():]
    html = html[:i] + html[m.end():]
    html = html.replace(three, three.replace('></script>', ' defer></script>') + '\n<script src="app.js" defer></script>', 1)
    (dist / 'app.js').write_text(min_js(app), encoding='utf-8')
    html = minify_page(html)
    (dist / 'index.html').write_text(HEAD + html + '\n</html>\n', encoding='utf-8')
    if fragment_out:
        pathlib.Path(fragment_out).write_text(html, encoding='utf-8')
    total = sum(f.stat().st_size for f in dist.rglob('*') if f.is_file())
    print(f'wrote {dist} ({len(list(media_dir.iterdir()))} media files, {total / 1e6:.2f} MB on disk; '
          f'page {len(html.encode()) / 1e3:.0f} KB, app.js {(dist / "app.js").stat().st_size / 1e3:.0f} KB)')


def main() -> None:
    args = sys.argv[1:]
    if '--dist' in args:
        frag = args[args.index('--fragment') + 1] if '--fragment' in args else None
        build_dist(frag); return
    html = build()
    if len(args) == 2 and args[0] == "--fragment":
        out = pathlib.Path(args[1])
        out.write_text(html, encoding="utf-8")
    else:
        out = HERE / "index.html"
        out.write_text(HEAD + html + "\n</html>\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
