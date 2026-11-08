# ChillPops Jamaica website (concept)

A seven-page static website for ChillPops Jamaica, gourmet paletas in Negril and Ocho Rios. It is plain HTML, CSS and JavaScript, with no build step. Open `index.html` in a browser or upload the folder to any static host.

**Status: concept.** The site is not official until the owner approves it. Until then:
- every page carries `<meta name="robots" content="noindex, nofollow">`, so search engines skip it;
- the footer shows a "Concept site · awaiting owner approval" label.

When the owner signs off, delete the robots line from each page and remove the label from the footer.

## What's where

| Path | What it is |
|---|---|
| `index.html` | Home: intro video, hero, welcome, showcase, featured flavours, promo, "Pick your vibe" tabs, gallery preview, Negril visit block |
| `flavours.html` | Searchable, filterable list of publicly featured flavours (no prices) |
| `story.html` | Our Story: Damir Tufail, September 2020 opening, the handmade furniture, Bug Art, timeline, press |
| `locations.html` | Negril (main shop) and Ocho Rios (Island Village), with maps |
| `visit.html` | Visit & contact: directions, Instagram, Facebook, email, phone and hours placeholders |
| `gallery.html` | Photo and video gallery with lightbox, plus labelled frames for photos still needed |
| `press.html` | Links out to the Gleaner (2021) and Observer (2022) articles |
| `css/styles.css` | All styles. Colours and fonts are the tokens at the top |
| `js/main.js` | All behaviour. **Business details, hours and flavours are the data block at the top** |
| `js/motion.js` | The animation layer: rising headline letters, drifting embers, photo curtain reveals, palm-frond shade, scroll-reactive strip, tilting cards, sliding tab pill. Delete its `<script>` tag from a page to switch it off. It never runs for visitors who ask for reduced motion |
| `assets/img/`, `assets/video/` | Optimised photos (WebP + JPG) and videos (WebM + MP4) |
| `content/business.json` | Every fact used, its source, the conflicts, and what's still missing |
| `content/media.json` | Each supplied photo and video, its role, where it's used and how it was cleaned |
| `tools/` | Image optimiser, overlay clean-up, intro builder, QA script |
| `_source/` | The original files, untouched (not linked from the site) |

## Common edits

**Phone, email, WhatsApp, hours.** Open `js/main.js` and edit `BIZ` at the top:
```js
phone: '(876) 555-1234',          // shows everywhere as a tap-to-call link, and adds a Call row to the "Plan your visit" pop-up
whatsapp: '18765551234',          // adds a WhatsApp row to the pop-up
email: 'chillpopsjamaica@gmail.com',   // currently a DRAFT from Tripadvisor, so confirm it
hours: { negril: { mon: [['10:30', '21:00']], ... } }  // 24-hour clock, Jamaica time
```
Empty values show "To be confirmed". Once hours are filled in, each page shows an hours table, highlights today, and shows an "Open now / Closed now" badge worked out in Jamaica time. When the phone and both sets of hours are filled in, the "still being confirmed" notes disappear on their own.

Then also add `"telephone"` and `"openingHoursSpecification"` to the JSON-LD block in `index.html` and `locations.html`. Search engines read that block, not the JavaScript.

**Flavours and prices.** Edit `FLAVOURS` in `js/main.js`:
- each entry has a name `n`, a group `g` (`fruit`, `creamy`, `spiked`, `soft` or `toppings`) and a description `d`;
- `a: 1` marks an item that contains alcohol;
- `f: 1` shows the item on the home page;
- `c` holds the two illustration colours.

The list is currently publicly featured examples, not a current menu. When the owner sends a menu, replace the list. Then update the intro line at the top of `flavours.html`, which says the flavours change. To show prices, add a `p` field (for example `p: 'JMD $600'`) and print it in the catalog template next to `mitem__src`.

**Colours and fonts.** Edit the tokens at the top of `css/styles.css`. `--pink` is the neon accent on dark backgrounds, `--brand` is the button pink, and `--gold` is the amber filament colour. No brand guide exists, so these colours were picked from the shop photos.

**Photos.**
1. Put new originals in `_source/`.
2. Run `python3 tools/optimize_images.py _source/new-photo.jpg assets/img` to make the WebP and JPG sizes.
3. Swap the file names in the page's `<picture>` (both the `srcset` and the `img src`). Keep the `width` and `height` attributes correct.
4. In `gallery.html`, replace a `tile--ph` placeholder `<div>` with a copy of a `<button class="tile">` block.

**Hero video.** Replace `assets/video/hero.webm`, `hero.mp4` and `assets/img/hero-poster.jpg`. On desktop the video plays inside the paleta-shaped frame; on phones it fills the screen. Recipe (stage 5B of the master prompt):
```bash
ffmpeg -y -ss 0 -t 10 -i _source/new.mp4 -vf "fps=30" -an -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart assets/video/hero.mp4
ffmpeg -y -i assets/video/hero.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -an assets/video/hero.webm
ffmpeg -y -ss 0.5 -i assets/video/hero.mp4 -frames:v 1 -q:v 3 assets/img/hero-poster.jpg
```

**Opening intro.** About 4 seconds of quick cuts, then the CHILLPOPS name, then the page reveals. It plays once per visit and is skipped with reduced motion, data saver or no JavaScript.
- **Rebuild it** after changing the shot list in `tools/make_intro.py`: run `python3 tools/make_intro.py` from this folder.
- **Turn it off:** delete the `<div class="opener">…</div>` block and the small script after it from each page. You can leave the head script; it does nothing without the opener.

**Photo clean-up.** `tools/clean_overlays.py` removes the Instagram mute icons, the "1/2" counter, the "Chill Pops Ja" location tag, the Baileys "#AD" mark and the screen-recording borders. Its output goes to `_source/clean/`.

## Footer credit

The agency credit image `done-by-sss.jpg` was not in the repo or the uploads, so the footer uses the text link "Website by stevenscalesolutions.com". To use the image:
1. Put the file in `_source/`.
2. Run `python3 tools/optimize_images.py _source/done-by-sss.jpg assets/img`.
3. In every page, replace the text link with:
```html
<a class="credit" href="https://stevenscalesolutions.com" target="_blank" rel="noopener"><picture>
  <source type="image/webp" srcset="assets/img/done-by-sss-480.webp 480w, assets/img/done-by-sss-960.webp 960w" sizes="300px">
  <img src="assets/img/done-by-sss.jpg" width="1280" height="174" alt="Done by Stevenscalesolutions.com" loading="lazy" decoding="async"></picture></a>
```
(The `.credit` styles are already in the CSS.)

## Test

```bash
node tools/qa.js . qa
```
This serves the site, scrolls every page at 375, 768 and 1440 px, and saves screenshots to `qa/`. It fails on console errors, missing files, broken images, missing alt text, broken links or sideways scrolling.

## Deploy

- **Netlify Drop:** drag this folder onto app.netlify.com/drop.
- **Vercel:** run `npx vercel` in this folder.
- **GitHub Pages:** push the folder, then go to Settings → Pages.

After choosing a domain, add `<link rel="canonical">` to each page, make `og:image` an absolute URL, and add `"url"` to the JSON-LD. Each page has a TODO comment for this.

## Content rules this site follows

- No invented facts. Phone, hours, prices, payment methods and the current menu are left as "to be confirmed".
- Flavours are labelled as publicly featured examples, with their source.
- Alcohol-infused pops are labelled "Contains alcohol". Bailey's Delight is labelled "Ask about alcohol" until confirmed.
- No testimonials, review widgets, awards, Montego Bay location, ordering, delivery, catering, events or checkout.
- Bug Art is credited in the story as a factual mention. Their artwork is not reproduced as a design element, though it appears in the background of the shop photos.
- Nothing is scraped or hotlinked from newspapers, Tripadvisor, Google Maps or blogs. Press is linked out only.
