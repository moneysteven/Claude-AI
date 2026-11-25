# Sealand Foods International Co. Ltd · website

One-page site for **Sealand Foods International Co. Ltd (Retail Store & Deli)** and its **Sealand Sub** deli.
Plain HTML/CSS/JS: open `index.html` or serve the folder from any static host. No build step.

Facts come from the client's walkthrough video (`IMG_1612.MOV`: door poster, hours sign, in-store banners, dessert-menu
screen) and five screen recordings of the business's Instagram (@sealandfoods: logo, product photos, WhatsApp numbers,
"Since 2003", www.sealandfoodsja.com, the two Sweet Deals prices). Nothing was invented. Open items are listed in
`content/business.json` under `"missing"` and marked `TODO` in the HTML.

## What's where

```
index.html               the page (sections 0–13, in order)
css/styles.css           design system + all styles (colours at the top, in :root)
js/main.js               DATA block at the top (catalog, hours, timezone), then all behaviour
assets/img/              photos (WebP 480/960 + JPG fallback), posters, og.jpg
assets/video/            hero(.mp4/.webm), hero-mobile, intro, intro-mobile, loop-walkin, loop-inside
assets/favicon.svg …     favicon + apple-touch icon
content/business.json    every fact used, with where it was read from
content/media.json       what each part of the video was used for (and what was rejected)
tools/                   scripts that rebuilt the media and test the site (see below)
_source/                 originals (not linked, not committed: the 108 MB video stays local)
```

## Common edits

- **Text:** edit `index.html` directly. Section comments (`<!-- 4. SHOWCASE -->` etc.) mark each block.
- **Catalog / prices:** `js/main.js` → `DATA.catalog`. Each item is `{ name, desc, price, category, tag }`.
  Add a price like `price: 'JMD $1,200'`; leave `''` to hide it. A new `category` automatically becomes a filter chip.
- **Hours:** `js/main.js` → `DATA.hours` (24-hour clock, `[]` = closed). The Open now / Closed badge uses
  Jamaica time. Also update the static hours in the footer and in the JSON-LD in `<head>`.
- **Phone numbers:** search `index.html` for `tel:+1876…`. Links use E.164 (`tel:+18769528295`).
- **WhatsApp:** (876) 502-7314 and (876) 217-7171 (from the Instagram contact card). Links are
  `https://wa.me/18765027314?text=…` in the Action modal, the Visit card, the footer and the floating button.
- **Products (the Sealection):** the `<ul class="prods">` grid in `index.html`; photos in `assets/img/products/`
  (cut from the Instagram recordings with their own crops; see `_source/products/`).
- **Colours:** `css/styles.css` → `:root` (`--brand` sign green, `--gold` Sealand Sub yellow, `--ember` SF red, `--ocean` SF blue).

## Media made with AI (no people in the videos)

The client asked for the person at the door to be removed, so the walk-in is generated, not filmed:
1. `_source/ai/storefront-clean.png`: the 7.0 s storefront frame with the passer-by removed (Higgsfield, GPT Image 2.6 edit).
2. `_source/ai/interior-clean.png`: the 13.4 s interior frame with the staff member behind the counter removed (same tool).
3. `_source/ai/walkin-ai.mp4`: 6.6 s walk-in between those two frames, with the doors opening by themselves
   (Higgsfield, MiniMax H3, start + end frame).
4. `bash tools/make_hero_ai.sh` dissolves it into the real footage of the drinks chillers and cuts the hero, phone hero,
   posters and the two gallery loops. `python3 tools/make_intro.py` builds the intro from the AI clip, product photos and
   people-free moments of the walkthrough.
Some interior photos in the gallery and cards (deli counter, display cases) still show staff from behind.

## Swapping media

- **Photos:** drop new files in `_source/crops/` and run `python3 tools/optimize_images.py _source/crops assets/img`,
  then point the `<picture>` tags at the new names (keep `width`/`height` matching the image).
- **Hero video:** replace `assets/video/hero.mp4/.webm` (16:9, wide screens) and `hero-mobile.mp4/.webm` (9:16, phones),
  plus `assets/img/hero-poster.jpg` / `hero-poster-mobile.jpg`. Keep each hero under 6 MB, muted, no audio.
- **Rebuild everything from the original video** (put it at `_source/walkthrough.mov` first):
  ```bash
  bash tools/grade_source.sh        # colour-corrected master (removes the green cast inside), ~10 min
  bash tools/make_hero.sh           # hero + phone hero + gallery loops + posters
  python3 tools/make_intro.py       # opening intro (wide + phone)
  python3 tools/pick_stills.py      # sharpest frame per moment
  python3 tools/crop_stills.py      # crops + white balance + dessert-menu card
  python3 tools/optimize_images.py _source/crops assets/img
  ```

## Opening intro

About 6 s: quick cuts → SF logo → the site wipes in. It plays once per visit (sessionStorage), never with reduced motion,
data saver or without JavaScript. "Skip intro" and Esc skip it. If the video fails, the logo shows at once.

- **Change the shots:** edit `SHOTS` in `tools/make_intro.py` and re-run it.
- **Turn it off:** delete the `<div class="opener">…</div>` block and the small script right after it in `index.html`,
  and the `opener-on` script in `<head>`.

## Testing

```bash
node tools/qa.js . qa          # 375/768/1440 px screenshots; fails on JS errors, 404s, broken images, missing alt, overflow
node tools/interact.js . qa    # drawer, modal (every CTA), search/chips, tabs, lightbox, links, open-now badge, intro timing
```

## Publishing

It is a static folder: upload the contents (everything except `_source/`, `qa/` and `tools/`) to the web root.
Canonical, og:url and the JSON-LD use https://www.sealandfoodsja.com/ (the domain on their Instagram post).
