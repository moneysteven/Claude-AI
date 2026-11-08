# Rick's Cafe, Negril, Jamaica: concept website

**Status: owner-approval CONCEPT.** This is a redesign proposal by Steven Scale Solutions for the owner of Rick's Cafe to
review. It is **not** the official website (that is https://www.rickscafejamaica.com/) and must not be presented as
the live official site, or hosted publicly, until the owner approves it and clears the media rights (see below).
Every page carries a "Concept" strip and a footer note, and a `noindex` tag keeps it out of search engines.

Plain HTML, CSS and JavaScript. No framework and no build step needed to run it: open `index.html`, or serve the folder
from any static host.

## What's where

```
index.html            Home: opening intro, cinematic hero, welcome, highlights, showcase, sunset promo, tabs, gallery, visit
menu.html             Food & Drinks: the official 2026 menu (Revision 26.03), search + section chips, PDF download
experience.html       Sunsets, music, pool & cabanas, the cliffs (attributed FAQ figures + safety notes), good to know
story.html            1973-2026 timeline, founder quote, the team, press & community links
groups.html           Weddings, retreats, reunions, cabanas (published FAQ rates), dinner rules, draft inquiry form
gallery.html          13 archive photos with filters + lightbox, and the official film (YouTube, click to play)
visit.html            Address, both published phone numbers, email, official map embed, hours, socials, full FAQ
css/styles.css        The whole design system (colours, type, every component)
js/main.js            All behaviour. The EDIT ME block at the top holds hours, phones, email and directions
js/menu-data.js       The menu (only loaded on menu.html)
assets/img, assets/video, assets/docs   Optimised photos, intro/hero videos, the official menu PDF
content/business.json Every fact used, with its source, plus the list of things still needed from the owner
content/media.json    What each photo/video is, where it's used, and its rights caveats
tools/                build_pages.py, optimize_images.py, make_intro.py, make_hero.py, qa.js, qa_interactions.js
tools/pages/          The page bodies (source for build_pages.py)
_source/              Original files as received (not linked from the site; never upload these)
```

## Editing

- **Page text:** edit `tools/pages/<page>.html`, then run `python3 tools/build_pages.py` from this folder. The nav,
  footer, action pop-up, icons, SEO tags and structured data live in `tools/build_pages.py`. (You can also edit the
  finished `.html` files directly for a quick fix, but the next build overwrites them.)
- **Hours, phones, email:** the `SITE` block at the top of `js/main.js` (it drives the hours tables, the "Open now"
  badge and the Plan-your-visit pop-up), plus the matching text in `tools/build_pages.py` (footer) and
  `content/business.json`. Hours use Jamaica time (`America/Jamaica`, UTC-5, no daylight saving).
- **Menu:** `js/menu-data.js`. One line per item: name, price exactly as printed (USD), description, and tags
  (`chef`, `spicy`, `season`, `super`, `special`) that mirror the printed icons. When a new menu PDF arrives, replace
  `assets/docs/ricks-cafe-menu-rev-26-03.pdf` and update the revision in `tools/pages/menu.html`.
  Spellings fixed from the print: Vinaigrette (printed "Vinagrette"), Stella Artois ("Atrois"), Hennessy ("Hennessey"),
  Moët & Chandon, Dom Pérignon, Refills ("Refils").
- **Colours and fonts:** the `:root` block at the top of `css/styles.css` (`--ink`, `--gold`, `--ember`, `--pink`,
  `--sea`, `--sun` gradient...). Fonts are Anton (headlines), DM Sans (text) and Instrument Serif (quotes), from
  Google Fonts. These are concept choices: no official brand guide was found. The logo's sampled colours are in
  `content/business.json`.
- **Photos:** put the original in `_source/`, then
  `python3 tools/optimize_images.py _source/new-photo.jpg assets/img` and use it in a page with
  `<x-pic name="new-photo" alt="describe the photo" sizes="100vw">` (or `<x-tile ...>` in a gallery), then rebuild.
  The placeholders marked "Photo to come" (dishes, bar, cabanas, team) are waiting for owner photos.

## The hero and the opening intro

Both are cut from the official film "Rick's Cafe turns 47!" (`_source/ricks-turns-47.mp4`), with the audio removed:

- **Intro** (`tools/make_intro.py`): six beats (drone views, the cove, a historical pole dive, the sunset crowd,
  the sunset aerial) joined by short dissolves, about 4.3 s, then the logo, then the page wipes in. Change the beats
  in `SHOTS` and run `python3 tools/make_intro.py`. It plays once per visit, never with reduced motion or data saver,
  and Skip / Esc end it at once. **To turn it off:** delete the `<div class="opener">` block and the two small
  scripts next to it from the generated `index.html` (or remove `"opener": true` from `tools/pages/index.html` and rebuild).
- **Hero loop** (`tools/make_hero.py`): the daytime drone shot, the sunset crowd in silhouette, then the sunset
  aerial, about 8.5 s, with a 9:16 cut for phones. It has a visible pause button and shows only the poster with reduced
  motion or data saver. To use a different clip, change `SEGMENTS` (or point `SRC` at a new file) and run the script.

## Quality checks

```
node tools/qa.js . qa                 # every page at 375 / 768 / 1440 px: errors, broken files/images/links, alt text, overflow, tap targets
node tools/qa_interactions.js . qa    # intro timing & fallbacks, drawer, pop-up, tabs, lightbox, menu search, form, links
```

## Before this goes live (owner approval checklist)

1. Owner approves the concept and **gives written permission for every photo, the logo and the film footage**
   (including music, sponsor and guest-release rights). Official-site hosting is not a licence; credit alone is not permission.
2. Owner confirms the items listed under `missing` in `content/business.json` (main phone number, current hours,
   cabana rates and terms, the exactly-10 dinner rule, the starters line, Cliffside Grill menu, and so on).
3. Remove the concept strip (`.concept` in `tools/build_pages.py`), the footer concept note and the
   `<meta name="robots" content="noindex, nofollow">` line; confirm the canonical/OG domain (`BASE` in `build_pages.py`).
4. Add `telephone` and `openingHoursSpecification` to the JSON-LD in `build_pages.py` only once the owner confirms them.
5. Connect the group inquiry form to a real destination chosen by the owner (it is a non-sending draft now), and never
   add card fields. No online ordering, booking, tickets, tours, delivery, rooms, shop or donations exist on this site.
6. Swap the footer text credit for the "DONE BY Stevenscalesolutions.com" image when `done-by-sss.jpg` is supplied:
   `python3 tools/optimize_images.py _source/done-by-sss.jpg assets/img`, then replace the `.credit` link in `build_pages.py`.

Once approved, the folder is a static site: the owner's web host can serve it as it is (it needs no server code).

## Notes on the public GitHub repository

This repository is public, so the rights-restricted media (photos, logo, film cuts, menu PDF and `_source/`) are kept
**out of git** (see `.gitignore` here). The complete site, media included, is in the private delivery zip
(`ricks-cafe-negril-website.zip`). To work on it from a fresh clone, unzip that delivery over this folder. The zip leaves
out `_source/` (the originals), so to re-cut the intro/hero or re-export photos, re-attach the original media pack and the
film and copy them into `_source/` with the names listed in `content/media.json`.
