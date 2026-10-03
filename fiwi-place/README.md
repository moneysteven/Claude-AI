# Fiwi Place — Website Template

Static template for Fiwi Place Restaurant's events venue site (baby showers,
birthdays, wedding brunch, private dinners, and other events). Not live yet —
this is the working template.

## Structure

- `index.html` — all page content/sections
- `css/style.css` — styles (colors, fonts, layout, background effects)
- `js/main.js` — hero name animation, mobile menu, sticky header, booking/quote/review forms

## Logo

The logo is the official FiWi Place artwork (`photos/fiwi-place-logo-original.jpg`),
cut out of its white background:

- `assets/logo-light.png`: cream lettering with the original flame, used on
  the dark header and footer and in the Yard View video.
- `assets/logo-color.png`: original colors (grey "FiWi", olive "Place"), for
  light backgrounds.

The browser-tab icon is the flame from the same artwork.

## Backgrounds

- Hero (`.hero--name`, styled in the "HERO: NAME + DRIFTING PHOTO COLLAGE"
  part of `css/style.css`): after the bonfire, the aerial venue photo fills
  the hero while a giant vertical FIWI / PLACE (Bodoni Moda) writes in letter
  by letter. About 3s later the photo fades to dark green, the name dims, and
  small FiWi photos (`assets/photos/*-480.webp`, the `.hn-tile` figures in
  `index.html`) drift slowly up across it, with the welcome line at the
  bottom. Add or swap a photo by editing a `.hn-tile` (`--l` left position,
  `--s` size, `--d` drift time, `--o` start offset). Visitors set to reduce
  motion see the finished collage, standing still.
- Page background: `assets/background-coconut.jpg` (coconuts and pineapple on the lawn),
  shown by the fixed `.scenery` layer behind the see-through light sections.
- Headings and text over the scenery sit on frosted panels (`.section-head`,
  `.about-copy`); dark bands are `.section-dark` in `css/style.css`.
- All motion is switched off for visitors who set "reduce motion" on their
  device.

## Opening bonfire

- `js/intro.js` plays a short opening when the site is opened: logs come
  together and catch (drawn live), the fire flares up into the bonfire photo
  (`assets/photos/bonfire-night.jpg`) with the FiWi logo and "Bonfire Coming
  Up", then it fades away to the site after 7 seconds.
- A tap or key press skips it, and it is skipped for visitors whose device
  is set to reduce motion. `DURATION` in `js/intro.js` sets the length; the
  wording is in the `.intro-text` block in `index.html`. The hero name
  animation starts once it ends.

## Photos and video

- Originals live in `photos/` (as supplied); web-sized copies (max 1600px) in
  `assets/photos/` are what the page uses.
- **Fast loading on mobile data:** each photo also has WebP copies at several
  widths (`name-640.webp`, `-960`, `-1280`, `-1600`, or the photo's own width
  when smaller). Every `<img>` lists them in `srcset`/`sizes`, so phones
  download only the size they need; the `.jpg` stays as the fallback. When
  adding a photo, make its WebP copies too and copy the `srcset` pattern of a
  neighbouring image. Images below the first screen use `loading="lazy"`; the
  hero's floating photos use small 480px WebP copies.
- Logos in `assets/` are 320px wide (full-size cut-outs are in `photos/`).
- The hero, About, Our Events and Gallery each use photos from
  `assets/photos/`; swap a file name in `index.html` to change one.
- Gallery is one collage (`.collage`, masonry-style columns of small photos)
  holding the former Gallery, Extra Photos and Merch photos; the merch caps
  and cup are shown as plain photos, with no Order Now.
- `assets/video/yard-view.mp4` is the Yard View slideshow (38s, 1080p) built
  from the property/yard photos with ffmpeg, plus `yard-view-poster.jpg`.

## Booking and quotes

- **Book Now** buttons open a full-page booking form (event type, date, guests,
  location at FiWi Place with capacities, chairs/tables/table cloths choice,
  contact details). It adapts to the event:
  - Wedding: "Wedding ceremony & reception" or "Reception only".
  - Catering: on-site or off-site (off-site asks for the event address and
    hides the venue areas).
  - Private Dinner: pick the dinner setting (bridge, tree house, Chuppa,
    open lawn); the "Location at FiWi Place" list is hidden.
    Choosing "On the bridge" fixes the guest count at 2.
- The quick booking box (Type of Event, Private Dinner Options, shuttle,
  Book Now / Request Quote) sits over the bottom of the hero.
  - Chairs/tables choice (with the 12 pm next-day pickup disclaimer) is shown
    for every event except Catering, Private Dinner and Sip & Paint.
  - The guest count can't go over the chosen area's or dinner setting's
    maximum (bridge 2, tree house 4, Chuppa 8, each area's upper capacity);
    a note under the field says the limit. The entire venue and the open
    lawn have no maximum.
  The booking form now has the same menu sections as the quote form (Menu
  Selection, including Desserts: Coconut Rum Bread Pudding and Berry Compote
  Cheesecake, Premium Add-On Services, Service Details, Culinary Menu
  Consultation, and the Private Dinner set menus), and still links to the
  Jotform menu selection form. Keep the two copies in step when the menu
  changes.
- The Location at FiWi Place list runs from the smallest area to the
  largest, with the entire venue last.
- Add-on prices are shown in US dollars, converted from JMD at 150 JMD = 1 USD
  and rounded to the nearest dollar, with "+" as they are starting prices.
- **Request Quote** buttons open the quote form (same event/location/rental
  options plus the Jotform menu, add-ons, service style, dietary needs,
  customized quote and consultation notes).
  - Private Dinner quotes skip the general menu, add-ons, service details and
    consultation. Instead they show what every private dinner includes, a
    choice of Menu 1 (The Coastal Table, seafood), Menu 2 (The Golden Table,
    chicken) or Menu 3 (The Indulgent Table, meat), one starter, one main
    and one dessert (Coconut Rum Bread Pudding or Berry Compote Cheesecake),
    allergies, and the Premium Enhancements (photography, drink pairings, celebration decor, florals). Dishes live in
    the `.pd-fieldset` block of `index.html`.
- Both forms email the request to fiwiplacejaofficial@gmail.com through
  FormSubmit (`FORM_ENDPOINT` in `js/main.js`); if sending fails the visitor
  sees their request as copyable text with the phone number.

## FiWi Experience / Testimonial

- The section above the footer (`#testimonials`) invites guests to share a
  review. **Write a Review** opens the review form (star rating, event,
  month, title, review, name, optional email, "post my review" box). It
  emails fiwiplacejaofficial@gmail.com through the same `FORM_ENDPOINT`; the
  subject says "OK to post" or "private, do not post".
- **Approved reviews stay on the site** in `js/reviews.js`. Each one is a
  short block (name, rating, event, month, title, text) and shows as a card
  on the FiWi Experience wall, with the average rating above it. The wall is
  hidden until the first review is added. Post only reviews marked "OK to
  post", with the guest's first name only.
- **Review Us on Google** links to the Google Maps listing.

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
cd fiwi-place
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Before going live

- [ ] Confirm which photos belong in each section (placed by what they show,
      since original titles weren't available).
- [ ] Check the Request Quote menu against the Jotform (built from
      screenshots; items falling between screenshots may be missing).
- [ ] **Go-live: all forms must email fiwiplacejaofficial@gmail.com.** Any
      new form uses the shared `FORM_ENDPOINT` in `js/main.js`. After going
      live, send one test booking/quote; FormSubmit then emails a one-time
      activation link to that inbox, and forms only deliver after it is
      clicked.
- Contact: +1 (876) 858-5172 (footer, merch modal, form fallbacks and the
  Yard View video's closing card). Address: Old Hope, Little London,
  Westmoreland, Jamaica.
- [ ] Upcoming Events: Bonfire (end of year 2026, "Next Up") and Kidz Fest
      (April 2027). Add exact dates when set.
- [ ] Review nav links, section copy, and event list for accuracy.
