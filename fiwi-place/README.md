# Fiwi Place — Website Template

Static template for Fiwi Place Restaurant's events venue site (baby showers,
birthdays, wedding brunch, private dinners, and other events). Not live yet —
this is the working template.

## Structure

- `index.html` — all page content/sections
- `css/style.css` — styles (colors, fonts, layout, background effects)
- `js/main.js` — hero carousel (with swipe), mobile menu, sticky header, Book Now modal

## Logo

The logo is the official FiWi Place artwork (`photos/fiwi-place-logo-original.jpg`),
cut out of its white background:

- `assets/logo-light.png`: cream lettering with the original flame, used on
  the dark header and footer and in the Yard View video.
- `assets/logo-color.png`: original colors (grey "FiWi", olive "Place"), for
  light backgrounds.

The browser-tab icon is the flame from the same artwork.

## Backgrounds

- Hero: animated aurora glows (`.blob`, colors per slide in `.theme-*`),
  venue arches (`.arch`), and a film-grain overlay.
- Page background: `assets/background-coconut.jpg` (coconuts and pineapple on the lawn),
  shown by the fixed `.scenery` layer behind the see-through light sections.
- Headings and text over the scenery sit on frosted panels (`.section-head`,
  `.about-copy`); dark bands are `.section-dark` in `css/style.css`.
- All motion is switched off for visitors who set "reduce motion" on their
  device.

## Opening bonfire

- `js/intro.js` plays a 4-second opening when the site is opened: logs come
  together, the fire catches and builds, the FiWi logo glows in, then it
  fades away to the site. It is drawn live (no video download). A tap or
  key press skips it, and it is skipped for visitors whose device is set to
  reduce motion. Change `DURATION` in `js/intro.js` to make it longer or
  shorter. The hero slideshow starts once it ends.

## Photos and video

- Originals live in `photos/` (as supplied); web-sized copies (max 1600px) in
  `assets/photos/` are what the page uses.
- Hero slides, About, Our Events, Gallery, Extra Photos and Merch each use
  photos from `assets/photos/`; swap a file name in `index.html` to change one.
- `assets/video/yard-view.mp4` is the Yard View slideshow (38s, 1080p) built
  from the property/yard photos with ffmpeg, plus `yard-view-poster.jpg`.

## Booking and quotes

- **Book Now** buttons open a full-page booking form (event type, date, guests,
  location at FiWi Place with capacities, chairs/tables/table cloths choice,
  contact details). It adapts to the event:
  - Wedding: "Wedding ceremony & reception" or "Reception only".
  - Catering: on-site or off-site (off-site asks for the event address and
    hides the venue areas).
  - Chairs/tables choice (with the 12 pm next-day pickup disclaimer) is shown
    for every event except Catering, Private Dinner and Sip & Paint.
  - Warns when the guest count is over the chosen area's capacity.
  The booking form also links to the Jotform menu selection form.
- **Request Quote** buttons open the quote form (same event/location/rental
  options plus the Jotform menu, add-ons, service style, dietary needs,
  customized quote and consultation notes).
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
- [ ] Set real prices for the merch items (currently "Price on request").
- [ ] Replace the sample Sip & Paint listing (Kidz Fest: April 2027, confirmed).
- [ ] Review nav links, section copy, and event list for accuracy.
