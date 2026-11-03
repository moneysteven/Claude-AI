# Claude Code prompt: Home Solutions (Windows & Doors) website

You are building a brand-new marketing website for **Home Solutions & Hardware Ltd** (trading as "Home Solutions"). They make, sell and install aluminium and uPVC windows and doors, steel and wrought-iron doors, frameless glass showers and railings, and shades and blinds. They have 9 branches across western and central Jamaica, and their head office is in Negril. The old site (homesolutionsjm.com) is currently down.

The site should feel **architectural, clean, glass, light and aluminium**: bright and airy, with lots of white space, like standing in a sunlit room behind a new sliding door. It must be extremely modern, very easy to use, and every animation must be buttery smooth.

**Stack:** Vite + vanilla JS (ES modules) + modern CSS (custom properties, container queries). Use **Lenis** for smooth scroll and **GSAP + ScrollTrigger** for motion. No framework is needed. Static build, deployable anywhere.

**Assets:** the folder `/assets` is already in the project root:
- `/assets/own/`: the business's own images (logo, products, projects). Read `/assets/own/SOURCES.md`.
- `/assets/stock/`: Pexels photos and videos. Read `/assets/stock/credits.md`. All are under the Pexels License: free for commercial use, no attribution required. Still add a small "Stock imagery: Pexels" line in the footer.

**Hard rules:**
- NEVER invent facts, prices, reviews, certifications, years or phone numbers. Use only what is in `BUSINESS` below.
- If a value is `"TBC"`, show "Price on request" or "Coming soon", never a number.
- No lorem ipsum. No placeholder testimonials.

---

## 0. Hero video: prepare it first (ffmpeg)

The source is `/assets/stock/video-villa-room-light-timelapse.mp4`: 1830×1030, 37 s. Clouds roll past a villa room seen through tall sliding glass doors, and the light changes. Trim it to the best 14 s, lift it slightly so it stays bright and airy, and export three files:

```bash
mkdir -p public/video
SRC=assets/stock/video-villa-room-light-timelapse.mp4
VF="trim=start=4:duration=14,setpts=PTS-STARTPTS,eq=brightness=0.04:contrast=1.05:saturation=1.08:gamma=1.05,unsharp=5:5:0.6:5:5:0.0,fade=t=in:st=0:d=0.6,fade=t=out:st=13.2:d=0.8"
# 1080p H.264
ffmpeg -y -i $SRC -an -vf "$VF,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libx264 -preset slow -crf 22 -profile:v high -pix_fmt yuv420p -movflags +faststart public/video/hero-1080.mp4
# 720p H.264 (mobile)
ffmpeg -y -i $SRC -an -vf "$VF,scale=1280:720:flags=lanczos:force_original_aspect_ratio=increase,crop=1280:720" \
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart public/video/hero-720.mp4
# WebM VP9
ffmpeg -y -i $SRC -an -vf "$VF,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -deadline good public/video/hero-1080.webm
# Poster (first frame) → WebP
ffmpeg -y -i public/video/hero-1080.mp4 -frames:v 1 -q:v 2 /tmp/poster.png && cwebp -q 88 /tmp/poster.png -o public/video/hero-poster.webp
```

Targets: hero-1080.mp4 under 6 MB and hero-720.mp4 under 3 MB. If a file is over budget, raise the CRF by 2. If the trim window looks dull, pick another 14 s window and keep the loop seamless.

Secondary clips get the same pipeline, but only 720p mp4 plus webm, 8 s each, lazy-loaded when in view:
- `video-hero-ocean-window-palms.mp4` → "Windows & Doors" category band
- `video-luxury-bathroom.mp4` → "Showers & Glass" band
- `video-modern-luxury-villa-exterior.mp4` → Hurricane/Security section background (with a heavy white wash)
- `video-hotel-room-balcony-view.mp4` → Final CTA band

Hero markup:

```html
<video autoplay muted loop playsinline preload="metadata" poster="/video/hero-poster.webp">
  <source src="/video/hero-1080.webm" type="video/webm" media="(min-width: 768px)">
  <source src="/video/hero-1080.mp4" type="video/mp4" media="(min-width: 768px)">
  <source src="/video/hero-720.mp4" type="video/mp4">
</video>
```

Use a **light gradient overlay only**: `linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.15) 45%, rgba(242,244,248,.9) 100%)` plus a very subtle sky-blue tint at the bottom. No dark overlay; the site is bright. Text sits on a frosted glass panel so it stays readable. On `prefers-reduced-motion` and `Save-Data`, show the poster only.

---

## 1. Design system (exact)

```css
:root{
  /* brand: taken from the real Home Solutions site/logo */
  --navy:#182333;        /* logo wordmark, headings, footer */
  --sky:#26A8E0;         /* logo house icon, primary accent, CTAs */
  --sky-600:#1C8FC2;     /* hover/pressed */
  --sky-50:#E8F6FC;      /* tints, chips */
  --light:#F2F4F8;       /* section backgrounds */
  --grey:#8D9297;        /* secondary text, borders */
  /* aluminium system */
  --alu-100:#F5F6F8; --alu-300:#DCE0E5; --alu-500:#C9CED6; --alu-700:#9AA1AB;
  --alu-gradient:linear-gradient(135deg,#F7F8FA 0%,#D9DEE4 38%,#FFFFFF 52%,#C9CED6 70%,#EEF0F3 100%);
  --white:#FFFFFF; --ink:#182333; --text:#3A4555;
  /* glass */
  --glass-bg:rgba(255,255,255,.55); --glass-border:rgba(255,255,255,.75);
  --glass-blur:saturate(160%) blur(18px);
  --shadow-soft:0 10px 40px -12px rgba(24,35,51,.18);
  --radius:20px; --radius-lg:28px; --pill:999px;
  --ease-out:cubic-bezier(.22,1,.36,1); --ease-inout:cubic-bezier(.65,0,.35,1);
}
```

**Fonts** (self-host via Fontsource, `font-display: swap`, preload the two main weights):
- Headings: **Manrope** 600/700/800, tight tracking (-0.02em). Sizes: H1 `clamp(2.6rem, 6vw, 5.2rem)`, H2 `clamp(2rem, 4vw, 3.4rem)`.
- Body: **DM Sans** 400/500. The old site used DM Sans, which keeps brand continuity. Body text is **17px** with line-height 1.65, and `--text` colour.
- **Labels/eyebrows:** DM Sans 600, 12–13px, UPPERCASE, `letter-spacing: .18em`, colour `--sky`, preceded by a 24px aluminium hairline.

**Buttons, all pills:**
- Primary: `--sky` background, white text, `--pill` radius, 14px×26px padding, a subtle inner highlight, and an arrow that slides 4px on hover.
- Secondary: glass. Use `--glass-bg` with backdrop-filter, a 1px `--glass-border`, and `--navy` text.
- Tertiary: a text link with an animated underline.

**Aluminium details:** 1px hairline dividers in `--alu-300`. Card edges get a thin `--alu-gradient` border (border-image or a pseudo-element). The section numbers ("01", "02"…) are set in outlined Manrope with an aluminium gradient fill.

**Glass:** cards, header, modals and the mobile bar use `backdrop-filter: var(--glass-blur)`. Provide an `@supports not (backdrop-filter)` fallback of rgba(255,255,255,.92).

Spacing scale is 4/8/12/16/24/32/48/64/96/128. Sections get 96–128px vertical padding on desktop and 64px on mobile. Max content width is 1240px.

---

## 2. Fixed header

- Transparent over the hero. After 40px of scroll it becomes a frosted glass bar (white 70%, blur, hairline bottom border) and shrinks from 84px to 64px.
- Left: `/assets/own/logo-navy.png`, rendered at about 34px tall. It is low-res (500×68), so either recreate it as an inline SVG matching it exactly (blue house icon replacing the "O", navy "Home", sky-blue "Solutions") or use the PNG at native size or smaller.
- Centre: Products · Finishes · Quote · Projects · Branches · FAQ.
- Right: a "Call" icon button and a pill CTA, **"Book a free site visit"**.
- Mobile: a hamburger opens a full-height glass sheet with large tap targets.

---

## 3. Business config: single source of truth (`src/config.js`)

Every section reads from this object. Do not hard-code business facts anywhere else.

```js
export const BUSINESS = {
  name: "Home Solutions",
  legalName: "Home Solutions & Hardware Ltd",          // per FindYello listing
  tagline: "We Build for Your Comfort",                 // from original homepage
  strapline: "Windows · Doors · Glass · Commercial, Domestic, Industrial",
  founded: 2004,                                         // about page: "Founded in 2004"
  // Old site said "15+ Years of Professional Experience". 2004→2026 = 22 yrs. Show "Since 2004" (safe) rather than a count.
  mission: "Building and installing outstanding windows & doors customers can enjoy for a lifetime",
  vision: "Experiencing life & business through a safe & secure fenestration",
  email: "info@homesolutionsjm.com",
  whatsapp: "TBC",     // TODO: business to confirm WhatsApp number (E.164, e.g. 1876XXXXXXX). Until then the WhatsApp buttons use headOffice cell 18768552590 ONLY if confirmed; otherwise hide them.
  social: {
    instagram: "https://www.instagram.com/homesolutionsjm/",
    facebook: "https://www.facebook.com/125948344128643",
    findyello: "https://www.findyello.com/jamaica/negril-home-solutions-and-hardware-ltd/profile/nonpariel-rd/"
  },
  // HOURS CONFLICT. Sources disagree:
  //  - Contact page + FindYello: Mon–Fri 9:00–17:00, Sat 9:00–15:30, Sun closed  ← used below
  //  - Old site footer + About page: "Mon - Sat 09am - 05pm, Sunday Closed"
  //  - Google (via Wanderlog): Sat 10:00–15:00; a 2024 Google review says Saturday opening is 10am per the door sign
  //  → Business must confirm (per branch if different) before launch.
  hours: {
    tz: "America/Jamaica",
    mon:["09:00","17:00"], tue:["09:00","17:00"], wed:["09:00","17:00"],
    thu:["09:00","17:00"], fri:["09:00","17:00"], sat:["09:00","15:30"], sun:null
  },
  // Contact page lists 9 branches. "9 Locations" per About page; FindYello says 10. Confirm.
  branches: [
    { id:"negril", name:"Negril (Head Office)", address:"Nonpariel Road, Negril, Westmoreland",
      phones:["+18769579360","+18768552590","+18763973383"], fax:"876-957-4759", // FindYello lists fax 957-4159. Confirm
      lat:18.279014, lng:-78.335975 },
    { id:"savlamar", name:"Savanna-la-Mar", address:"Barracks Road, Savanna-la-Mar, Westmoreland", phones:["+18769559105"], fax:"876-918-2358" },
    { id:"mobay", name:"Montego Bay", address:"Fairview Shopping Centre, Bogue, Montego Bay, St. James", phones:["+18769798555"], fax:"876-979-8366" },
    { id:"lucea", name:"Lucea", address:"Millers Drive, Lucea, Hanover", phones:["+18769563107"] },
    { id:"greenisland", name:"Green Island", address:"Main Street, Green Island, Hanover", phones:["+18769569089"] },
    { id:"falmouth", name:"Falmouth", address:"81 Market Street, Falmouth, Trelawny", phones:["+18766173008"] },
    { id:"ochorios", name:"Ocho Rios", address:"White River, Ocho Rios, St. Ann", phones:["+18768831973"] },
    { id:"mandeville", name:"Mandeville", address:"31 Ward Avenue, Mandeville, Manchester", phones:["+18769629081"] },
    { id:"santacruz", name:"Santa Cruz", address:"House of Style Plaza, Santa Cruz, St. Elizabeth", phones:["+18769663245"] }
  ],
  // Only the Negril lat/lng is known. For the others, geocode the address with OpenStreetMap Nominatim at BUILD time (scripts/geocode.mjs → src/branches.geo.json),
  // then visually verify each pin. If a pin is uncertain, show it at town level and add `approx:true`.
  finishes: {
    residential: ["White","Black","Bronze","Wood"],          // windows, patio & entrance doors
    commercial:  ["White","Black","Bronze","Anodised"],      // commercial doors, curtain walls
    swatches: { White:"#F4F5F2", Black:"#1E2124", Bronze:"#5A4636", Wood:"#8A5A3B", Anodised:"#B9BEC4" }
  },
  products: [
    // WINDOWS: Aluminium (frame 2¼")
    { id:"alu-picture", cat:"windows", material:"Aluminium", name:"Picture Window", price:"TBC" },
    { id:"alu-slider", cat:"windows", material:"Aluminium", name:"Horizontal Slider", price:"TBC" },
    { id:"alu-lseries", cat:"windows", material:"Aluminium", name:"L-Series Horizontal Slider", spec:"3\" frame, 2 moving panels", price:"TBC" },
    { id:"alu-vent", cat:"windows", material:"Aluminium", name:"Projecting Vent / Awning", price:"TBC", img:"/assets/own/product-alu-projecting-vent.jpg" },
    { id:"alu-singlehung", cat:"windows", material:"Aluminium", name:"Push Up / Single Hung", price:"TBC" },
    // WINDOWS: uPVC (frame 3⅛"; coastal-weather resistant, termite resistant, energy efficient, sound insulating)
    { id:"upvc-slider75", cat:"windows", material:"uPVC", name:"75 Series Sliding Window", price:"TBC" },
    { id:"upvc-awning", cat:"windows", material:"uPVC", name:"Awning / Projecting Vent", price:"TBC" },
    { id:"upvc-picture", cat:"windows", material:"uPVC", name:"Fixed / Picture Window", price:"TBC" },
    { id:"upvc-casement", cat:"windows", material:"uPVC", name:"Friction Casement", price:"TBC" },
    { id:"upvc-louver", cat:"windows", material:"uPVC", name:"Louver / Jalousie", price:"TBC" },
    { id:"upvc-singlehung", cat:"windows", material:"uPVC", name:"Single Hung", price:"TBC" },
    // DOORS
    { id:"alu-tube", cat:"doors", material:"Aluminium", name:"Tube Swing Door", spec:"2¾\" narrow stile; clear or bronze anodised, white", price:"TBC" },
    { id:"upvc-heavy", cat:"doors", material:"uPVC", name:"Exterior Heavy Series Swing Door", spec:"Multi-point lock + deadbolt, 2.625\" frame", price:"TBC" },
    { id:"upvc-light", cat:"doors", material:"uPVC", name:"Interior Light Series Swing Door", price:"TBC" },
    { id:"upvc-slide80", cat:"doors", material:"uPVC", name:"80 Series Sliding Patio Door", price:"TBC" },
    { id:"upvc-screen", cat:"doors", material:"uPVC", name:"Screen Door", price:"TBC" },
    { id:"upvc-closet", cat:"doors", material:"uPVC", name:"Sliding Closet Door", price:"TBC", img:"/assets/own/product-upvc-sliding-closet-door.jpg" },
    // Real prices below: homesolutionsjm.com/store (archived Feb 2025 via web.archive.org). Currency shown as "$", assumed JMD. BUSINESS MUST CONFIRM CURRENT PRICES.
    { id:"steel-6p-32w", cat:"doors", material:"Steel", name:"6-Panel Steel Door 32″×80″ (White)", spec:"Galvanised steel, polyurethane core, 1¾\" thick", priceJMD:25650, img:"/assets/own/product-steel-6-panel-white.jpg" },
    { id:"steel-6p-32b", cat:"doors", material:"Steel", name:"6-Panel Steel Door 32″×80″ (Bronze)", priceJMD:25650, img:"/assets/own/product-steel-6-panel-bronze.jpg" },
    { id:"steel-6p-36w", cat:"doors", material:"Steel", name:"6-Panel Steel Door 36″×80″ (White)", priceJMD:25650, img:"/assets/own/product-steel-6-panel-white.jpg" },
    { id:"steel-6p-36b", cat:"doors", material:"Steel", name:"6-Panel Steel Door 36″×80″ (Bronze)", priceJMD:25650, img:"/assets/own/product-steel-6-panel-bronze.jpg" },
    { id:"steel-fanlight", cat:"doors", material:"Steel", name:"Fanlight / Cathedral Door 36″×80″", priceJMD:33850 },
    { id:"steel-sidelite", cat:"doors", material:"Steel", name:"Half Door Side Lite 12″×80″", priceJMD:32969, img:"/assets/own/product-half-door-side-lite.jpg" },
    { id:"steel-oval", cat:"doors", material:"Steel", name:"Oval Lite Door 36″×80″", priceJMD:55200 },
    { id:"wi-french", cat:"doors", material:"Wrought iron + mahogany", name:"Wrought Iron French Door 36″×96″", spec:"Oversized mahogany, 5\" frames", priceJMD:170000, img:"/assets/own/product-wrought-iron-french.jpg" },
    { id:"wi-texas", cat:"doors", material:"Wrought iron + mahogany", name:"Wrought Iron Texas Door 36″×96″", priceJMD:170000, img:"/assets/own/product-wrought-iron-texas.jpg" },
    { id:"wi-tuscany", cat:"doors", material:"Wrought iron + mahogany", name:"Wrought Iron Tuscany Door 36″×96″", priceJMD:170000, img:"/assets/own/product-wrought-iron-tuscany.jpg" },
    // SHOWERS (frameless glass)
    { id:"shower-screen", cat:"showers", material:"Glass", name:"Frameless Shower Screen", spec:"36\"W × 72\"H, 10mm laminated glass, U-channel or clamps", price:"TBC" },
    { id:"shower-sliding", cat:"showers", material:"Glass", name:"Sliding Frameless Shower Door", spec:"60\", 10mm glass, stainless rollers", price:"TBC", img:"/assets/own/product-sliding-frameless-shower.jpg" },
    { id:"shower-swing", cat:"showers", material:"Glass", name:"Swing Frameless Shower Door", price:"TBC", img:"/assets/own/product-swing-frameless-shower.jpg" },
    { id:"upvc-shower", cat:"showers", material:"uPVC", name:"uPVC Shower Sliding Door", price:"TBC" },
    // RAILINGS
    { id:"railing", cat:"railings", material:"Glass + 316 stainless", name:"Frameless Glass Railing", spec:"316 marine-grade stainless posts, brushed; glass panel 4 ft suggested, 7 ft max", price:"TBC", img:"/assets/own/product-frameless-railing.jpg" },
    // BLINDS
    { id:"roller-shades", cat:"blinds", name:"Roller Shades", price:"TBC" },
    { id:"motor-shades", cat:"blinds", name:"Motorised Shades", price:"TBC" },   // featured in HS Instagram reel
    // COMMERCIAL
    { id:"storefront", cat:"commercial", material:"Aluminium", name:"Commercial Store Front Door", spec:"4\" threshold, ¼\" clear glass, max height 84\"; bronze, anodised, white", price:"TBC" },
    { id:"curtain-wall", cat:"commercial", material:"Aluminium + glass", name:"Curtain Wall Systems", price:"TBC" }
  ],
  priceSource: "Home Solutions online store, homesolutionsjm.com/store (archived Feb 2025). Prices subject to change; confirm in branch.",
  alsoStocks: ["Tiles","Bathroom fixtures","Kitchen supplies"],   // per old site + Google review
  reviews: {
    googleRating: 3.9, googleCount: 63,   // Google via Wanderlog/Exa, 2025. Re-check before launch; do NOT display the rating number unless confirmed current
    quotes: [
      { author:"Jermaine B.", stars:5, date:"2025-03-19", text:"I recently had the pleasure of working with Matthew and his colleagues… exceptional professionalism, dedication, and attention to detail… A massive thanks to you all for arranging and executing the job on my behalf in the short time frame giving." },
      { author:"Google reviewer", stars:5, date:"2019-12-18", text:"For all you stylish windows and doors for all buildings, you can find them right here. Prices are reasonable and you get great customer service. It has tiles, bathroom fixtures and kitchen supplies too." },
      { author:"Google reviewer", stars:5, date:"2018-02-26", text:"Quality products, great service, easily accessible location, comfortable working environment. I like." }
    ]   // Source: Google reviews as shown on wanderlog.com/place/details/10344660. Get business OK before publishing.
  },
  forms: { formspreeId: "TBC" }  // TODO: create Formspree form; until then fall back to mailto:info@homesolutionsjm.com + WhatsApp prefill
};
```

---

## 4. Sections (in this order, numbered on the page as 01–12)

**01 Hero: "Light Through the Door"**
- Full-screen hero video (section 0).
- On load, two frosted **aluminium-framed glass panels** cover the viewport like a sliding patio door. They glide apart, left panel left and right panel right, over 1.4 s with `--ease-inout`.
- As they part, a soft diagonal light-beam gradient sweeps across (an animated `mask-image` / translateX on a blurred white gradient).
- The headline then rises line by line: "We Build for Your Comfort."
- Sub: "Aluminium & uPVC windows, doors, frameless glass showers and railings, made for Jamaica's sun, salt air and storms. 9 branches across western & central Jamaica."
- CTAs: [Get a quote] (primary) and [Find your nearest branch] (glass).
- A glass chip row underneath: "Since 2004 · 9 Branches · Commercial · Domestic · Industrial".
- Scroll cue: a thin aluminium line with a travelling dot.
- Run the door-opening animation once per session (sessionStorage). If reduced motion is on, the panels start open.

**02 What we make: Catalogue**
- Filter pills: All · Windows · Doors · Showers · Railings · Blinds · Commercial. A pill shows a count badge. The active pill gets a sliding sky-blue background "thumb" that moves between pills (FLIP).
- Grid of glass product cards. Each card has:
  - an image (or, if none exists, an elegant **SVG line illustration** of that window or door type drawn in aluminium strokes; build a small icon set for slider, picture, awning, casement, louver, single-hung, swing, sliding and shower)
  - material tag, name, spec line
  - price: show "JMD $25,650" if `priceJMD` is set, otherwise "Price on request"
  - "Add to quote" (+) button
- Filtering uses GSAP Flip, so cards glide to their new positions.
- Show 8 cards first. "See all {BUSINESS.products.length} products" expands the grid: the container height animates, new cards stagger in, and the button morphs into "Show less".
- Under the grid, in small text: "Prices: {priceSource}".

**03 Finishes: swatch switcher**
- A large product hero: an SVG sliding door + window composite with separate `<path>` frame layers over a glass gradient and a stock interior photo behind the glass (`/assets/stock/photo-interior-living-sliding-doors-pool.jpg`).
- Swatch pills: White · Black · Bronze · Wood · Anodised.
- Clicking a swatch tweens the frame fill (GSAP on the CSS variable `--frame`) and moves a highlight ring. Wood uses an SVG pattern fill of subtle grain, and Anodised uses `--alu-gradient`.
- Note under it: "Residential: White, Black, Bronze, Wood. Commercial & curtain wall: White, Black, Bronze, Anodised."

**04 Build your window: quote estimator (multi-step glass card)**
- Step 1: product type (cards with icons from the catalogue).
- Step 2: material (Aluminium / uPVC), plus finish swatch.
- Step 3: size W × H in inches with a live, to-scale SVG preview that resizes smoothly, and quantity.
- Step 4: location (branch select) and contact details (name, phone, email optional, notes, optional photo upload).
- Summary:
  - If every line item has `priceJMD`, show a JMD subtotal, with the note "Supply price from {priceSource}. Installation, delivery and GCT quoted separately."
  - Otherwise, show **"Estimate: TBC. We'll send your exact price"**, with no numbers.
- Submit to Formspree, or via WhatsApp prefill:
  `https://wa.me/<whatsapp>?text=` + encodeURIComponent("Hi Home Solutions, quote request:\n• 2× uPVC Friction Casement, 36×48, White\n…\nName: …  Branch: Montego Bay")
- Items added to the quote from the catalogue (+) appear here. Persist the quote basket in localStorage, and show a floating basket count in the header.

**05 Why aluminium or uPVC: Hurricane · Security · Energy**
- Background: the villa exterior clip under a 90% white wash.
- Three glass stat cards. Use only facts we hold:
  - **Security**: multi-point lock + deadbolt on the uPVC Heavy Series door
  - **Coastal**: uPVC is coastal-weather and termite resistant, and railing posts are 316 marine-grade stainless
  - **Energy & quiet**: uPVC is energy efficient with sound insulation
- Hurricane: write "Ask us about storm-ready options." Do NOT claim impact ratings or wind-load certifications (none confirmed).
- Comparison table. Each row LEADS with the better choice, marked with a sky-blue check:

| Category | Best pick | Why |
|---|---|---|
| Salt air / coastal | uPVC | Coastal-weather resistant, won't corrode |
| Termites | uPVC | Termite resistant |
| Energy & noise | uPVC | Thicker 3⅛" frame, energy efficient, sound insulating |
| Slim sightlines / large glass | Aluminium | Slim 2¼" frames, maximum glass area |
| Commercial storefronts & curtain wall | Aluminium | Storefront & curtain wall systems |
| Finish options | Aluminium | White, Black, Bronze, Wood, Anodised |
| Budget | Ask us | Prices TBC per size |

  On mobile, the table becomes stacked cards.

**06 Before / After**
- Draggable slider: pointer, touch and keyboard (arrow keys), `role="slider"`, `aria-valuenow`.
- Initial pair: "before" `/assets/own/oldsite-house-two-storey.jpg` vs "after" `/assets/own/project-storefront-glazing.jpg`. ⚠️ These are NOT a true before/after. Mark it in code as `// PLACEHOLDER: replace with real before/after pair from business`, and render a visible "Sample" badge until it is replaced.
- The handle is an aluminium pill with a sky-blue grip.

**07 Projects gallery**
- Masonry grid with lightbox (keyboard, swipe, focus trap, captions).
- Use:
  - `project-west-isle-aerial.jpg` with caption "West Isle housing development"
  - `project-west-isle-gate.jpg`
  - `project-west-isle-house-render.jpg` with caption "West Isle, render"
  - `project-storefront-glazing.jpg` with caption "Commercial storefront glazing"
  - `project-kitchen-interior.jpg`
- Fill out the grid with clearly inspirational stock, each with a tiny "Inspiration" tag:
  - `photo-modern-house-exterior-glazing.jpg`
  - `photo-terrace-glass-doors-railing.jpg`
  - `photo-glass-shower-modern-bathroom.jpg`
  - `photo-frameless-corner-shower.jpg`
  - `photo-commercial-curtain-wall.jpg`
  - `photo-caribbean-hillside-villa.jpg`
- Add the Instagram CTA "See more on @homesolutionsjm".

**08 Showers & Glass (feature band)**
- Background: the bathroom clip, with `photo-glass-shower-bathtub.jpg` as the poster.
- Content: frameless shower specs (10mm laminated glass, stainless rollers) and the railing spec (316 marine-grade). Add a CTA to quote.

**09 Reviews**
- Glass cards from `BUSINESS.reviews.quotes`, with stars, author and formatted date (e.g. "Mar 2025"), in a horizontal drag carousel (Lenis-compatible) that snaps.
- A "Read reviews on Google" link. Do not show the 3.9 rating unless it is confirmed current.

**10 Branch finder**
- A Leaflet map with a light Carto Positron tile layer and custom sky-blue pin SVGs. Under it (or beside it on desktop), a list of branch cards with:
  - name and address
  - a **tap-to-call button per phone number** (`tel:`)
  - a Directions link (Google Maps search URL)
  - an **Open now / Closed · opens Mon 9:00 AM badge**, computed with `Intl.DateTimeFormat('en-US',{timeZone:'America/Jamaica',...})` from `BUSINESS.hours`
- "Use my location" sorts the branches by distance (Haversine). Clicking a card flies the map to its pin.
- Lazy-load Leaflet only when the section nears the viewport.

**11 FAQ**
- Accordion with smooth height animation. Answers must stick to known facts:
  - What materials do you work with? (aluminium, uPVC, steel, wrought iron + mahogany, frameless glass)
  - Do you install? Yes. Commercial, domestic and industrial installation is per the site.
  - Which finishes are available? (see finishes)
  - Is uPVC good near the sea? (coastal-weather and termite resistant)
  - How do I get a price? Use the estimator, WhatsApp, or call your branch.
  - What are your hours? (from config, showing the per-day table)
  - Do you sell tiles and fixtures? (tiles, bathroom fixtures, kitchen supplies)
  - Where are you? (9 branches, linking to the finder)
- Add FAQPage JSON-LD.

**12 Final CTA + Footer**
- CTA band over the balcony-view clip: "Let the light in." Buttons: [Book a free site visit] and [WhatsApp us].
- Footer (navy `#182333`, white text, aluminium hairlines) contains:
  - logo (white version via CSS filter or an SVG recreation)
  - mission line
  - quick links
  - all 9 branches with phone numbers
  - email `info@homesolutionsjm.com`
  - Instagram and Facebook icons
  - hours
  - "© {year} Home Solutions & Hardware Ltd"
  - "Stock imagery: Pexels"

**Site-visit booking (modal used by every "Book a free site visit" CTA)**
- Fields: name, phone, parish/branch, preferred date (a native date input; Sundays disabled), morning/afternoon, what you need (multi-select chips), and notes.
- Submit to Formspree. Fallback: a WhatsApp prefill with all the fields.
- Success state: an animated check inside an aluminium ring.

**Sticky mobile action bar (under 768px)**
- A glass bar fixed to the bottom with safe-area padding and three equal buttons: 📞 Call (opens a sheet to pick a branch), WhatsApp, and Get Quote (primary sky).
- It hides on scroll down and shows on scroll up, and never covers form inputs (it hides while an input is focused).

---

## 5. Motion system (Lenis + GSAP ScrollTrigger)

- Lenis settings: `{ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 }`. Sync Lenis with GSAP: `lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0)`. Anchor links go through `lenis.scrollTo`.
- **Animate only `transform` and `opacity`** (plus CSS variables that resolve to colour for the swatch). Never animate width, height, top, left or filter on scroll. For height expands, use the GSAP Flip or `grid-template-rows: 0fr → 1fr` technique.
- Easing:
  - entrances: `power3.out` / `--ease-out`, 0.8–1.1 s
  - UI micro-interactions: 0.25–0.35 s `power2.out`
  - door panels and big reveals: `power4.inOut`
  - never use linear, except for scrubbed parallax
- Stagger is 0.06–0.08 s. Reveals: translateY(24px) to 0 plus opacity 0 to 1, triggered at `top 85%`, once.
- Parallax: images inside cards move ±6% (`scrub: true`). Section numbers drift slower than their content.
- Respect `prefers-reduced-motion: reduce`: disable Lenis, show the poster instead of video, skip the door intro, and make all reveals instant opacity only.
- Hover, on fine pointers only: cards lift 4px, the shadow deepens, and an aluminium sheen sweeps across the border (an animated gradient position on a pseudo-element via transform).
- Use `will-change` sparingly (only during the animation).

## 6. Signature moments (must feel "out of this world")

1. **The door opens.** Glass panels slide apart on load, revealing the light-filled room video, with a light-beam sweep.
2. **Light follows you.** A very soft radial "sunlight" gradient follows the cursor across glass cards (a CSS variable updated with rAF; desktop only).
3. **Aluminium sheen.** Buttons and card borders catch a moving highlight on hover, like brushed metal.
4. **Swatch recolour.** The frame colour morphs smoothly between White, Black, Bronze, Wood and Anodised.
5. **Window that sizes itself.** The estimator's SVG window grows and shrinks to scale as you type dimensions, and the sash count changes by type.
6. **Filter pills with a sliding thumb**, plus Flip-animated grid reflow and the "see all" expansion.
7. **Section 05 frosted-glass table**, which un-blurs row by row as you scroll it in (opacity/transform only on overlaid glass strips).
8. **Branch map fly-to**, with the open-now badge pulsing softly when the branch is open.

## 7. Photo, video and asset rules

Convert every raster to **WebP at q85 or higher** (`cwebp -q 86`), plus AVIF where it is smaller. Generate 640/1024/1600/2400 widths and serve `<picture>` + `srcset` + `sizes`. Set `width`/`height` to prevent CLS. Use `loading="lazy"` for everything below the fold; the hero poster uses `fetchpriority="high"`.

Asset map. Use exactly these files:

| Where | File |
|---|---|
| Header/footer logo | `/assets/own/logo-navy.png` (or an SVG recreation) |
| Hero video | `/assets/stock/video-villa-room-light-timelapse.mp4` → processed `/video/hero-*` |
| Windows & Doors band | `/assets/stock/video-hero-ocean-window-palms.mp4`; poster `photo-window-wall-natural-light.jpg` |
| Finishes section backdrop | `/assets/stock/photo-interior-living-sliding-doors-pool.jpg` |
| Catalogue category tiles | Windows: `photo-bedroom-floor-to-ceiling-windows.jpg` · Doors: `photo-patio-doors-garden.jpg` · Showers: `photo-glass-shower-modern-bathroom.jpg` · Railings: `photo-modern-house-glass-balconies.jpg` · Blinds: `photo-roller-blinds-kitchen.jpg` · Commercial: `photo-commercial-glass-facade.jpg` |
| Product cards | `/assets/own/product-*.jpg` as mapped in `BUSINESS.products[].img` (300×300 originals: display at ≤300px CSS on a white "studio" tile with padding, never upscale). No image → SVG line illustration |
| Section 05 background | `video-modern-luxury-villa-exterior.mp4` (white wash 90%) |
| Section 05 side image | `photo-sheer-curtains-open-patio.jpg` |
| Before/After | `/assets/own/oldsite-house-two-storey.jpg` + `/assets/own/project-storefront-glazing.jpg` (PLACEHOLDER) |
| Projects gallery | `/assets/own/project-*.jpg` + Inspiration stock as listed in section 07 |
| Showers band | `video-luxury-bathroom.mp4`; poster `photo-glass-shower-bathtub.jpg`; inset `photo-frameless-corner-shower.jpg` |
| Interior partition / commercial | `photo-interior-glass-sliding-partition-black.jpg`, `photo-commercial-curtain-wall.jpg` |
| Branch section header | `photo-tropical-villa-aerial.jpg` (subtle, 20% opacity) |
| Final CTA | `video-hotel-room-balcony-view.mp4`; poster `photo-terrace-glass-doors-railing.jpg` |
| OG image (1200×630) | Compose: `photo-caribbean-hillside-villa.jpg` + logo + "Windows · Doors · Glass" |

Do NOT use `/assets/own/oldsite-banner-*` (they have baked-in text) or anything from the old site's demo or theme content.

## 8. Quality rules

- **Mobile-first.** Design at 375px first, then 768, 1024 and 1440. Tap targets are 44px or larger.
- **Lighthouse on mobile: 85+ for Performance and 95+ for Accessibility, Best Practices and SEO.** JS budget: 120 KB gzip or less before Leaflet (lazy). Lenis and GSAP load deferred.
- Body text is 17px minimum, with contrast of 4.5:1 or better. Sky `#26A8E0` on white fails for body text, so use it for large text, icons and button backgrounds only. Button text on sky must be bold and 16px or larger, or use `--navy` text on sky.
- Every image has meaningful `alt` text describing the product or scene. Decorative images use `alt=""`.
- Semantic landmarks, a skip link, visible focus rings (2px sky outline with an offset), and full keyboard use of the filters, slider, lightbox, estimator and modal.
- JSON-LD: `HomeAndConstructionBusiness` with every branch as `department` (address, telephone, openingHoursSpecification), plus `FAQPage`.
- Meta: title "Home Solutions | Aluminium & uPVC Windows, Doors & Glass, Jamaica", a description, OG/Twitter tags, a favicon from the logo's house icon, and `theme-color #FFFFFF`.
- **No lorem ipsum, no invented content.** Where content is missing, use a tasteful "Coming soon" or "Price on request" and a `// TODO(business):` comment.
- Phone links use the E.164 `tel:+1876…` format. Display them as "876-957-9360".
- Works without JS: content is readable, forms degrade to mailto, and the video is replaced by the poster.

## 9. Check before you say done

1. Run `npm run build` and serve `dist/`. There must be no console errors or warnings.
2. Take Playwright screenshots at **375×812, 768×1024, 1440×900**: the full page plus each section (hero mid-door-open, catalogue filtered to "Showers", the "see all" expanded state, the swatch on Bronze and on Wood, the estimator at the summary step for both a priced steel door and a TBC window, the before/after at 50%, the lightbox open, the branch finder with one card selected, the FAQ open, the mobile action bar). Save them to `/screenshots` and look at every one.
3. Run Lighthouse mobile and paste the scores. Fix anything under the targets.
4. Emulate `prefers-reduced-motion`: there is no smooth scroll and no video, and everything is still visible.
5. Run `grep -ri "lorem\|ipsum\|placeholder" src/`. Only intentional `PLACEHOLDER`/`TODO(business)` comments may remain.
6. Check that every price shown matches `BUSINESS.products[].priceJMD`, and that every other price says "Price on request" or "TBC".
7. Confirm that the open-now badge is correct for America/Jamaica time. Test by mocking the dates Sat 15:00, Sat 16:00 and Sun 12:00.
8. Confirm that every `tel:` link and the WhatsApp prefill text are correct, and that the Formspree fallback works when the ID is "TBC".
9. Check that the hero files are under budget and loop seamlessly.
10. List every remaining `TODO(business)` for the owner in your final message.
