#!/usr/bin/env python3
"""Generates the static HTML pages for the Candid Expressions site.

Run from anywhere:  python3 candid-expression/tools/build_pages.py
Photos, prices, reviews and contact details live in js/content.js and need no rebuild.
Rebuild only after changing page wording here or SITE_URL below.
"""
import json, os, re

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The site's final web address, ending in "/", e.g. "https://candidexpressions.com/".
# Leave empty until the site is live. Once set (and pages rebuilt), links shared on
# WhatsApp/Facebook show a preview photo, and the "page not found" page works from
# any address on the site.
SITE_URL = ""
FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Manrope:wght@400;500;600;700&display=swap"

LD = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Candid Expressions Photography",
    "legalName": "Candid Expressions Photography Jamaica Ltd.",
    "logo": SITE_URL + "images/logo.png",
    "description": "Wedding, event and school photography, portraits, prints and ID card printing in Savanna-la-Mar, Westmoreland, Jamaica.",
    "image": SITE_URL + "images/hero.jpg",
    "telephone": "+1-876-993-1818",
    "email": "candidexpressionsphotography@gmail.com",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Shop #15 Hendon Mall, Beckford Street",
        "addressLocality": "Savanna-la-Mar",
        "addressRegion": "Westmoreland",
        "addressCountry": "JM",
    },
}


PHONE = "(876) 993-1818"  # calls (the office)
WA_PHONE = "(876) 858-5172"  # WhatsApp
EMAIL = "candidexpressionsphotography@gmail.com"


def contact_hooks(html):
    """Wrap the phone numbers and email shown as text in <span data-site=...> so the
    pages follow js/content.js if they ever change. Tags/attributes are left alone."""
    parts = re.split(r"(<[^>]+>)", html)
    for i, part in enumerate(parts):
        if part.startswith("<"):
            continue
        part = part.replace(PHONE, f'<span data-site="phoneDisplay">{PHONE}</span>')
        part = part.replace(WA_PHONE, f'<span data-site="whatsappDisplay">{WA_PHONE}</span>')
        part = part.replace(EMAIL, f'<span data-site="email">{EMAIL}</span>')
        parts[i] = part
    return "".join(parts)


def page(fname, key, title, desc, body, scripts=(), ld=False):
    extra = "".join(f'\n  <script src="js/{s}"></script>' for s in scripts)
    body = contact_hooks(body)
    base = f'\n  <base href="{SITE_URL}">' if (fname == "404.html" and SITE_URL) else ""
    skip = "" if base else '\n  <a class="skip-link" href="#main">Skip to content</a>'
    og_url = f'\n  <meta property="og:url" content="{SITE_URL}{"" if fname == "index.html" else fname}">' if SITE_URL else ""
    ldjs = (
        '\n  <script type="application/ld+json">' + json.dumps(LD, separators=(",", ":")) + "</script>"
        if ld
        else ""
    )
    html = f"""<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8">{base}
  <script>document.documentElement.classList.remove("no-js");try{{var t=localStorage.getItem("ce-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}}catch(e){{}}</script>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#17110d">
  <link rel="icon" href="images/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Candid Expressions Photography">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{SITE_URL}images/hero.jpg">{og_url}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="{FONTS}">
  <link rel="stylesheet" href="css/styles.css">{ldjs}
</head>
<body data-page="{key}" class="has-dark-hero">{skip}
  <div id="site-header"></div>
  <main id="main">
{body.strip()}
  </main>
  <div id="site-footer"></div>
  <script src="js/content.js"></script>
  <script src="js/main.js"></script>{extra}
</body>
</html>
"""
    with open(os.path.join(OUT, fname), "w") as f:
        f.write(html)


def page_hero(word, eyebrow, crumb, h1, lead, buttons=""):
    btns = f'\n      <div class="btn-row">{buttons}</div>' if buttons else ""
    return f"""
    <section class="page-hero">
      <span class="page-hero__word" aria-hidden="true">{word}</span>
      <div class="container">
        <ol class="crumbs"><li><a href="index.html">Home</a></li><li aria-current="page">{crumb}</li></ol>
        <p class="eyebrow">{eyebrow}</p>
        <h1>{h1}</h1>
        <p class="lead">{lead}</p>{btns}
      </div>
    </section>"""


WA_BTN = '<a class="btn btn--wa" data-link="wa" href="https://wa.me/18768585172"><span data-icon="wa"></span>WhatsApp us</a>'
CALL_BTN = '<a class="btn btn--outline-light" data-link="tel" href="tel:+18769931818"><span data-icon="phone"></span>(876) 993-1818</a>'


def cta_band(title="Ready when you are.", sub="Let&rsquo;s capture your next moment. Book online in two minutes, or message us on WhatsApp &mdash; we reply fast."):
    return f"""
    <section class="section section--tight section--clear">
      <div class="container">
        <div class="cta-band reveal">
          <p class="eyebrow">Book with Candid</p>
          <h2>{title}</h2>
          <p>{sub}</p>
          <div class="btn-row">
            <a class="btn btn--light" href="booking.html"><span data-icon="calendar"></span>Book online</a>
            {WA_BTN}
            {CALL_BTN}
          </div>
        </div>
      </div>
    </section>"""


def letters(word, start):
    return "".join(f'<span class="l" style="--i:{start + i}">{c}</span>' for i, c in enumerate(word))


def chips(items):
    out = []
    for it in items:
        if isinstance(it, tuple):
            ic, label = it
            out.append(f'<li class="chip"><span data-icon="{ic}"></span>{label}</li>')
        else:
            out.append(f'<li class="chip">{it}</li>')
    return '<ul class="chips">' + "".join(out) + "</ul>"


def opt_group(label, items):
    return f'<div class="opt-group"><p class="opt-group__label">{label}</p>{chips(items)}</div>'


def fiwi(service):
    return f"""
            <aside class="partner">
              <span class="partner__label">Venue partner</span>
              <h4>Fiwi Place</h4>
              <p>Need somewhere to celebrate? We&rsquo;ll connect you with Fiwi Place for your venue, chair &amp; table rental and catering.</p>
              <ul><li>Venue</li><li>Chairs</li><li>Table rental</li><li>Catering</li></ul>
              <a class="link-arrow" href="booking.html#{service}-fiwi">Add Fiwi Place to my booking <span data-icon="arrow"></span></a>
            </aside>"""


# --------------------------------------------------------------------------
# HOME
# --------------------------------------------------------------------------
marquee_items = ["Weddings", "Events", "School Portraits", "Graduations", "Birthdays", "Engagements", "Maternity",
                 "Newborn", "Business Headshots", "Product Photos", "Aerial &amp; Drone", "ID Cards", "Prints"]
marquee = "".join(f"<span>{m}</span>" for m in marquee_items)

services_cards = [
    ("weddings", "rings", "Weddings", "Calm, candid coverage of your day. Choose one of our custom packages or build your own, with venue and catering help through Fiwi Place."),
    ("events", "balloon", "Birthdays &amp; Events", "Full coverage of your celebration &mdash; the people, the moments and the details, from start to finish."),
    ("schools", "cap", "Schools", "Student portraits, class photos and school events &mdash; numbered so every parent can find their child&rsquo;s photo by IMG #."),
    ("sessions", "camera", "Photo Sessions", "In studio or outdoors. Maternity, engagement, newborn, birthday and more, in 30-minute or 1-hour sessions."),
    ("portraits", "user", "Portraits", "School portraits, professional &amp; business headshots, and clean product photography for your brand."),
    ("aerial", "drone", "Aerial &amp; Real Estate", "Drone photos of homes, developments, resorts and venues from above."),
    ("id", "id", "ID Printing", "ID card printing &amp; programming. Bring your design, or let us photograph, design and print for you."),
]
cards_html = "\n".join(
    f"""          <a class="card reveal" style="--delay:{(i % 3) * 0.08:.2f}s" href="galleries.html#{k}">
            <span class="icon-badge" data-icon="{ic}"></span>
            <h3>{t}</h3>
            <p>{d}</p>
            <span class="link-arrow">Explore <span data-icon="arrow"></span></span>
          </a>"""
    for i, (k, ic, t, d) in enumerate(services_cards)
)

home = f"""
    <section class="hero" aria-label="Introduction">
      <div class="hero__bg" aria-hidden="true"><img src="images/hero.jpg" alt="" width="854" height="1280" fetchpriority="high"></div>
      <div class="hero__stream" aria-hidden="true"></div>
      <div class="hero__scrim" aria-hidden="true"></div>
      <div class="hero__name" aria-hidden="true">
        <span class="col">{letters("CANDID", 0)}</span>
        <span class="col">{letters("EXPRESSIONS", 6)}</span>
      </div>
      <div class="hero__content">
        <div class="hero__copy">
          <p class="eyebrow">Savanna-la-Mar &middot; Westmoreland</p>
          <h1>Wedding, Event &amp; School <em>Photography</em></h1>
          <p class="hero__lead">We capture real, joyful moments &mdash; weddings, celebrations and school days &mdash; and print them right here in our studio.</p>
          <div class="btn-row">
            <a class="btn btn--primary" href="booking.html"><span data-icon="calendar"></span>Book a session</a>
            <a class="btn btn--outline-light" href="galleries.html">View galleries</a>
          </div>
        </div>
      </div>
      <p class="hero__tag" aria-hidden="true"><span><b class="hero__best">BEST!!!</b> Photography in Jamaica</span><svg class="hero__flag" viewBox="0 0 12 6" aria-hidden="true"><path fill="#009b3a" d="M0 0h12v6H0z"/><path fill="#000" d="m0 0 6 3-6 3zm12 0-6 3 6 3z"/><path stroke="#fed100" d="m0 0 12 6m0-6L0 6"/></svg></p>
      <a class="hero__scroll" href="#after-hero">Scroll</a>
    </section>

    <section class="photo-window" id="after-hero" aria-label="Weddings">
      <div class="container">
        <div class="photo-window__copy reveal">
          <p class="eyebrow">Weddings &middot; Events &middot; Schools</p>
          <h2>Your day, <em>beautifully kept.</em></h2>
          <p>From the ceremony to the last dance, we capture it candidly. We can also connect you with Fiwi Place for the venue, chair &amp; table rental and catering.</p>
          <div class="btn-row">
            <a class="btn btn--primary" href="booking.html#wedding"><span data-icon="rings"></span>Book your wedding</a>
            <a class="btn btn--outline-light" href="galleries.html#weddings">See wedding work</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="statement reveal">Every smile, every milestone &mdash; <em>captured candidly</em> and printed to last.</p>
        <div class="statement-meta reveal" style="--delay:.1s">
          <span><span data-icon="pin"></span>Hendon Mall, Savanna-la-Mar</span>
          <span><span data-icon="camera"></span>Studio &amp; outdoor sessions</span>
          <span><span data-icon="print"></span>In-house prints &amp; ID cards</span>
        </div>
      </div>
    </section>

    <div class="marquee" aria-hidden="true"><div class="marquee__track">{marquee}{marquee}</div></div>

    <section class="section">
      <div class="container">
        <div class="split-head">
          <div class="section-head reveal">
            <p class="eyebrow">Featured work</p>
            <h2>Moments we <em>love</em></h2>
          </div>
          <a class="link-arrow reveal" href="galleries.html">See all galleries <span data-icon="arrow"></span></a>
        </div>
        <div class="area-grid reveal" id="featured-grid"></div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">What we do</p>
          <h2>Photography for every <em>chapter</em></h2>
          <p class="lead">From the wedding day to the first day of school &mdash; and everything worth celebrating in between.</p>
        </div>
        <div class="cards cards--3">
{cards_html}
        </div>
      </div>
    </section>

    <section class="section section--dark grain">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">How it works</p>
          <h2>Simple from <em>start to print</em></h2>
        </div>
        <ol class="steps">
          <li class="reveal"><h3>Book</h3><p>Use the booking form or WhatsApp. Pick your service, date and start time &mdash; we&rsquo;ll confirm the details with you.</p></li>
          <li class="reveal" style="--delay:.1s"><h3>Shoot</h3><p>Relax and enjoy a session in our studio, outdoors, at your school or at your venue. We&rsquo;ll guide you through it.</p></li>
          <li class="reveal" style="--delay:.2s"><h3>Receive</h3><p>View your photos online using your IMG #, then order prints or digital files. Pick up at Hendon Mall.</p></li>
        </ol>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="split-head">
          <div class="section-head reveal">
            <p class="eyebrow">Kind words</p>
            <h2>What our clients <em>say</em></h2>
          </div>
          <a class="link-arrow reveal" href="testimonials.html">All reviews <span data-icon="arrow"></span></a>
        </div>
        <div class="quotes" data-testimonials data-limit="3" data-empty-target="#home-reviews-empty"></div>
        <div class="empty reveal" id="home-reviews-empty" hidden>
          <span class="icon-badge" data-icon="heart"></span>
          <h3>Be the first to share your experience</h3>
          <p>Had a wedding, event, session or school picture day with us? We&rsquo;d love to hear how it went.</p>
          <div class="btn-row"><a class="btn btn--primary" href="testimonials.html#leave-review">Leave a review</a></div>
        </div>
      </div>
    </section>
{cta_band()}
"""

page("index.html", "home",
     "Candid Expressions Photography | Wedding, Event & School Photography in Savanna-la-Mar",
     "Wedding, event and school photography in Savanna-la-Mar, Westmoreland, Jamaica. Portraits, prints, digital files and ID card printing at Hendon Mall.",
     home, ld=True)

# --------------------------------------------------------------------------
# ABOUT
# --------------------------------------------------------------------------
about = page_hero(
    "About", "About us", "About",
    "Real moments, <em>beautifully kept.</em>",
    "Candid Expressions Photography is a photography and print studio at Hendon Mall in Savanna-la-Mar, Westmoreland.",
) + f"""
    <section class="section">
      <div class="container split">
        <div class="arch-wrap reveal">
          <div class="arch"><img src="images/hero.jpg" alt="A smiling baby in a woven basket during an outdoor session" loading="lazy" width="854" height="1280"></div>
          <div class="arch-wrap__badge"><strong>Studio &amp; outdoor</strong>Shop #15, Hendon Mall, Beckford Street</div>
        </div>
        <div class="reveal" style="--delay:.1s">
          <p class="eyebrow">Our story</p>
          <h2>Photography that feels like <em>you</em></h2>
          <div class="mt-m">
            <p class="lead">Our name says how we work. The best photos usually happen between the poses &mdash; a laugh, a glance, a little hand gripping the edge of a basket.</p>
            <p>We make room for those moments, then capture them with care. From wedding days and celebrations to the first day of school and a newborn&rsquo;s first portrait, we&rsquo;re here for the milestones that matter to families and organisations across Westmoreland.</p>
            <p>And because we print in-house, your photos don&rsquo;t stay stuck on a phone &mdash; they end up on walls, in albums and on ID cards.</p>
          </div>
          <ul class="checklist">
            <li><span data-icon="check"></span>Wedding, event, school &amp; studio photography</li>
            <li><span data-icon="check"></span>Outdoor and on-location sessions</li>
            <li><span data-icon="check"></span>Prints, digital files &amp; ID card printing</li>
            <li><span data-icon="check"></span>Online proofing &mdash; find your photo by IMG #</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">What we value</p>
          <h2>How we <em>work</em></h2>
        </div>
        <div class="values">
          <div class="value reveal"><span class="value__num">01</span><h3>Patient &amp; playful</h3><p>Little ones set the pace. We keep sessions relaxed so real smiles come naturally &mdash; for kids and grown-ups alike.</p></div>
          <div class="value reveal" style="--delay:.1s"><span class="value__num">02</span><h3>Organised for schools</h3><p>Every student photo gets its own IMG number, so parents can quickly find, view and order their child&rsquo;s photos.</p></div>
          <div class="value reveal" style="--delay:.2s"><span class="value__num">03</span><h3>Made to last</h3><p>Professional prints and high-resolution digital files, ready for the wall, the album or social media.</p></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container split">
        <div class="reveal">
          <p class="eyebrow">Visit the studio</p>
          <h2>Come say <em>hello</em></h2>
          <p class="lead mt-s">Drop by to plan a session, collect prints or talk through your ID card order.</p>
          <div class="contact-list mt-m">
            <a class="contact-item" data-link="directions" href="https://www.google.com/maps/dir/?api=1&amp;destination=Hendon%20Mall%2C%20Savanna-la-Mar"><span class="icon-badge" data-icon="pin"></span><span><small>Address &middot; tap for directions</small><strong>Shop #15 Hendon Mall, Beckford Street, Savanna-la-Mar, Westmoreland</strong></span></a>
            <a class="contact-item" data-link="tel" href="tel:+18769931818"><span class="icon-badge" data-icon="phone"></span><span><small>Call the office</small><strong>(876) 993-1818</strong></span></a>
            <a class="contact-item" data-link="mail" href="mailto:candidexpressionsphotography@gmail.com"><span class="icon-badge" data-icon="mail"></span><span><small>Email</small><strong>candidexpressionsphotography@gmail.com</strong></span></a>
          </div>
        </div>
        <div class="map-frame reveal" style="--delay:.1s"><iframe data-map-embed title="Map to Candid Expressions Photography at Hendon Mall" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
      </div>
    </section>
{cta_band()}
"""
page("about.html", "about", "About | Candid Expressions Photography",
     "Meet Candid Expressions Photography: a photography and print studio at Hendon Mall, Savanna-la-Mar, capturing real moments at weddings, events and schools.",
     about)

# --------------------------------------------------------------------------
# GALLERIES
# --------------------------------------------------------------------------
def gal_section(num, key, title, intro, groups_html, buttons, right_extra="", left_extra=""):
    return f"""
      <section class="gal-section" id="{key}">
        <div class="container gal-grid">
          <div class="gal-info reveal">
            <span class="gal-info__num">{num}</span>
            <h2>{title}</h2>
            <p>{intro}</p>
            {groups_html}{left_extra}
            <div class="btn-row">{buttons}</div>
          </div>
          <div class="reveal" style="--delay:.1s">{right_extra}
            <div data-gallery="{key}"></div>
          </div>
        </div>
      </section>"""


def book_btn(service, label, extra=""):
    return f'<a class="btn btn--primary" href="booking.html#{service}{extra}"><span data-icon="calendar"></span>{label}</a>'


id_options = """
            <div class="id-options" style="margin-bottom:18px">
              <div class="id-option"><span class="id-option__num">1</span><h3>Printing &amp; programming</h3><p>Professional ID card printing, with card programming available.</p><a class="link-arrow" href="booking.html#id-print">Choose this <span data-icon="arrow"></span></a></div>
              <div class="id-option"><span class="id-option__num">2</span><h3>I have a design</h3><p>Already have your ID design? Send it to us and we&rsquo;ll print it.</p><a class="link-arrow" href="booking.html#id-design">Choose this <span data-icon="arrow"></span></a></div>
              <div class="id-option"><span class="id-option__num">3</span><h3>Candid does it all</h3><p>We take the photographs, design the cards and print them for you.</p><a class="link-arrow" href="booking.html#id-full">Choose this <span data-icon="arrow"></span></a></div>
            </div>"""

wedding_left = """
            <div class="opt-group"><p class="opt-group__label">Packages</p><div class="packages" data-wedding-packages></div></div>"""

tabs = [("weddings", "Weddings"), ("events", "Birthdays &amp; Events"), ("schools", "Schools"),
        ("sessions", "Photo Sessions"), ("portraits", "Portraits"), ("aerial", "Aerial &amp; Real Estate"), ("id", "ID Printing")]
tabs_html = "".join(f'<li><a href="#{k}">{t}</a></li>' for k, t in tabs)

galleries = page_hero(
    "Portfolio", "Galleries", "Galleries",
    "Our <em>portfolio</em>",
    "Browse by category, then book the session that fits &mdash; every gallery links straight to booking.",
) + f"""
    <nav class="tabs" aria-label="Gallery categories"><div class="container"><ul class="tabs__list">{tabs_html}</ul></div></nav>
""" + gal_section(
    "01", "weddings", "Weddings",
    "From getting ready to the last dance, we tell the story of your day &mdash; naturally.",
    opt_group("When you book", [("clock", "Time starts"), ("clock", "Time ends")]) + wedding_left,
    book_btn("wedding", "Book your wedding"),
    left_extra=fiwi("wedding"),
) + gal_section(
    "02", "events", "Birthdays &amp; Events",
    "Birthdays, anniversaries, church and community functions, corporate events &mdash; we capture the people and the details.",
    opt_group("When you book", [("clock", "Time starts"), ("clock", "Time ends"), ("pin", "Location")]),
    book_btn("event", "Book event coverage"),
) + gal_section(
    "03", "schools", "Schools",
    "Picture day made easy for students, teachers and parents. We photograph portraits, classes and school events &mdash; and every photo is numbered so parents can find theirs online.",
    opt_group("What we cover", ["Student portraits", "Class photos", "School events", "Graduations"]) +
    opt_group("For parents", [("lock", "Find your child&rsquo;s photo by IMG #")]),
    book_btn("school", "Book school photos") + '<a class="btn btn--ghost" href="proofing.html">Client proofing</a>',
) + gal_section(
    "04", "sessions", "Photo Sessions",
    "A relaxed, personal session for the moments worth framing &mdash; in our studio or outdoors. Kiddies sessions in the studio start at 30 minutes, and you&rsquo;re welcome to bring your own props and outfits.",
    opt_group("Setting", [("venue", "In studio"), ("sparkle", "Outdoor")]) +
    opt_group("Session type", ["Maternity", "Engagement", "Newborn", "Birthday", "Others"]) +
    opt_group("Length", [("clock", "30 mins"), ("clock", "1 hr")]) +
    opt_group("You choose", [("clock", "Time starts"), ("clock", "Time ends")]),
    book_btn("session", "Book a session"),
) + gal_section(
    "05", "portraits", "Portraits",
    "Clean, flattering portraits for school, work and business &mdash; plus product photos that sell.",
    opt_group("Portrait type", [("cap", "Schools"), ("brief", "Professional / business"), ("box", "Products")]),
    book_btn("portraits", "Book portraits"),
) + gal_section(
    "06", "aerial", "Aerial &amp; Real Estate",
    "Drone photography that shows the whole picture &mdash; homes, developments, resorts and venues from above.",
    opt_group("What we shoot", [("venue", "Real estate &amp; property"), ("box", "Developments &amp; construction"), ("sparkle", "Resorts &amp; hotels"), ("balloon", "Events &amp; venues")]),
    book_btn("aerial", "Book aerial photos"),
) + gal_section(
    "07", "id", "ID Printing",
    "ID cards for schools, businesses and organisations &mdash; printed, and programmed where needed. Pick the option that suits you.",
    opt_group("Options", [("print", "Printing &amp; programming"), ("image", "Print my design"), ("camera", "Photos, design &amp; print")]),
    book_btn("id", "Order ID cards"),
    right_extra=id_options,
) + cta_band("Like what you see?", "Book your date online or send us a WhatsApp &mdash; we&rsquo;ll help you choose the right session or package.")

page("galleries.html", "galleries", "Galleries & Portfolio | Candid Expressions Photography",
     "Browse wedding, event, school, photo session, portrait, aerial and ID printing work by Candid Expressions Photography in Savanna-la-Mar.",
     galleries)

# --------------------------------------------------------------------------
# SERVICES & PRICING
# --------------------------------------------------------------------------
def li(items):
    return "".join(f'<li><span data-icon="check"></span><span>{i}</span></li>' for i in items)


def price_card(icon, title, desc, items, price_key, service, btn, featured=False, delay=0):
    flag = '<span class="price-card__flag">Featured</span>' if featured else ""
    cls = " is-featured grain" if featured else ""
    btn_cls = "btn--light" if featured else "btn--ghost"
    return f"""
          <article class="price-card{cls} reveal" style="--delay:{delay:.2f}s">{flag}
            <span class="icon-badge" data-icon="{icon}"></span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <ul>{li(items)}</ul>
            <div class="price-card__price"><span class="price-card__from">Starting at</span><span class="price-card__amount" data-price="{price_key}">Ask for a quote</span></div>
            <a class="btn {btn_cls} btn--block" href="booking.html#{service}">{btn}</a>
          </article>"""


session_card = """
          <article class="price-card reveal">
            <span class="icon-badge" data-icon="camera"></span>
            <h3>Photo Sessions</h3>
            <p>In studio or outdoors &mdash; maternity, engagement, newborn, birthday &amp; more.</p>
            <ul>""" + li(["In-studio or outdoor setting", "Maternity, engagement, newborn, birthday &amp; others", "Kiddies sessions from 30 mins &mdash; bring your props &amp; outfits", "You choose your start &amp; end time", "Edited photos, prints &amp; digital files"]) + """</ul>
            <div class="price-card__price"><span class="price-card__from">Starting at</span>
              <div class="price-split">
                <div><small>30 mins</small><span class="price-card__amount" data-price="session30">Ask for a quote</span></div>
                <div><small>1 hr</small><span class="price-card__amount" data-price="session60">Ask for a quote</span></div>
              </div>
            </div>
            <a class="btn btn--ghost btn--block" href="booking.html#session">Book a session</a>
          </article>"""

faq = [
    ("Can you help with a venue for my wedding?", "Yes &mdash; for weddings we can connect you with Fiwi Place for the venue, chair and table rental, and catering. Just tick the Fiwi Place options in the wedding part of the booking form."),
    ("How do I book?", "Fill in the <a href=\"booking.html\">booking form</a>, or message us on WhatsApp at (876) 858-5172. Tell us the service, date and time, and we&rsquo;ll confirm your booking."),
    ("How do parents find their school photos?", "Every photo has an IMG number. Go to <a href=\"proofing.html\">Client Proofing</a>, enter the access code from your school, then search your child&rsquo;s IMG # to view and order."),
    ("I already have an ID card design. Can you print it?", "Absolutely. Choose &ldquo;I have a design and want to print&rdquo; when booking, then send your file on WhatsApp or by email."),
    ("Where is the studio?", "Shop #15 Hendon Mall, Beckford Street, Savanna-la-Mar, Westmoreland. <a data-link=\"directions\" href=\"https://www.google.com/maps\">Get directions on Google Maps</a>."),
]
faq_html = "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq)

services = page_hero(
    "Services", "Services &amp; pricing", "Services &amp; Pricing",
    "Services &amp; <em>pricing</em>",
    "Simple starting prices. Every booking is confirmed with you first &mdash; message us any time for a full quote.",
    '<a class="btn btn--primary" href="booking.html"><span data-icon="calendar"></span>Book now</a>' + WA_BTN,
) + f"""
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Packages</p>
          <h2>What we <em>offer</em></h2>
        </div>
        <div class="price-grid">
{price_card("rings", "Wedding Packages", "Custom packages for your day, from intimate ceremonies to full celebrations.", ["Custom packages available", "Ceremony &amp; reception coverage", "Prints &amp; digital files", "Venue &amp; catering via Fiwi Place"], "weddings", "wedding", "Plan your wedding", featured=True)}
{price_card("balloon", "Event Coverage", "Birthdays, parties and functions &mdash; covered from start to finish.", ["Birthdays &amp; parties", "Corporate, church &amp; community events", "You set the start &amp; end time", "Prints &amp; digital files"], "events", "event", "Book an event", delay=0.08)}
{price_card("cap", "School Packages", "Portraits and class photos for your whole school, with online proofing for parents.", ["Student portraits &amp; class photos", "Numbered photos (IMG #) for easy ordering", "Online proofing gallery for parents", "Prints &amp; digital files"], "school", "school", "Book school photos", delay=0.16)}
{session_card}
{price_card("user", "Portraits", "Studio portraits for school, work and business &mdash; and products that sell.", ["School portraits", "Professional &amp; business headshots", "Product photography", "Retouched, print-ready files"], "portraits", "portraits", "Book portraits", delay=0.08)}
{price_card("drone", "Aerial &amp; Drone", "Drone photos for properties, developments, resorts and venues.", ["Real estate &amp; property listings", "Developments &amp; construction progress", "Resorts, hotels &amp; venues", "Edited, high-resolution files"], "aerial", "aerial", "Book aerial photos")}
{price_card("id", "ID Printing", "ID cards for schools, businesses and organisations.", ["Printing &amp; programming", "Print your own design", "Or we photograph, design &amp; print", "Single cards or bulk orders"], "idPrinting", "id", "Order ID cards", delay=0.16)}
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container container--narrow">
        <div class="section-head reveal">
          <p class="eyebrow">Take them home</p>
          <h2>Prints &amp; <em>digital files</em></h2>
        </div>
        <div class="rows reveal">
          <div class="row-item"><div><h3>Prints</h3><p>Professional prints in standard sizes, from wallet to wall &mdash; printed in-house.</p></div><span class="row-item__price" data-price="prints">Ask for a quote</span></div>
          <div class="row-item"><div><h3>Digital files</h3><p>High-resolution edited images, ready to share or print anywhere.</p></div><span class="row-item__price" data-price="digital">Ask for a quote</span></div>
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container">
        <aside class="partner partner--wide reveal">
          <div>
            <span class="partner__label">Wedding add-ons</span>
            <h4>Venue, rentals &amp; catering with Fiwi Place</h4>
            <p>Planning a wedding? We&rsquo;ll connect you with Fiwi Place for the venue, chairs, table rental and catering &mdash; one less thing to organise.</p>
          </div>
          <a class="btn btn--primary" href="booking.html#wedding-fiwi">Add to my booking</a>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="container container--narrow">
        <div class="section-head reveal">
          <p class="eyebrow">Good to know</p>
          <h2>Questions, <em>answered</em></h2>
        </div>
        <div class="faq reveal">{faq_html}</div>
      </div>
    </section>
{cta_band()}
"""
page("services.html", "services", "Services & Pricing | Candid Expressions Photography",
     "Wedding packages, event coverage, school packages, photo sessions, portraits, aerial drone photos, ID printing, prints and digital files from Candid Expressions Photography.",
     services)


# --------------------------------------------------------------------------
# BOOKING
# --------------------------------------------------------------------------
def radios(name, label, options, required=True, values=None):
    out = []
    for i, o in enumerate(options):
        v = values[i] if values else o
        req = " required" if required and i == 0 else ""
        out.append(f'<label class="choice"><input type="radio" name="{name}" value="{v}" data-label="{label}"{req}><span>{o}</span></label>')
    return "".join(out)


def checks(name, label, options):
    return "".join(
        f'<label class="choice"><input type="checkbox" name="{name}" value="{o}" data-label="{label}"><span>{o}</span></label>'
        for o in options
    )


def group(label, inner, req=True, full=True):
    r = ' <span class="req">*</span>' if req else ""
    cls = " field--full" if full else ""
    return f'<div class="field{cls}" role="group" aria-label="{label}"><span class="field__label">{label}{r}</span><div class="choices">{inner}</div></div>'


def inp(name, label, type_="text", req=False, full=False, ph="", extra=""):
    r = " required" if req else ""
    star = ' <span class="req">*</span>' if req else ""
    cls = " field--full" if full else ""
    phs = f' placeholder="{ph}"' if ph else ""
    return f'<div class="field{cls}"><label for="f-{name}">{label}{star}</label><input class="input" id="f-{name}" name="{name}" type="{type_}" data-label="{label}"{phs}{r}{extra}></div>'


def addons(prefix):
    return f"""<div class="field field--full addons"><span class="addons__title">Add Fiwi Place</span><p>Want help with the venue, rentals or food? Tick what you need and we&rsquo;ll connect you with Fiwi Place.</p><div class="choices">{checks(prefix + "_fiwi", "Fiwi Place add-ons", ["Venue at Fiwi Place", "Chairs rental", "Table rental", "Catering"])}</div></div>"""


services_opts = [("wedding", "rings", "Wedding"), ("event", "balloon", "Birthday / Event"), ("school", "cap", "School photography"),
                 ("session", "camera", "Photo session"), ("portraits", "user", "Portraits"), ("aerial", "drone", "Aerial / drone"), ("id", "id", "ID printing")]
picker = "".join(
    f'<label class="service-opt"><input type="radio" name="service" value="{v}" data-label="Service" data-title="{t}"{" required" if i == 0 else ""}><span><span data-icon="{ic}"></span>{t}</span></label>'
    for i, (v, ic, t) in enumerate(services_opts)
)

panels = f"""
            <fieldset class="sub-panel" data-panel="session" hidden disabled>
              <legend class="sr-only">Photo session details</legend>
              <div class="fields fields--2">
                {group("Setting", radios("session_setting", "Setting", ["In studio", "Outdoor"]))}
                {group("Session type", radios("session_type", "Session type", ["Maternity", "Engagement", "Newborn", "Birthday", "Others"]) )}
                <div class="field field--full other-input" data-other-for="session_type" hidden><label for="f-session_other">Tell us the session type</label><input class="input" id="f-session_other" name="session_other" data-label="Other session type" placeholder="e.g. family, graduation, couple"></div>
                {group("Session length", radios("session_length", "Session length", ["30 mins", "1 hr"]))}
                {inp("session_date", "Date", "date", req=True)}
                {inp("session_start", "Time starts", "time", req=True)}
                {inp("session_end", "Time ends", "time", extra=' data-auto-end')}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="event" hidden disabled>
              <legend class="sr-only">Birthday or event details</legend>
              <div class="fields fields--2">
                {group("Type of event", radios("event_type", "Event type", ["Birthday", "Other event"]))}
                {inp("event_details", "Event name / details", full=True, ph="e.g. 5th birthday party, church anniversary")}
                {inp("event_date", "Date", "date", req=True)}
                {inp("event_location", "Location", req=True, ph="Venue or address")}
                {inp("event_start", "Time starts", "time", req=True)}
                {inp("event_end", "Time ends", "time", req=True)}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="wedding" hidden disabled>
              <legend class="sr-only">Wedding details</legend>
              <div class="fields fields--2">
                {inp("wedding_date", "Wedding date", "date", req=True)}
                {inp("wedding_location", "Location", ph="Ceremony / reception venue")}
                {inp("wedding_start", "Time starts", "time", req=True)}
                {inp("wedding_end", "Time ends", "time", req=True)}
                <div class="field field--full"><label for="f-wedding_package">Package</label><select class="input" id="f-wedding_package" name="wedding_package" data-label="Package" data-wedding-select><option>Not sure yet &mdash; help me choose</option><option>Custom package</option></select></div>
                {addons("wedding")}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="portraits" hidden disabled>
              <legend class="sr-only">Portrait details</legend>
              <div class="fields fields--2">
                {group("Portrait type", radios("portrait_type", "Portrait type", ["Schools", "Professional / business", "Products"]))}
                {inp("portrait_date", "Preferred date", "date", req=True)}
                {inp("portrait_time", "Preferred time", "time")}
                {inp("portrait_qty", "Number of people / products", "number", full=True, extra=' min="1"')}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="school" hidden disabled>
              <legend class="sr-only">School photography details</legend>
              <div class="fields fields--2">
                {inp("school_name", "School name", req=True, full=True)}
                {inp("school_role", "Your role", ph="e.g. Principal, teacher, PTA")}
                {inp("school_students", "Approx. number of students", "number", extra=' min="1"')}
                {group("What do you need?", checks("school_coverage", "Coverage", ["Student portraits", "Class photos", "School event", "Graduation", "ID cards"]), req=False)}
                {inp("school_date", "Preferred date", "date", req=True)}
                {inp("school_time", "Preferred start time", "time")}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="aerial" hidden disabled>
              <legend class="sr-only">Aerial photography details</legend>
              <div class="fields fields--2">
                {group("What would you like photographed?", radios("aerial_type", "Aerial subject", ["Real estate / property", "Development or construction", "Resort or hotel", "Event or venue", "Other"]))}
                {inp("aerial_location", "Location / address", req=True, full=True, ph="Property or site address")}
                {inp("aerial_date", "Preferred date", "date", req=True)}
                {inp("aerial_time", "Preferred time", "time")}
              </div>
            </fieldset>

            <fieldset class="sub-panel" data-panel="id" hidden disabled>
              <legend class="sr-only">ID printing details</legend>
              <div class="fields fields--2">
                {group("Which option?", radios("id_option", "ID option", ["Printing and programming", "I have a design and want to print", "I want Candid to take photographs, design and print"], values=["Printing and programming", "I have a design and want to print", "Candid to take photographs, design and print"]))}
                {inp("id_org", "School / business name")}
                {inp("id_qty", "How many cards?", "number", extra=' min="1"')}
                {inp("id_date", "Needed by", "date", full=True)}
                <p class="field--full field__hint" style="margin:0">Have a design file? Send it on WhatsApp or email after you submit this form.</p>
              </div>
            </fieldset>"""

aside = """
          <aside class="form-aside reveal" style="--delay:.1s">
            <div class="contact-list">
              <a class="contact-item contact-item--wa" data-link="wa" href="https://wa.me/18768585172"><span class="icon-badge" data-icon="wa"></span><span><small>WhatsApp &middot; fastest</small><strong>Chat with us now</strong></span></a>
              <a class="contact-item" data-link="tel" href="tel:+18769931818"><span class="icon-badge" data-icon="phone"></span><span><small>Call the office</small><strong>(876) 993-1818</strong></span></a>
              <a class="contact-item" data-link="mail" href="mailto:candidexpressionsphotography@gmail.com"><span class="icon-badge" data-icon="mail"></span><span><small>Email</small><strong>candidexpressionsphotography@gmail.com</strong></span></a>
              <a class="contact-item" data-link="directions" href="https://www.google.com/maps"><span class="icon-badge" data-icon="pin"></span><span><small>Studio &middot; tap for directions</small><strong>Shop #15 Hendon Mall, Beckford Street, Savanna-la-Mar, Westmoreland</strong></span></a>
            </div>
            <div class="map-frame mt-s"><iframe data-map-embed title="Map to Candid Expressions Photography at Hendon Mall" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
          </aside>"""

booking = page_hero(
    "Booking", "Book &amp; contact", "Book &amp; Contact",
    "Let&rsquo;s book your <em>session</em>",
    "Tell us what you need and we&rsquo;ll confirm by WhatsApp or phone. Prefer to chat? Message us any time.",
    WA_BTN + CALL_BTN,
) + f"""
    <section class="section">
      <div class="container form-shell">
        <form class="form-card reveal" id="booking-form" novalidate>
          <div class="form-step">
            <h2 class="form-step__title"><span>01</span>What are you booking?</h2>
            <div class="service-picker" role="radiogroup" aria-label="Service">{picker}</div>
{panels}
          </div>
          <div class="form-step">
            <h2 class="form-step__title"><span>02</span>Your details</h2>
            <div class="fields fields--2">
              {inp("name", "Full name", req=True, extra=' autocomplete="name"')}
              {inp("phone", "Phone / WhatsApp", "tel", req=True, ph="876-000-0000", extra=' autocomplete="tel"')}
              {inp("email", "Email", "email", full=True, extra=' autocomplete="email"')}
              <div class="field field--full"><label for="f-notes">Anything else?</label><textarea class="input" id="f-notes" name="notes" data-label="Notes" placeholder="Ideas, number of people, special requests&hellip;"></textarea></div>
            </div>
          </div>
          <div class="form-actions">
            <a class="btn btn--wa" data-send="wa" href="https://wa.me/18768585172" target="_blank" rel="noopener"><span data-icon="wa"></span>Send on WhatsApp</a>
            <a class="btn btn--ghost" data-send="email" href="mailto:candidexpressionsphotography@gmail.com"><span data-icon="mail"></span><span data-email-label>Send by email</span></a>
          </div>
          <p class="form-note">This opens WhatsApp or your email app with your details filled in. Just press send. You can also WhatsApp (876) 858-5172 or email candidexpressionsphotography@gmail.com.</p>
          <div class="form-status" role="status" aria-live="polite"></div>
        </form>
{aside}
      </div>
    </section>
"""
page("booking.html", "booking", "Book & Contact | Candid Expressions Photography",
     "Book wedding, event or school photography, a photo session, portraits, aerial drone photos or ID printing with Candid Expressions Photography. WhatsApp (876) 858-5172.",
     booking, scripts=["forms.js"])

# --------------------------------------------------------------------------
# PROOFING
# --------------------------------------------------------------------------
proofing = page_hero(
    "Proofing", "Client proofing", "Client Proofing",
    "Find &amp; order <em>your photos</em>",
    "Students, parents and clients: enter your access code, search your IMG number, then order prints or digital files.",
) + """
    <section class="section" id="proof-start">
      <div class="container">
        <div class="proof-gate reveal" id="proof-gate">
          <form class="form-card" id="proof-unlock" novalidate>
            <div class="lock-icon" data-icon="lock"></div>
            <h2 class="form-step__title" style="margin-bottom:8px">Unlock your gallery</h2>
            <p class="muted">Your access code is on the slip from your school or photographer.</p>
            <div class="fields mt-s">
              <div class="field"><label for="f-code">Access code <span class="req">*</span></label><input class="input" id="f-code" name="code" type="password" required autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
              <div class="field"><label for="f-img">IMG # <span class="field__hint">(optional &mdash; jump straight to your photo)</span></label><input class="input" id="f-img" name="img" inputmode="numeric" placeholder="e.g. 1024" autocomplete="off"></div>
            </div>
            <button class="btn btn--primary btn--block mt-m" type="submit"><span data-icon="lock"></span>Open gallery</button>
            <div class="form-status" role="status" aria-live="polite"></div>
            <p class="form-note">Lost your code or IMG #? <a data-link="wa" href="https://wa.me/18768585172">Message us on WhatsApp</a>.</p>
          </form>
        </div>
        <div class="proof-steps reveal" style="--delay:.1s">
          <div class="proof-step"><b>1</b><span><strong>Enter your code</strong>Given by your school or photographer.</span></div>
          <div class="proof-step"><b>2</b><span><strong>Search your IMG #</strong>Find it on your proof slip or receipt.</span></div>
          <div class="proof-step"><b>3</b><span><strong>Order</strong>Pick prints or digital files and send your order on WhatsApp.</span></div>
        </div>

        <div class="proof-app" id="proof-app" hidden>
          <div class="proof-head">
            <div>
              <p class="eyebrow" id="proof-gallery-name">Gallery</p>
              <h2>Your <em>photos</em></h2>
            </div>
            <div class="proof-search">
              <label class="sr-only" for="proof-q">Search IMG #</label>
              <input class="input" id="proof-q" inputmode="numeric" placeholder="Search IMG #" autocomplete="off">
              <button class="btn btn--ghost" type="button" id="proof-lock">Lock</button>
            </div>
          </div>
          <div class="proof-layout">
            <div class="proof-grid" id="proof-grid" aria-live="polite"></div>
            <aside class="proof-cart">
              <h3>Your order</h3>
              <ul class="cart-list" id="cart-list"></ul>
              <p class="cart-empty" id="cart-empty">Tap <strong>Add</strong> on a photo to start your order.</p>
              <form id="proof-order" novalidate>
                <div class="fields">
                  <div class="field"><label for="f-oname">Your name <span class="req">*</span></label><input class="input" id="f-oname" name="name" required autocomplete="name"></div>
                  <div class="field"><label for="f-ophone">Phone / WhatsApp <span class="req">*</span></label><input class="input" id="f-ophone" name="phone" type="tel" required autocomplete="tel"></div>
                  <div class="field"><label for="f-ostudent">Student name / class <span class="field__hint">(school photos)</span></label><input class="input" id="f-ostudent" name="student"></div>
                </div>
                <div class="form-actions" style="grid-template-columns:1fr">
                  <a class="btn btn--wa" data-send="wa" href="https://wa.me/18768585172" target="_blank" rel="noopener"><span data-icon="wa"></span>Send order on WhatsApp</a>
                  <a class="btn btn--ghost" data-send="email" href="mailto:candidexpressionsphotography@gmail.com"><span data-icon="mail"></span>Send by email</a>
                </div>
                <div class="form-status" role="status" aria-live="polite"></div>
                <p class="form-note">We&rsquo;ll confirm prices and pickup or delivery with you.</p>
              </form>
            </aside>
          </div>
        </div>
      </div>
    </section>
"""
page("proofing.html", "proofing", "Client Proofing | Candid Expressions Photography",
     "Find your school or session photos by IMG number and order prints or digital files from Candid Expressions Photography.",
     proofing, scripts=["proofing.js"])

# --------------------------------------------------------------------------
# TESTIMONIALS
# --------------------------------------------------------------------------
star_inputs = "".join(
    f'<input type="radio" id="r{n}" name="rating" value="{n} / 5" data-label="Rating"{" checked" if n == 5 else ""}><label for="r{n}" aria-label="{n} star{"s" if n > 1 else ""}"><span data-icon="star"></span></label>'
    for n in range(5, 0, -1)
)

testimonials = page_hero(
    "Reviews", "Testimonials", "Reviews",
    "Kind <em>words</em>",
    "What couples, families, schools and clients say about working with Candid Expressions.",
) + f"""
    <section class="section">
      <div class="container">
        <div class="quotes" data-testimonials data-empty-target="#reviews-empty"></div>
        <div class="empty reveal" id="reviews-empty" hidden>
          <span class="icon-badge" data-icon="heart"></span>
          <h3>Reviews are on their way</h3>
          <p>We&rsquo;re collecting feedback from recent couples, families and schools. Had a session with us? We&rsquo;d love to hear about it.</p>
          <div class="btn-row"><a class="btn btn--primary" href="#leave-review">Leave a review</a></div>
        </div>
      </div>
    </section>

    <section class="section section--alt" id="leave-review">
      <div class="container split">
        <div class="reveal">
          <p class="eyebrow">Leave a review</p>
          <h2>Share your <em>experience</em></h2>
          <p class="lead mt-s">Tell us about your wedding, event, session or school picture day. With your permission, we&rsquo;ll feature your words here.</p>
        </div>
        <form class="form-card reveal" id="review-form" style="--delay:.1s" novalidate>
          <div class="fields fields--2">
            {inp("name", "Your name", req=True, extra=' autocomplete="name"')}
            {inp("role", "Wedding / event / session / school", ph="e.g. Bride, June 2026 wedding")}
            <div class="field field--full"><span class="field__label">Rating</span><div class="rating">{star_inputs}</div></div>
            <div class="field field--full"><label for="f-review">Your review <span class="req">*</span></label><textarea class="input" id="f-review" name="review" data-label="Review" required></textarea></div>
            <label class="choice field--full"><input type="checkbox" name="permission" value="Yes" data-label="OK to publish" checked><span>You may share my review on your website</span></label>
          </div>
          <div class="form-actions">
            <a class="btn btn--wa" data-send="wa" href="https://wa.me/18768585172" target="_blank" rel="noopener"><span data-icon="wa"></span>Send on WhatsApp</a>
            <a class="btn btn--ghost" data-send="email" href="mailto:candidexpressionsphotography@gmail.com"><span data-icon="mail"></span>Send by email</a>
          </div>
          <div class="form-status" role="status" aria-live="polite"></div>
        </form>
      </div>
    </section>
{cta_band()}
"""
page("testimonials.html", "testimonials", "Reviews & Testimonials | Candid Expressions Photography",
     "Reviews from couples, families, schools and clients of Candid Expressions Photography in Savanna-la-Mar, Westmoreland.",
     testimonials, scripts=["forms.js"])

# --------------------------------------------------------------------------
# 404
# --------------------------------------------------------------------------
nf = page_hero("404", "Page not found", "Not found", "This moment <em>got away.</em>",
               "The page you&rsquo;re looking for isn&rsquo;t here. Try the home page or our galleries.",
               '<a class="btn btn--light" href="index.html">Go home</a><a class="btn btn--outline-light" href="galleries.html">View galleries</a>')
page("404.html", "404", "Page not found | Candid Expressions Photography", "Page not found.", nf)
print("built")
