# Glow by Launthia — demo site

Single-file, mobile-first demo site for Glow by Launthia (Launthia Watson, luxury destination bridal makeup artist, Jamaica).

- `index.html` — the finished site. One file: HTML, CSS, JS and every photo/reel clip inlined. Only three.js (r128) loads from cdnjs.
- `src/page.html` — the editable source (no media inlined).
- `assets/` — the optimised photos (WebP) and reel clips (9.5 s, 360×640, muted H.264) that get inlined.
- `build.py` — rebuilds `index.html` from `src/` + `assets/`: `python3 build.py`

## What's in it

- WebGL hero: liquid espresso/bronze/gold shader that reacts to the cursor, a liquid-gold chrome "GLOW" wordmark with a light sweep, an interactive 3D lipstick (drag/arrow keys to spin) circled by ring text, and gold dust particles.
- Scroll-zoom portrait, layered parallax, reveal-on-scroll, hover-lift cards.
- About portrait with floating pearls, gold spheres and rose-gold rings (WebGL).
- Portfolio with a water-ripple image transition on hover and in the lightbox.
- Reels as autoplaying muted phones with 3D tilt (desktop) or cover-flow (phones).
- Booking form that opens WhatsApp (wa.me/18762778913) with the message pre-filled.
- Performance: DPR capped at 2 (1.6 on phones), lighter shaders/particles on phones, WebGL paused off-screen, automatic resolution drop on slow devices, `prefers-reduced-motion` gets a static render with no scroll motion or autoplay.

## Placeholders to fill before launch

Search the source for `[Owner to`:
prices (J$) per look, her story, travel areas / destination fee, hours, email, studio location (Little London vs WestJ's Uptown Mall), bridal photos, and client reviews.

## Media

Photos and reels come from @glow_by_launthia's public Instagram reels and her YouTube Short. Use only with the owner's permission.
