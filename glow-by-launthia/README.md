# Glow by Launthia — demo site

Single-file, mobile-first demo site for Glow by Launthia (Launthia Watson, luxury destination bridal makeup artist, Jamaica), in her soft neutral palette: ivory, cream, sand, nude, taupe, mocha, espresso and a muted champagne-gold.

- `index.html` — the finished site. One file: HTML, CSS, JS and every photo/reel clip inlined. Only three.js (r128) loads from cdnjs.
- `src/page.html` — the editable source (no media inlined).
- `assets/` — the optimised photos (WebP) and reel clips (short, 360×640, muted H.264) that get inlined.
- `build.py` — rebuilds `index.html` from `src/` + `assets/`: `python3 build.py`

## Adding Amazon products

At the top of the main `<script>` in `src/page.html`:

```js
var STOREFRONT_URL = '';            // her Amazon storefront link
var PRODUCTS = [
  { category: 'Face', name: '', note: '', url: '', image: '' },
  ...
];
```

Categories: `Face`, `Eyes`, `Lips`, `Brushes & Tools`, `Skin Prep`. Fill in `name`, `note` ("Why I love it"), `url` (product or affiliate link) and optionally `image`. Empty fields show a labelled placeholder; empty links show a "coming soon" note instead of navigating. Then run `python3 build.py`.

## The Looks (spotlight gallery)

`LOOKS` (top of the main script) holds one entry per gallery photo: fill in `name` (Soft Glam / Full Glam / Bridal Glam) for the caption and WhatsApp message. Each look's background colours are sampled from the photo in the browser and softened toward the neutrals; `fallback` palettes are used if sampling is blocked.

## Glow Club (client reactivation)

- Every booking and every Glow Club sign-up saves the client (name, WhatsApp, service, event date, event type, birthday, consent). Only clients who tick consent get reminders.
- Owner dashboard: open `#owner` (or "Owner login" in the footer). Demo passcode: `glow` — replace with real sign-in before launch.
- Rules (editable): fresh-glam reminder after 4 weeks, win-back after 8+ weeks, birthday 7 days before, bridal anniversary at 1 year, seasonal campaigns to chosen clients. Messages use editable templates.
- "Send on WhatsApp" opens wa.me with the message ready; the reminder is then marked Sent and logged. Fully automatic sending would need the WhatsApp Business API and a small backend.
- Data lives in the browser's localStorage (`glowclub.v1`); export/import JSON from the Data tab. A live multi-device version needs a small database.
- Data → "Load sample clients" adds six clearly labelled sample clients for demos; "Clear sample data" removes them.

## What's in it

- Cinematic intro (about 14 s, with Skip intro): black to ivory satin, the chrome GLOW forms, an 8-second montage of her clips (`assets/intro-montage.mp4`, built from the intro clips) in a floating 3D frame with ripple transitions and floating pearls, then it settles into a slow frosted loop behind the hero.
- WebGL hero: a slow satin shader in cream, beige, nude and taupe that follows the cursor; a brushed champagne-pearl "GLOW" wordmark with a soft light sweep; an interactive pearl, nude and champagne-gold 3D lipstick (drag or arrow keys) circled by "FULL GLAM • SOFT GLAM • BRIDAL GLAM" ring text; fine powder shimmer.
- Scroll-zoom portrait (soft glam to full glam), layered parallax, reveals, hover-lift cards.
- About portrait with floating pearls, nude spheres and thin champagne rings.
- Services: Soft Glam and Full Glam with J$ price placeholders; Bridal Glam with "Pricing on request" and a "WhatsApp for Bridal Pricing" button.
- Portfolio with liquid-ripple hover, and a photo viewer that flies the photo into place.
- Gallery ("Every glow"): every photo the owner sent (30: her Instagram photos, reel stills, more client looks and her portrait) with the same ripple hover, glow background and flying photo viewer, plus Bridal / Glam / In the chair filters. Hovering a photo ripples through to another shot of the same look where one exists.
- Reels as autoplaying muted phones with 3D tilt.
- Shop Launthia's Favourites: filter tabs, 3D-tilt product cards, storefront button, Amazon Associate disclosure.
- Booking form with service picker, calendar and a live booking ticket; choosing Bridal Glam hides prices and switches the button to "WhatsApp for Bridal Pricing".
- Mobile menu: full-screen espresso satin overlay that grows as a circle from the menu button; numbered links (Home, Services, Gallery, Reels, Shop, Glow Club, Book) with the current section underlined; WhatsApp pill, Instagram and YouTube, location line; scroll locked while open; closes on X, Escape or a vertical swipe; focus stays inside while open.
- Motion: every in-page link scrolls with an eased glide (offset for the nav); headings rise and unblur, cards stagger in and photos unmask as they enter the screen; buttons, cards and photos press in with a champagne ripple; services cards expand on tap on phones; the photo viewer's backdrop takes its colour from each photo, follows your finger on swipes, and flies the photo home on a swipe down; a short logo loader covers font loading.
- Performance: DPR capped at 2, lighter shaders and fewer particles below 768px, WebGL paused off-screen, automatic resolution drop on slow devices, and a static, motion-free version for `prefers-reduced-motion`.

## Placeholders to fill before launch

Search the source for `[Owner to`: prices (J$), what's included, her story, destination / travel details, hours, email, studio location, reviews, Amazon storefront and product details.

## Media

Photos and reels come from @glow_by_launthia's public Instagram reels and her YouTube Short. Use only with the owner's permission.

## Showcase film

`showcase/glow-showcase.html` is a 60-second promo film of the site in one self-contained file: the real website plays inside a floating phone over a satin shader, with captions, scripted taps and swipes, and an end card. 9:16 (default) or 16:9, progress bar, on-screen timer, Play/Pause, Restart, Record mode (hides every control for clean screen recording) and Full screen. Keys: Space play/pause, R restart, M record mode (Esc to leave), T timer, 1 / 2 for 9:16 / 16:9. No audio, so music and voiceover can be added in editing.

`showcase/glow-showcase-laptop.html` is the laptop edition (16:9): the desktop site on a floating laptop, with a mouse cursor that hovers (card lifts, the photo ripple, 3D shop tilt, the site's own cursor ring) and clicks through the same nine scenes. Same controls, minus the ratio switch.

Rebuild both after changing the site: `python3 build.py && python3 showcase/build_showcase.py`. Each film's script lives in `showcase/src/` (scene timings are in `SCRIPT` and `SCENES`).

