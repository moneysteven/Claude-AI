# Home Solutions — website

Marketing website for **Home Solutions & Hardware Ltd** (windows, doors, glass;
9 branches across western and central Jamaica). Built from `BRIEF.md`.

Stack: Vite + vanilla JS (ES modules) + modern CSS. GSAP + ScrollTrigger + Flip
for motion, Lenis for smooth scroll, Leaflet (lazy-loaded) for the branch map.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # static site in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`dist/` is a plain static site: upload it to any host (Netlify, Vercel,
Cloudflare Pages, cPanel/Hostinger `public_html`, S3…).

## Where things live

| What | Where |
|---|---|
| **Every business fact** (names, phones, hours, branches, products, prices, reviews) | `src/config.js` — the single source of truth. Change it here and rebuild. |
| Page sections (markup, styles, behaviour) | `src/sections/<name>/` — `markup.js` is rendered to HTML at build time, `index.js` adds behaviour in the browser, `style.css` styles it |
| Design tokens (colours, fonts, spacing) | `src/styles/tokens.css` |
| Shared helpers (prices, phone format, opening hours, quote basket, motion) | `src/lib/` |
| Original photos/videos | `assets/own/` (the business's), `assets/stock/` (Pexels) |
| Optimised images / videos served by the site | `public/img/`, `public/video/` (generated) |

Because content is rendered to HTML at build time, the site is readable and
crawlable without JavaScript; forms fall back to email.

## Regenerating media

```bash
npm run images     # assets/*.jpg|png -> public/img/*.webp|avif + manifest.json
npm run videos     # hero + section clips -> public/video/ (needs ffmpeg)
node scripts/og.mjs  # social share image + apple-touch-icon
npm run geo        # Jamaica coastline for the map fallback
```

## Checks

```bash
node scripts/test-hours.mjs                 # open-now badge in Jamaica time
node scripts/check-section.mjs <section…>   # render + lint one section
```

## Before launch — needs the business

Search the code for `TODO(business)`. The main ones:

- **WhatsApp number** (`whatsapp: "TBC"`): WhatsApp buttons are hidden until it's set.
- **Formspree form id** (`forms.formspreeId: "TBC"`): until set, forms open a
  pre-filled email to info@homesolutionsjm.com.
- **Opening hours**: sources disagree (see comment in `src/config.js`).
- **Branch map pins**: only Negril is exact; others are town-level (`approx:true`).
- **Prices**: from the Feb 2025 archived store; confirm current prices.
- **Reviews**: get the business's OK to publish the three Google quotes.
- **Before/after**: replace the sample pair with a real before/after.
- **Logo**: a vector logo file would replace the SVG recreation.
