# usage: python3 tools/build_pages.py   (run from the site folder)
# Writes the 7 static pages (index.html, menu.html, ...) from tools/pages/*.html plus the shared head, header,
# footer, action modal and icon sprite below. The output is plain HTML: the site itself needs no build step.
# Edit page content in tools/pages/<page>.html, shared parts here, then re-run. (Quick fixes can go straight into
# the HTML files, but they are overwritten the next time this runs.)
#
# Shortcodes inside page bodies:
#   <x-pic name="cliffs-wide" alt="..." sizes="100vw" [eager] [class="..."]>   -> responsive <picture> (WebP + JPG)
#   <x-tile name="..." cat="sunsets cliffs" title="..." alt="..." caption="..." [badge="..."]>  -> gallery tile
import glob, json, os, re, html
from PIL import Image

FONTS = "https://fonts.googleapis.com/css2?family=Anton&amp;family=DM+Sans:ital,opsz,wght@0,9..40,400..800;1,9..40,400&amp;family=Instrument+Serif:ital@1&amp;display=swap"
BASE = "https://www.rickscafejamaica.com/"   # TODO(owner approval): final domain for canonical / OG / JSON-LD URLs
IMG = "assets/img"
NAV = [("index.html", "Home", "Home"), ("menu.html", "Menu", "Food & Drinks"), ("experience.html", "Experience", "The Experience"),
       ("story.html", "Story", "Our Story"), ("groups.html", "Groups", "Groups & Cabanas"), ("gallery.html", "Gallery", "Gallery & Films"),
       ("visit.html", "Visit", "Visit & FAQ")]
MAP_EMBED = ("https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d947.2581703480386!2d-78.36352082161144!3d18.254323337682344!2m3!1f0!2f0!3f0"
             "!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8ed9120b7e08c91d%3A0xd50aa55ffa3857cd!2sRick%27s+Cafe!5e0!3m2!1sen!2sus!4v1519413800021")
DIRECTIONS = "https://www.google.com/maps/search/?api=1&query=Rick%27s+Cafe+West+End+Road+Negril+Jamaica"
SOCIALS = [("instagram", "https://www.instagram.com/rickscafeonline/", "Instagram @rickscafeonline", "ico"),
           ("facebook", "https://www.facebook.com/rickscafejamaica", "Facebook", "ico ico--fill"),
           ("xlogo", "https://x.com/rickscafeonline", "X @rickscafeonline", "ico ico--fill"),
           ("youtube", "https://www.youtube.com/channel/UC6a05SkS4siYDQKfkfU8p7A", "YouTube: Ricks Cafe Online", "ico ico--fill")]

ICONS = {
  "pin": '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  "phone": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  "menu": '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 3.5-3 6.5V13h3v8"/>',
  "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  "x": '<path d="M6 6l12 12M18 6 6 18"/>', "left": '<path d="m15 18-6-6 6-6"/>', "right": '<path d="m9 18 6-6-6-6"/>',
  "play": '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  "pause": '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
  "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  "alert": '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  "search": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', "ext": '<path d="M7 17 17 7M8 7h9v9"/>',
  "sunset": '<path d="M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4"/>',
  "music": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  "waves": '<path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  "cliff": '<path d="m3 20 6-11 4 6 3-4 5 9z"/>', "bag": '<path d="M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0"/>',
  "shirt": '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  "card": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  "heart": '<path d="M12 20s-7.5-4.6-9.3-9.2A5 5 0 0 1 12 6a5 5 0 0 1 9.3 4.8C19.5 15.4 12 20 12 20z"/>',
  "briefcase": '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  "glass": '<path d="M5 4h14l-7 8zM12 12v8M8 20h8"/>', "check": '<path d="m5 12 5 5 9-10"/>',
  "download": '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  "camera": '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  "shield": '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  "paw": '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2.5-4 2.5S8 19 8 17z"/>',
  "tag": '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  "zoom": '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', "car": '<path d="M5 16h14M3 16v-4l2-5h14l2 5v4h-2M5 16H3M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  "instagram": '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  "facebook": '<path d="M14 8.5V6.8c0-.8.5-1.3 1.3-1.3H17V2.3h-2.6C11.6 2.3 10 4 10 6.6v1.9H7.5v3.3H10V22h4V11.8h2.8l.4-3.3z"/>',
  "xlogo": '<path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4-5.6 6.4H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7.4 4.7H5.6z"/>',
  "youtube": '<path d="M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.7 12 4.7 12 4.7s-6.8 0-8.5.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.5 8.5.5 8.5.5s6.8 0 8.5-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-4.8zM9.8 15.1V8.9L15.5 12z"/>',
}
SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + "".join(
    f'<symbol id="i-{k}" viewBox="0 0 24 24">{v}</symbol>' for k, v in ICONS.items()) + "</defs></svg>"


def ico(name, cls="ico"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


# ---------- images ----------
def variants(name):
    ws = sorted(int(m.group(1)) for f in glob.glob(f"{IMG}/{name}-*.webp") if (m := re.search(r"-(\d+)\.webp$", f)))
    fb = next((f"{IMG}/{name}.{e}" for e in ("jpg", "png") if os.path.exists(f"{IMG}/{name}.{e}")), None)
    assert ws and fb, f"missing image variants for {name}"
    w, h = Image.open(fb).size
    return ws, fb, w, h


def pic(name, alt, sizes="100vw", eager=False, cls=""):
    ws, fb, w, h = variants(name)
    srcset = ", ".join(f"{IMG}/{name}-{x}.webp {x}w" for x in ws)
    load = 'fetchpriority="high" decoding="async"' if eager else 'loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ""
    return (f'<picture><source type="image/webp" srcset="{srcset}" sizes="{sizes}">'
            f'<img src="{fb}" width="{w}" height="{h}" alt="{html.escape(alt, quote=True)}" {load}{c}></picture>')


def full(name):
    ws, *_ = variants(name)
    return f"{IMG}/{name}-{ws[-1]}.webp"


def attrs(s):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', s)) | {k: True for k in re.findall(r'\s(eager)(?=[\s>])', " " + s)}


def expand(body):
    def _pic(m):
        a = attrs(m.group(1))
        return pic(a["name"], a.get("alt", ""), a.get("sizes", "100vw"), bool(a.get("eager")), a.get("class", ""))

    def _tile(m):
        a = attrs(m.group(1)); badge = f'<span class="badge{" badge--sea" if a.get("sea") else ""}">{a["badge"]}</span>' if a.get("badge") else ""
        return (f'<figure class="tile" data-cat="{a["cat"]}" data-reveal><button type="button" data-full="{full(a["name"])}" aria-label="View larger: {html.escape(a["title"], quote=True)}">'
                f'{pic(a["name"], a["alt"], "(min-width:1000px) 31vw, (min-width:640px) 46vw, 92vw")}<span class="zoom" aria-hidden="true">{ico("zoom")}</span></button>'
                f'<figcaption><b>{a["title"]}</b>{a["caption"]}{(" " + badge) if badge else ""}</figcaption></figure>')
    body = re.sub(r"<x-pic\s([^>]*)>", _pic, body)
    body = re.sub(r"<x-tile\s([^>]*)>", _tile, body)
    body = re.sub(r"\{\{ico:([\w-]+)(?::([\w -]+))?\}\}", lambda m: ico(m.group(1), m.group(2) or "ico"), body)
    return body.replace("{{MAP_EMBED}}", MAP_EMBED).replace("{{DIRECTIONS}}", DIRECTIONS)


# ---------- shared partials ----------
JSONLD = {
    "@context": "https://schema.org", "@type": ["Restaurant", "BarOrPub"], "@id": BASE + "#ricks",
    "name": "Rick's Cafe", "alternateName": ["Rick's Café", "Rick's Cafe Jamaica"],
    "description": "World-famous cliffside bar and restaurant on the West End cliffs of Negril, Jamaica, founded in April 1974. Sunset views, food, drinks and cliff jumping. No cover charge.",
    "url": BASE, "image": [BASE + "assets/img/og-image.jpg"], "logo": BASE + "assets/img/logo.png",
    "email": "mailto:info@rickscafejamaica.com",
    "address": {"@type": "PostalAddress", "streetAddress": "West End Road", "addressLocality": "Negril", "addressRegion": "Westmoreland", "addressCountry": "JM"},
    "hasMap": DIRECTIONS, "servesCuisine": ["Jamaican", "Caribbean"], "hasMenu": "https://rickscafejamaica.com/assets/RicksCafeMenu.pdf",
    "isAccessibleForFree": True, "paymentAccepted": "Visa, Mastercard, Discover, American Express",
    "foundingDate": "1974-04", "founder": {"@type": "Person", "name": "Richard Hershman"},
    "sameAs": [BASE, *[s[1] for s in SOCIALS]],
}
# telephone and openingHoursSpecification are deliberately left out until the owner confirms one phone number and the current hours.

OPENER_HEAD = """<script>(function(r){r.classList.add('js');var seen=false;try{seen=!!sessionStorage.getItem('opener-seen')}catch(e){}
var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,save=navigator.connection&&navigator.connection.saveData;
var on=!seen&&!still&&!save,tall=matchMedia('(max-aspect-ratio: 1/1)').matches;if(on)r.classList.add('opener-on');
var l=document.createElement('link');l.rel='preload';l.as='image';l.fetchPriority='high';
l.href=on?'assets/video/intro'+(tall?'-mobile':'')+'-poster.webp':'assets/img/hero-poster'+(tall?'-mobile':'')+'.webp';document.head.appendChild(l)})(document.documentElement)</script>"""

OPENER_BODY = """<div class="opener" id="opener">
  <video class="opener__video" muted playsinline preload="auto" aria-hidden="true"></video>
  <div class="opener__brand" aria-hidden="true"><img src="assets/img/logo-480.webp" width="480" height="473" alt=""><span>Negril · Est. 1974</span></div>
  <p class="opener__credit" aria-hidden="true">From the official film “Rick’s Cafe turns 47!” (c. 2021)</p>
  <div class="opener__bar" aria-hidden="true"><span></span></div>
  <button class="opener__skip" type="button" data-opener-skip>Skip intro <span aria-hidden="true">→</span></button>
</div>
<script>(function(){var R=document.documentElement;if(!R.classList.contains('opener-on'))return;
var v=document.querySelector('.opener__video'),b='assets/video/intro'+(matchMedia('(max-aspect-ratio: 1/1)').matches?'-mobile':'');
v.poster=b+'-poster.webp';v.innerHTML='<source src="'+b+'.webm" type="video/webm"><source src="'+b+'.mp4" type="video/mp4">';
v.muted=true;var p=v.play();p&&p.catch(function(){});
setTimeout(function(){if(R.classList.contains('opener-on')&&!window.RICKS){R.classList.remove('opener-on');var o=document.getElementById('opener');o&&o.remove()}},9000)})()</script>"""


def head(p):
    url = BASE + ("" if p["file"] == "index.html" else p["file"])
    pre = "".join(p.get("preload", []))
    ld = f'<script type="application/ld+json">{json.dumps(JSONLD, ensure_ascii=False)}</script>' if p.get("jsonld") else ""
    js = OPENER_HEAD if p.get("opener") else "<script>document.documentElement.classList.add('js')</script>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{p['title']}</title>
<meta name="description" content="{html.escape(p['description'], quote=True)}">
<!-- CONCEPT: kept out of search engines until the owner approves it. Remove this line at launch. -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="{url}"><!-- TODO(owner approval): confirm final URL -->
<meta name="theme-color" content="#051219">
<link rel="icon" href="favicon.ico" sizes="48x48"><link rel="icon" type="image/png" href="assets/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="Rick's Cafe, Negril, Jamaica">
<meta property="og:title" content="{html.escape(p['title'], quote=True)}"><meta property="og:description" content="{html.escape(p['description'], quote=True)}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}assets/img/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Aerial view of Rick's Cafe on the limestone cliffs of Negril's West End, above a deep blue cove.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@rickscafeonline">
{js}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="{FONTS}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="{FONTS}"></noscript>
{pre}<link rel="stylesheet" href="css/styles.css">
{ld}
</head>"""


def header(active):
    links = "".join(f'<li><a href="{f}"{" aria-current=\"page\"" if f == active else ""}>{short}</a></li>' for f, short, _ in NAV)
    dlinks = "".join(f'<li><a href="{f}"{" aria-current=\"page\"" if f == active else ""}>{long}<span aria-hidden="true">→</span></a></li>' for f, _, long in NAV)
    return f"""<a class="skip" href="#main">Skip to content</a>
{SPRITE}
<header class="site-head">
  <div class="concept" role="note"><b>Concept</b><span class="concept__long">Redesign proposal for owner review: not the official Rick's Cafe website. Official site: <a href="https://www.rickscafejamaica.com/" rel="noopener">rickscafejamaica.com</a></span><span class="concept__short">Owner-review preview · not the official site</span></div>
  <nav class="nav" aria-label="Main">
    <a class="brand" href="index.html" aria-label="Rick's Cafe, Negril: home"><img src="assets/img/logo-96.webp" width="96" height="95" alt=""><span class="brand__name"><b>Rick's Cafe</b><small>Negril · Est. 1974</small></span></a>
    <ul class="nav__links">{links}</ul>
    <a class="btn btn--sun nav__cta" href="visit.html" data-action>Plan your visit <span class="arrow" aria-hidden="true">→</span></a>
    <button class="burger" type="button" data-burger aria-expanded="false" aria-controls="drawer" aria-label="Open menu"><span></span></button>
  </nav>
</header>
<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Site menu">
  <div class="drawer__backdrop"></div>
  <div class="drawer__panel">
    <div class="drawer__top"><a class="brand" href="index.html" aria-label="Rick's Cafe: home"><img src="assets/img/logo-96.webp" width="96" height="95" alt=""><span class="brand__name"><b>Rick's Cafe</b><small>Negril · Est. 1974</small></span></a>
      <button class="drawer__close" type="button" data-close aria-label="Close menu">{ico("x")}</button></div>
    <ul class="drawer__links">{dlinks}</ul>
    <a class="btn btn--sun" href="visit.html" data-action>Plan your visit <span class="arrow" aria-hidden="true">→</span></a>
    <div class="drawer__meta"><span>West End Road, Negril, Jamaica</span><span>Noon – 10 PM daily · published hours</span><span>No cover charge</span></div>
  </div>
</div>"""


def footer():
    explore = "".join(f'<li><a href="{f}">{long}</a></li>' for f, _, long in NAV)
    soc = "".join(f'<a href="{u}" target="_blank" rel="noopener" aria-label="{l} (opens in a new tab)">{ico(k, c)}</a>' for k, u, l, c in SOCIALS)
    return f"""<footer class="footer">
  <div class="wrap">
    <div class="footer__top">
      <h2 data-reveal>See you<br><span class="accent">on the cliffs.</span></h2>
      <div class="btn-row" data-reveal style="--d:.1s"><a class="btn btn--sun" href="visit.html" data-action>Plan your visit <span class="arrow" aria-hidden="true">→</span></a><a class="btn btn--outline" href="menu.html">See the menu</a></div>
    </div>
    <div class="footer__cols">
      <div><a class="brand" href="index.html" aria-label="Rick's Cafe: home"><img src="assets/img/logo-96.webp" width="96" height="95" alt="" loading="lazy"><span class="brand__name"><b>Rick's Cafe</b><small>Negril · Est. 1974</small></span></a>
        <p style="margin-top:16px">A cliffside bar and restaurant on Negril's West End since April 1974. No cover charge.</p><div class="socials">{soc}</div></div>
      <nav aria-label="Footer"><h3>Explore</h3><ul>{explore}</ul></nav>
      <div><h3>Hours</h3><p><span class="status" data-open><span class="status__dot"></span><span data-open-text>Noon – 10 PM daily</span></span></p>
        <p>Noon – 10 PM, every day (published on the official homepage and FAQ). Jamaica time, UTC−5. Please confirm before you travel.</p></div>
      <div><h3>Contact</h3><ul>
        <li><a href="{DIRECTIONS}" target="_blank" rel="noopener">West End Road, Negril, Jamaica</a></li>
        <li><a href="tel:+18769570380">876-957-0380 · reservations &amp; cabanas</a></li>
        <li><a href="tel:+18768221764">876.822.1764 · general line</a></li>
        <li><a href="mailto:info@rickscafejamaica.com">info@rickscafejamaica.com</a></li></ul></div>
    </div>
  </div>
  <p class="wordmark" aria-hidden="true">Rick's Cafe</p>
  <div class="wrap footer__bottom">
    <p>© <span data-year>2026</span> Rick's Cafe, Negril, Jamaica. Logo, photos and film © their owners. <strong>Concept redesign for owner review, not the official website.</strong> Official site: <a href="https://www.rickscafejamaica.com/" rel="noopener">rickscafejamaica.com</a>.</p>
    <!-- TODO: swap in the "DONE BY Stevenscalesolutions.com" image (brand/done-by-sss.jpg) when it's supplied; see README. -->
    <a class="credit" href="https://stevenscalesolutions.com" target="_blank" rel="noopener">Website by <b>Steven Scale Solutions</b></a>
  </div>
</footer>
<div class="modal" id="action" role="dialog" aria-modal="true" aria-labelledby="action-title">
  <div class="modal__backdrop" data-close></div>
  <div class="modal__card">
    <button class="lb-btn modal__close" type="button" data-close aria-label="Close">{ico("x")}</button>
    <p class="eyebrow">Plan your visit</p>
    <h2 id="action-title">See you <span class="accent">at Rick's.</span></h2>
    <p class="muted">No cover charge. Open to the public every day, noon to 10 PM (published hours, Jamaica time).</p>
    <ul class="opts"></ul>
    <p class="modal__foot">West End Road, Negril, Jamaica · This site takes no bookings or payments. Rick's publishes two phone numbers; both are listed until the owner confirms one.</p>
  </div>
</div>
<a class="fab" href="visit.html" data-action aria-label="Plan your visit: directions, phone and email">{ico("pin")}Plan visit</a>"""


def build(path):
    src = open(path, encoding="utf-8").read()
    meta = json.loads(re.match(r"<!--page\s*(\{.*?\})\s*-->", src, re.S).group(1))
    body = expand(src[src.index("-->") + 3:].strip())
    scripts = ('<script src="js/menu-data.js" defer></script>\n' if meta.get("menu") else "") + '<script src="js/main.js" defer></script>'
    out = (head(meta) + "\n<body>\n" + (OPENER_BODY + "\n" if meta.get("opener") else "") + header(meta["file"]) +
           f'\n<main id="main" tabindex="-1">\n{body}\n</main>\n' + footer() + "\n" + scripts + "\n</body>\n</html>\n")
    open(meta["file"], "w", encoding="utf-8").write(out)
    print(f"{meta['file']:16} {len(out) // 1024} KB")


for f in sorted(glob.glob("tools/pages/*.html")):
    build(f)
