/* =====================================================================
   CANDID EXPRESSIONS — SITE CONTENT
   ---------------------------------------------------------------------
   This is the ONE file you edit to update the website.
   - Add photos: put the image in /images/gallery/ and list it below.
   - Add prices: replace null with text, e.g. "J$15,000".
   - Add reviews: add an entry to TESTIMONIALS.
   Keep the quotes and commas exactly as shown in the examples.
   ===================================================================== */

window.SITE = {
  name: "Candid Expressions",
  tagline: "Photography",
  phoneDisplay: "(876) 568-5668",
  phoneLink: "+18765685668",
  whatsapp: "18765685668", // country code + number, digits only
  email: "candidexpressionsphotography@gmail.com",
  address: "Shop #15 Hendon Mall, Beckford Street, Savanna-la-Mar, Westmoreland, Jamaica",
  mapsQuery: "Hendon Mall, Beckford Street, Savanna-la-Mar, Westmoreland, Jamaica",

  // Optional: paste a Formspree (formspree.io) form URL here to receive
  // booking forms by email automatically, e.g. "https://formspree.io/f/abcd1234".
  // Leave empty ("") and the form sends through WhatsApp or email instead.
  formEndpoint: "",

  // Optional: Fiwi Place website or Instagram link. Leave "" if none.
  fiwiPlaceUrl: ""
};

/* ---------------------------------------------------------------------
   HOME PAGE — "Featured work" (show your best 6–10 photos)
   src  = path to the photo
   alt  = short description (helps Google + screen readers)
   category = label shown when the photo is hovered
   wide = true for landscape (sideways) photos, so they get a large square
          spot instead of a tall narrow one
   pos  = optional focus point if the important part is off-centre,
          e.g. "85% 50%" keeps the right-hand side in view
   The first photo always gets the biggest spot.
   --------------------------------------------------------------------- */
window.FEATURED = [
  { src: "images/gallery/wedding-04.jpg", alt: "Bride and groom hold hands on a wooden footbridge above turquoise water", category: "Weddings" },
  { src: "images/gallery/wedding-02.jpg", alt: "Groom lifts his bride for a kiss on a wooden pier by the sea", category: "Weddings" },
  { src: "images/gallery/wedding-05.jpg", alt: "Bride and groom walk hand in hand down a tropical garden path", category: "Weddings" },
  { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", category: "Birthdays & Events", wide: true, pos: "85% 50%" },
  { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop", category: "Schools" },
  { src: "images/gallery/event-01.jpg", alt: "Smiling toddler on a log under a Happy Birthday banner", category: "Birthdays & Events" },
  { src: "images/gallery/aerial-02.jpg", alt: "Aerial view of a new housing development above a turquoise bay in Westmoreland", category: "Aerial & Real Estate", wide: true },
  { src: "images/gallery/family-01.jpg", alt: "Family of five dressed in white on the beach", category: "Photo Sessions" },
  { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence", category: "Photo Sessions" }
];

/* ---------------------------------------------------------------------
   HOME PAGE — photo stream
   These photos float up across the top of the home page after the intro.
   With one photo it repeats; add more and they take turns.
   e.g. "images/gallery/wedding-01.jpg",
   --------------------------------------------------------------------- */
window.HERO_STREAM = [
  "images/stream/wedding-04.jpg",
  "images/stream/family-01.jpg",
  "images/stream/event-01.jpg",
  "images/stream/wedding-01.jpg",
  "images/stream/school-01.jpg",
  "images/stream/maternity-01.jpg",
  "images/stream/wedding-02.jpg",
  "images/stream/family-02.jpg",
  "images/stream/wedding-05.jpg",
  "images/stream/event-02.jpg",
  "images/stream/aerial-02.jpg",
  "images/stream/wedding-03.jpg",
  "images/stream/baby-01.jpg"
];

/* ---------------------------------------------------------------------
   GALLERIES — photos for each section of the Galleries page.
   Section keys: weddings, events, schools, sessions, portraits, aerial, id
   --------------------------------------------------------------------- */
window.GALLERIES = {
  weddings: [
    { src: "images/gallery/wedding-04.jpg", alt: "Bride and groom hold hands on a wooden footbridge above turquoise water" },
    { src: "images/gallery/wedding-05.jpg", alt: "Bride and groom walk hand in hand down a tropical garden path" },
    { src: "images/gallery/wedding-01.jpg", alt: "Groom kisses the bride's forehead as she holds a bouquet of tropical flowers" },
    { src: "images/gallery/wedding-02.jpg", alt: "Groom lifts his bride for a kiss on a wooden pier by the sea" },
    { src: "images/gallery/wedding-03.jpg", alt: "Couple in white embracing on a seaside pier" }
  ],
  events: [
    { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", wide: true },
    { src: "images/gallery/event-01.jpg", alt: "Smiling toddler on a log under a Happy Birthday banner" }
  ],
  schools: [
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" }
  ],
  sessions: [
    { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence" },
    { src: "images/gallery/family-01.jpg", alt: "Family of five dressed in white on the beach" },
    { src: "images/gallery/family-02.jpg", alt: "Smiling family in white with straw hats by the sea" },
    { src: "images/hero.jpg", alt: "Outdoor baby session with a woven basket" }
  ],
  portraits: [
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" }
  ],
  aerial: [
    { src: "images/gallery/aerial-02.jpg", alt: "Aerial view of a new housing development above a turquoise bay in Westmoreland", wide: true },
    { src: "images/gallery/aerial-03.jpg", alt: "Aerial view of a modern villa with an infinity pool and hot tub", wide: true },
    { src: "images/gallery/aerial-01.jpg", alt: "Aerial view of White House Beach Club homes under construction in the Westmoreland hills", wide: true }
  ],
  id: []
};

/* ---------------------------------------------------------------------
   PRICES — "Starting at" prices on the Services & Pricing page.
   null = shows "Ask for a quote". Replace with text, e.g. "J$12,000".
   --------------------------------------------------------------------- */
window.PRICES = {
  school: null,
  session30: null,
  session60: null,
  events: null,
  weddings: null,
  portraits: null,
  aerial: null,
  idPrinting: null,
  prints: null,
  digital: null
};

/* ---------------------------------------------------------------------
   WEDDING PACKAGES — add your custom packages here.
   Example:
   { name: "Silver", price: "J$80,000", features: ["6 hours coverage", "300 edited photos", "Online gallery"] },
   --------------------------------------------------------------------- */
window.WEDDING_PACKAGES = [];

/* ---------------------------------------------------------------------
   TESTIMONIALS — real reviews from schools and clients.
   Example:
   { quote: "The photos were beautiful!", name: "Mrs. Brown", role: "Principal, ABC Primary", rating: 5 },
   --------------------------------------------------------------------- */
window.TESTIMONIALS = [];

/* ---------------------------------------------------------------------
   CLIENT PROOFING GALLERIES
   Each gallery is unlocked with an access code you give the client/school.
   codeHash = SHA-256 of the code in CAPITAL letters.
   Create one at https://emn178.github.io/online-tools/sha256.html
   (type the code in CAPITALS, copy the result here).

   NOTE: this keeps casual visitors out, but files on a public website
   can still be found by someone determined. Upload watermarked/low-res
   proofs only — never the full-resolution originals.

   The "DEMO" gallery below (code: DEMO) lets you test the page.
   Delete it once you add your first real gallery.
   --------------------------------------------------------------------- */
window.PROOFING_GALLERIES = [
  {
    name: "Demo Gallery",
    codeHash: "4ff006ca6b88e752f08cb7881714505ceb3d2079eea432acfda8e158e0d1d82e",
    photos: [
      { img: "1001", src: "images/hero.jpg" },
      { img: "1002", src: "images/collage/face.jpg" },
      { img: "1003", src: "images/collage/hands.jpg" }
    ]
  }
];

/* Print & download options shown when ordering from a proofing gallery. */
window.ORDER_OPTIONS = ["Digital file", "4×6 print", "5×7 print", "8×10 print", "Wallet sheet", "Full package"];
