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
   tall = true for portrait-shaped photos
   --------------------------------------------------------------------- */
window.FEATURED = [
  { src: "images/hero.jpg", alt: "Smiling baby in a woven basket among cut logs", tall: true, category: "Photo Sessions" }
  // { src: "images/gallery/graduation-01.jpg", alt: "Graduates throwing caps", category: "Schools" },
  // { src: "images/gallery/wedding-01.jpg", alt: "Bride and groom at sunset", category: "Weddings" },
];

/* ---------------------------------------------------------------------
   HOME PAGE — photo stream
   These photos float up across the top of the home page after the intro.
   With one photo it repeats; add more and they take turns.
   e.g. "images/gallery/wedding-01.jpg",
   --------------------------------------------------------------------- */
window.HERO_STREAM = [
  "images/hero.jpg"
];

/* ---------------------------------------------------------------------
   GALLERIES — photos for each section of the Galleries page.
   Section keys: schools, sessions, events, weddings, portraits, id
   --------------------------------------------------------------------- */
window.GALLERIES = {
  schools: [
    // { src: "images/gallery/school-01.jpg", alt: "Class photo" },
  ],
  sessions: [
    { src: "images/hero.jpg", alt: "Outdoor baby session with a woven basket", tall: true }
  ],
  events: [],
  weddings: [],
  portraits: [],
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
