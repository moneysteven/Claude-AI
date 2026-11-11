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

## What's in it

- WebGL hero: a slow satin shader in cream, beige, nude and taupe that follows the cursor; a brushed champagne-pearl "GLOW" wordmark with a soft light sweep; an interactive pearl, nude and champagne-gold 3D lipstick (drag or arrow keys) circled by "FULL GLAM • SOFT GLAM • BRIDAL GLAM" ring text; fine powder shimmer.
- Scroll-zoom portrait (soft glam to full glam), layered parallax, reveals, hover-lift cards.
- About portrait with floating pearls, nude spheres and thin champagne rings.
- Services: Soft Glam and Full Glam with J$ price placeholders; Bridal Glam with "Pricing on request" and a "WhatsApp for Bridal Pricing" button.
- Portfolio with liquid-ripple hover, and a photo viewer that flies the photo into place.
- Reels as autoplaying muted phones with 3D tilt.
- Shop Launthia's Favourites: filter tabs, 3D-tilt product cards, storefront button, Amazon Associate disclosure.
- Booking form with service picker, calendar and a live booking ticket; choosing Bridal Glam hides prices and switches the button to "WhatsApp for Bridal Pricing".
- Performance: DPR capped at 2 (1.6 on phones), lighter shaders on phones, WebGL paused off-screen, automatic resolution drop on slow devices, and a static, motion-free version for `prefers-reduced-motion`.

## Placeholders to fill before launch

Search the source for `[Owner to`: prices (J$), what's included, her story, destination / travel details, hours, email, studio location, bridal photos, reviews, Amazon storefront and product details.

## Media

Photos and reels come from @glow_by_launthia's public Instagram reels and her YouTube Short. Use only with the owner's permission.
