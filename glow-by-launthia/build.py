#!/usr/bin/env python3
"""Build the Glow by Launthia site.

  python3 build.py                      -> index.html: one self-contained file, every photo and clip the page
                                           uses inlined as a data URI (three.js still loads from cdnjs)
  python3 build.py --fragment out.html  -> the same, body-only, for hosts that add their own <html>/<head>
  python3 build.py --dist               -> dist/: the optimised site for hosting. Photos as WebP / JPEG
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
# The website's own address, e.g. 'https://glowbylaunthia.com/' (with the slash at the end). Once it is set,
# the page gets a canonical link and a link-preview photo (og:image) for WhatsApp, Facebook and Google.
SITE_URL = ''
ICONS = HERE / 'assets-icons'
OWNER = HERE / 'src' / 'owner'
# the owner dashboard: in the single file and the preview it opens at #owner as its own full screen; on Hostinger it is /owner/
EARLY_VIEW = ("if(location.hash==='#owner'||/(^|[#&])(access_token|error_description)=/.test(location.hash))"
              "{document.documentElement.classList.add('owner-mode');window.GLOW_PAUSED=true;}")
EARLY_REDIRECT = ("(function(){function go(){var h=location.hash;"
                  "if(h==='#owner'||/(^|[#&])(access_token|error_description)=/.test(h))"
                  "location.replace('owner/'+(h==='#owner'?'':h));}go();addEventListener('hashchange',go);})();")


def owner_parts(page: str, mode: str) -> str:
    """'inline': the dashboard is part of this page (single file). 'external': same, with its script as a file
    loaded after app.js (the preview). 'none': not on this page; #owner goes to /owner/ (Hostinger)."""
    if mode == 'none':
        return (page.replace('/*OWNER-EARLY*/', EARLY_REDIRECT).replace('<!--OWNER-STYLE-->', '')
                .replace('<!--OWNER-APP-->', '').replace('<!--OWNER-SCRIPT-->', ''))
    script = ('<script>' + (OWNER / 'owner.js').read_text(encoding='utf-8') + '</script>') if mode == 'inline' \
        else '<script src="owner-core.js" defer></script>'
    return (page.replace('/*OWNER-EARLY*/', EARLY_VIEW)
            .replace('<!--OWNER-STYLE-->', '<style>' + (OWNER / 'owner.css').read_text(encoding='utf-8') + '</style>')
            .replace('<!--OWNER-APP-->', (OWNER / 'owner.html').read_text(encoding='utf-8'))
            .replace('<!--OWNER-SCRIPT-->', script))


# the site's claude.ai preview link ("Back to the site" on the owner dashboard's own preview link)
PREVIEW_URL = 'https://claude.ai/artifact/JrvFVTYVTuLCiAaBTHhaz1'

OWNER_HEAD = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Glow Dashboard</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#F7F2EC">
<link rel="manifest" href="/owner/manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Glow">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" as="font" type="font/woff2" href="/vendor/fonts/hanken-grotesk-normal-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/vendor/fonts/bodoni-moda-italic-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/owner/owner.css">
"""


def build_owner_page(dist: pathlib.Path, site_css: str, page: str) -> None:
    """dist/owner/: the dashboard on its own page, sharing the site's stylesheet (dist/assets/styles.css)"""
    (dist / 'assets').mkdir(exist_ok=True)
    (dist / 'assets' / 'styles.css').write_text(site_css.replace('url("vendor/fonts/', 'url("../vendor/fonts/'), encoding='utf-8')
    od = dist / 'owner'; od.mkdir(exist_ok=True)
    (od / 'owner.css').write_text(min_css((OWNER / 'owner.css').read_text(encoding='utf-8')), encoding='utf-8')
    cfg = dict(re.findall(r"^var (SUPABASE_URL|SUPABASE_ANON_KEY|OWNER_EMAIL|SOFT_GLAM_PRICE|FULL_GLAM_PRICE) = '([^']*)';", page, re.M))
    head = ("/* =========================================================================\n"
            "   OWNER DASHBOARD SETTINGS – the same values as the settings in the site's app.js.\n"
            "   ========================================================================= */\n\n"
            "/* Supabase Project URL, from Supabase > Project Settings > API. */\n"
            f"var SUPABASE_URL = '{cfg['SUPABASE_URL']}';\n\n"
            "/* Supabase \"anon public\" key. NEVER the service_role key or any other secret key. */\n"
            f"var SUPABASE_ANON_KEY = '{cfg['SUPABASE_ANON_KEY']}';\n\n"
            "/* The only account that can open this dashboard. */\n"
            f"var OWNER_EMAIL = '{cfg['OWNER_EMAIL']}';\n\n"
            "/* Starting prices, used only until her saved prices load from the database. */\n"
            f"var SOFT_GLAM_PRICE = '{cfg['SOFT_GLAM_PRICE']}';\n"
            f"var FULL_GLAM_PRICE = '{cfg['FULL_GLAM_PRICE']}';\n" + SETTINGS_END + "\n")
    (od / 'owner.js').write_text(min_js(head + (OWNER / 'owner.js').read_text(encoding='utf-8')), encoding='utf-8')
    body = (OWNER / 'owner.html').read_text(encoding='utf-8').replace('<div class="ow" id="owner" data-owner hidden>', '<div class="ow" id="owner" data-owner data-standalone>')
    (od / 'index.html').write_text(OWNER_HEAD + body + '\n<script src="/owner/owner.js" defer></script>\n</html>\n', encoding='utf-8')
    (od / '.htaccess').write_text(HTACCESS_OWNER, encoding='utf-8')
    # "Add to Home Screen": the dashboard opens like an app, with the Glow logo (PNG) as its icon
    import json as _json
    (od / 'manifest.webmanifest').write_text(_json.dumps({
        'name': 'Glow Dashboard', 'short_name': 'Glow', 'description': 'Glow by Launthia – bookings and Glow Club',
        'start_url': '/owner/', 'scope': '/owner/', 'display': 'standalone', 'orientation': 'portrait',
        'background_color': '#F7F2EC', 'theme_color': '#F7F2EC',
        'icons': [{'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
                  {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
                  {'src': '/apple-touch-icon.png', 'sizes': '180x180', 'type': 'image/png'}]}, indent=2), encoding='utf-8')
TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4"}
HEAD = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')


# ---------------------------------------------------------------- minifying
def min_css(css: str) -> str:
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};,>])\s*', r'\1', css)
    return css.replace(';}', '}').strip()


SETTINGS_END = '/* ===== END OF SETTINGS ===== */'


def min_js(js: str) -> str:
    # the settings block at the top of the main script stays word for word, comments and all
    keep = ''
    if SETTINGS_END in js:
        i = js.index(SETTINGS_END) + len(SETTINGS_END)
        keep, js = js[:i].strip('\n') + '\n', js[i:]
    try:
        r = subprocess.run(['node', str(HERE / 'tools' / 'minify-js.js')], input=js, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and r.stdout.strip():
            return keep + r.stdout
    except (OSError, subprocess.TimeoutExpired):
        pass
    return js


# Hostinger (Apache / LiteSpeed): always HTTPS, no folder listings, and browser security settings
HTACCESS_SECURITY = '''Options -Indexes
AddType application/manifest+json .webmanifest
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
<IfModule mod_headers.c>
Header always set Strict-Transport-Security "max-age=31536000"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=()"
Header always set Cross-Origin-Opener-Policy "same-origin-allow-popups"
</IfModule>
'''
HTACCESS_SITE = HTACCESS_SECURITY + '''<IfModule mod_headers.c>
Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>
# show the friendly "page not found" screen for any address that does not exist
ErrorDocument 404 /404.html
# the owner dashboard lives at /owner/
Redirect 301 /owner.html /owner/
'''
HTACCESS_OWNER = HTACCESS_SECURITY + '''<IfModule mod_headers.c>
Header always set X-Frame-Options "DENY"
Header always set X-Robots-Tag "noindex, nofollow"
Header always set Cache-Control "no-store"
</IfModule>
'''


def minify_page(html: str) -> str:
    html = re.sub(r'<style>(.*?)</style>', lambda m: '<style>' + min_css(m.group(1)) + '</style>', html, flags=re.S)
    def js(m):
        body = m.group(1)
        if len(body) < 400: return m.group(0)
        return '<script>' + min_js(body) + '</script>'
    return re.sub(r'<script>(.*?)</script>', js, html, flags=re.S)


# ---------------------------------------------------------------- single file
def read_page() -> str:
    """src/page.html with {{BUILD_DATE}} set to today's date, so a "Last updated" line shows the day of each new build."""
    import datetime
    d = datetime.date.today()
    return (HERE / "src" / "page.html").read_text(encoding="utf-8").replace("{{BUILD_DATE}}", f"{d.day} {d:%B %Y}")


def head_tags(page: str) -> str:
    """link-preview tags that need the site's full address (only when SITE_URL is set)"""
    tags = ''
    if SITE_URL:
        u = SITE_URL if SITE_URL.endswith('/') else SITE_URL + '/'
        tags = (f'<link rel="canonical" href="{u}">\n<meta property="og:url" content="{u}">\n'
                f'<meta property="og:image" content="{u}og-image.jpg">\n<meta property="og:image:width" content="1200">\n'
                f'<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="Glow by Launthia, makeup by Launthia Watson">')
    return page.replace('<!--SITE-URL-TAGS-->', tags)


def inline_icons(page: str) -> str:
    """single file: the favicons are embedded"""
    for name, src in (('icon-32.png', 'icon-32.png'), ('icon-192.png', 'icon-192.png'), ('apple-touch-icon.png', 'icon-180.png')):
        page = page.replace(f'href="{name}"', 'href="data:image/png;base64,' + base64.b64encode((ICONS / src).read_bytes()).decode('ascii') + '"')
    return page


def build() -> str:
    page = owner_parts(head_tags(read_page()), 'inline')
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
    return inline_icons(inline_vendor(page))


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
            for ext, kw in (('webp', dict(quality=82, method=6)),
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
    page = head_tags(read_page())
    img_keys = sorted(set(re.findall(r'<img[^>]*\sdata-media="([^"]+)"', page)) | set(re.findall(r'data-thumb="([^"]+)"', page)))
    vid = re.findall(r'<video[^>]*\sdata-media="([^"]+)"[^>]*\sdata-poster="([^"]+)"', page)
    info = encode_images(img_keys, media_dir)
    encode_videos([k for k, _ in vid], [p for _, p in vid], media_dir)

    # <img data-media> -> <picture> with WebP and JPEG at every width
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
        return (f'<picture>'
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
    # favicons, the friendly 404 page (served for any missing address by .htaccess), and the link-preview photo
    for src, name in (('icon-32.png', 'icon-32.png'), ('icon-192.png', 'icon-192.png'), ('icon-512.png', 'icon-512.png'), ('icon-180.png', 'apple-touch-icon.png')):
        shutil.copy2(ICONS / src, dist / name)
    shutil.copy2(HERE / 'src' / '404.html', dist / '404.html')
    (dist / '.htaccess').write_text(HTACCESS_SITE, encoding='utf-8')
    from PIL import Image
    im = Image.open(HERE / 'assets' / 'hero-portrait.webp').convert('RGB')
    w = 1200; h = round(im.height * w / im.width); im = im.resize((w, h), Image.LANCZOS)
    top = max(0, min(h - 630, round(h * 0.18)))
    im.crop((0, top, w, top + 630)).save(dist / 'og-image.jpg', quality=82, optimize=True, progressive=True)
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
    # the customer page for Hostinger: no dashboard on it (#owner goes to /owner/)
    preview_src = html
    html = minify_page(owner_parts(html, 'none'))
    (dist / 'index.html').write_text(HEAD + html + '\n</html>\n', encoding='utf-8')
    build_owner_page(dist, re.search(r'<style>(.*?)</style>', html, re.S).group(1), page)
    (dist / 'robots.txt').write_text('User-agent: *\nDisallow: /owner/\n', encoding='utf-8')
    if fragment_out:
        # the claude.ai preview: one page, with the dashboard at #owner (its script loads after app.js)
        out = pathlib.Path(fragment_out)
        # only here (claude.ai): the booking steps can be tried in PREVIEW mode, clearly labelled, with nothing
        # charged, saved or sent. The Hostinger site and the single-file build never run the preview.
        flag = '<script>window.GLOW_BOOKING_PREVIEW=true;</script>\n<script src="app.js" defer></script>'
        if preview_src.count('<script src="app.js" defer></script>') != 1:
            sys.exit('app.js script tag not found for the preview flag')
        preview_src = preview_src.replace('<script src="app.js" defer></script>', flag, 1)
        out.write_text(minify_page(owner_parts(preview_src, 'external')), encoding='utf-8')
        (out.parent / 'owner-core.js').write_text(min_js((OWNER / 'owner.js').read_text(encoding='utf-8')), encoding='utf-8')
        # the owner dashboard on a preview link of its own: dist/owner/index.html with relative paths,
        # published with owner.css, owner.js, assets/styles.css, vendor/fonts and the icons beside it
        op = (dist / 'owner' / 'index.html').read_text(encoding='utf-8')
        op = re.sub(r'^.*?<meta name="viewport"[^>]*>\n', '', op, flags=re.S).replace('\n</html>\n', '\n')
        op = op.replace('<title>Owner dashboard | Glow by Launthia</title>',
                        '<title>Glow by Launthia Owner Dashboard</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
        op = op.replace('="/owner/', '="').replace('="/', '="')  # only attribute values that start with "/"
        op = op.replace('<div class="ow" id="owner" data-owner data-standalone>',
                        f'<div class="ow" id="owner" data-owner data-standalone data-home="{PREVIEW_URL}">')
        (out.parent / 'owner-dashboard.html').write_text(op, encoding='utf-8')
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
