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

## Photos and video

- Originals live in `photos/` (as supplied); web-sized copies (max 1600px) in
  `assets/photos/` are what the page uses.
- Hero slides, About, Our Events, Gallery, Extra Photos and Merch each use
  photos from `assets/photos/`; swap a file name in `index.html` to change one.
- `assets/video/yard-view.mp4` is the Yard View slideshow (38s, 1080p) built
  from the property/yard photos with ffmpeg, plus `yard-view-poster.jpg`.

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
- [ ] Replace the "Book Now" modal (in `index.html`, marked with a `TODO`
      comment, and in `js/main.js`) with the real booking embed link/iframe
      once it's ready — each button already carries a `data-book="<Event
      Type>"` attribute so you can route different event types to different
      booking pages if needed.
- [ ] Confirm the phone number (currently 876-585-85172, as supplied; a
      Jamaican number normally has 10 digits). Address: Old Hope, Little
      London, Westmoreland, Jamaica.
- [ ] Set real prices for the merch items (currently "Price on request").
- [ ] Update the "Upcoming Event" section with the next real scheduled event.
- [ ] Review nav links, section copy, and event list for accuracy.
