# Chappa Auto: website redesign concept

A 7-page static site (plain HTML, CSS and JavaScript, no build step) for **Chappa Auto**: auto parts, tyres, Shell
lubricants and wholesale, with five published branches in Jamaica. Built from the official-site photos and facts in
`_source/` by Steven Scale Solutions.

> **This is an owner-approval concept.** The business owner must approve the facts, the photos and the third-party
> brand marks (Shell, BMK, Power King, Aoteli, iLink, vehicle makers) **before it goes live**. Every unconfirmed
> detail is shown on the page as a dashed "to be confirmed" chip and marked `<!-- TODO -->` in the HTML.

## What's where

| Path | What it is |
|---|---|
| `index.html` | Home: intro, hero video, welcome, showcase, promo, searchable catalog, spotlight tabs, gallery, branch finder |
| `auto-parts.html` `tyres.html` `shell-lubricants.html` `wholesale.html` `locations.html` `about.html` | Inner pages |
| `css/styles.css` | All styles. Colours and fonts are the tokens at the top (`--brand`, `--gold`, `--navy`…) |
| `js/main.js` | All behaviour. **The data block at the top** holds the branches, hours and catalog |
| `assets/img/`, `assets/video/` | Optimised images (WebP + JPG/PNG fallback) and videos |
| `content/business.json` | Every fact used, plus the `missing` list (what the owner still has to confirm) |
| `content/media.json` | Every supplied image with its role: used, rejected, or held back, and why |
| `tools/` | Scripts that rebuild the media and test the site (see below) |
| `_source/` | Untouched originals, the brief and the research notes. **Not** part of the website, and **not committed to git** (the repository is public and these files are not rights-cleared). Copy the client's original zip back into `_source/` before running the rebuild tools |
| `_redirects` | Old WordPress URLs → new pages (Netlify reads this file) |

## Editing

- **Text:** edit the HTML page directly. The nav, footer and quote pop-up are repeated in every page; use
  search-and-replace across the folder when you change them.
- **Branches, phone numbers, hours, catalog:** edit the `SITE` block at the top of `js/main.js` (used by the catalog,
  the quote pop-up and the hours). The branch cards on `index.html`, `locations.html`, `wholesale.html` and the footer
  branch list are plain HTML, so update those too (search for the old number).
- **Opening hours (once confirmed):** in `js/main.js`, replace a branch's `"hours":null` with
  `{"mon":[["08:30","17:00"]],"tue":[["08:30","17:00"]],…,"sun":[]}` (24-hour, Jamaica time). The hours table and the
  live **Open now / Closed** badge appear automatically. Then add the hours to `content/business.json` as well.
- **Colours:** change the tokens at the top of `css/styles.css`. The brand red is `--brand` (#CC2721, from the current
  site's CSS), navy is `--navy` (#041165), yellow is `--gold` (#FCD21A).
- **Prices:** none were published, so the catalog has "Ask ↗" buttons instead. Add `"price":"JMD $…"` to a catalog item
  in `js/main.js` and it will show after the dotted leader.

## Photos and video

No videos were supplied, so the hero and the intro are built from the real Molynes Road storefront photo and the
brand pack shots on brand-colour backgrounds (`tools/compose.py`). Stock images and decorative backgrounds from the
old site were rejected; photos with people (`Shell-3`, `Shell-5`) are held back until releases are confirmed. See
`content/media.json`.

Rebuild everything from `_source/` (needs Python + Pillow and ffmpeg):

```bash
bash tools/build_images.sh     # product cut-outs, frames, crops, WebP/JPG sets, favicons, OG image
bash tools/make_hero.sh        # assets/video/hero.mp4/.webm + hero-poster.jpg
python3 tools/make_intro.py    # assets/video/intro(.mp4/.webm) + intro-mobile
```

- **Swap the hero for a real video:** put the clip in `_source/`, then follow the master prompt's stage 5B
  (`ffmpeg … -an -crf 24 … assets/video/hero.mp4`, a WebM copy and a poster). Keep it under 6 MB.
- **New photos:** add them to `_source/photos/`, add a line to `tools/stage_web.py`, run `bash tools/build_images.sh`,
  then reference `assets/img/<name>-480.webp` etc. in a `<picture>` like the existing ones.
- **The opening intro:** edit the `SHOTS` list in `tools/make_intro.py` and re-run it. To **turn the intro off**, in
  each page's first `<script>` in `<head>` change `if(!seen&&!still&&!save)` to `if(false)`.
- **Footer credit:** the "DONE BY Stevenscalesolutions.com" image (`done-by-sss.jpg`) was not supplied, so the footer
  shows the text credit. To use the image: put it in `_source/`, run
  `python3 tools/optimize_images.py _source/done-by-sss.jpg assets/img`, and replace the `<a class="credit">` in each
  page with the `<picture>` version from the master prompt (section 7, item 11).

## Testing

```bash
node tools/qa.js . qa             # every page at 375/768/1440 px: errors, 404s, broken images, alt text, anchors, overflow
node tools/interactions.js . qa   # drawer, quote pop-up, lightbox, tabs, search, links, open-now, intro timing/skip/Esc
```

## Deploying (after the owner approves)

- **Netlify Drop:** drag this folder (without `_source/` and `qa/`) onto https://app.netlify.com/drop. `_redirects`
  sends the old WordPress addresses to the new pages.
- **Vercel:** `npx vercel` in this folder.
- **GitHub Pages:** push the folder, then Settings → Pages.
- Before launch: confirm the domain (canonical, Open Graph, `robots.txt` and `sitemap.xml` assume
  `https://chappaauto.com/`), then add the confirmed address, telephone and hours to the JSON-LD in `index.html`. They
  are left out on purpose until the owner confirms them.
