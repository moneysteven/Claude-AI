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
  phoneDisplay: "(876) 858-5172",
  phoneLink: "+18768585172",
  whatsapp: "18768585172", // country code + number, digits only
  // The office line, shown in the footer under the main number. Set to "" to hide it.
  phone2Label: "Office",
  phone2Display: "(876) 993-1818",
  phone2Link: "+18769931818",
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
   HOME PAGE — "Featured work" (show your best 6–12 photos; phones show 9)
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
  { src: "images/gallery/wedding-11.jpg", alt: "Bride and groom nose to nose on a seaside terrace as her veil flies in the wind", category: "Weddings", wide: true, pos: "68% 50%" },
  { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop", category: "Schools" },
  { src: "images/gallery/event-01.jpg", alt: "Smiling toddler on a log under a Happy Birthday banner", category: "Birthdays & Events" },
  { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", category: "Birthdays & Events", wide: true, pos: "85% 50%" },
  { src: "images/gallery/family-01.jpg", alt: "Family of five dressed in white on the beach", category: "Photo Sessions" },
  { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence", category: "Photo Sessions" },
  { src: "images/gallery/portrait-02.jpg", alt: "Professional headshot of a woman in a navy blazer with her chin resting on her hand", category: "Portraits" },
  { src: "images/gallery/family-03.jpg", alt: "Mother and daughter in matching African-print outfits, smiling in the studio", category: "Photo Sessions" },
  { src: "images/gallery/aerial-02.jpg", alt: "Aerial view of a new housing development above a turquoise bay in Westmoreland", category: "Aerial & Real Estate", wide: true }
];

/* ---------------------------------------------------------------------
   HOME PAGE — photo stream
   These photos float up across the top of the home page after the intro.
   They use the small copies (about 640px) in images/stream/. Add more and
   they take turns, e.g. "images/stream/wedding-01.jpg",
   --------------------------------------------------------------------- */
window.HERO_STREAM = [
  "images/stream/wedding-04.jpg",
  "images/stream/wedding-10.jpg",
  "images/stream/family-03.jpg",
  "images/stream/wedding-23.jpg",
  "images/stream/wedding-20.jpg",
  "images/stream/wedding-18.jpg",
  "images/stream/school-01.jpg",
  "images/stream/maternity-01.jpg",
  "images/stream/wedding-02.jpg",
  "images/stream/family-04.jpg",
  "images/stream/wedding-16.jpg",
  "images/stream/portrait-02.jpg",
  "images/stream/wedding-11.jpg",
  "images/stream/event-04.jpg",
  "images/stream/event-02.jpg",
  "images/stream/aerial-02.jpg",
  "images/stream/wedding-13.jpg",
  "images/stream/hero.jpg"
];

/* ---------------------------------------------------------------------
   GALLERIES — photos for each section of the Galleries page.
   Section keys: weddings, events, schools, sessions, portraits, aerial, id
   --------------------------------------------------------------------- */
window.GALLERIES = {
  weddings: [
    { src: "images/gallery/wedding-11.jpg", alt: "Bride and groom nose to nose on a seaside terrace as her veil flies in the wind", wide: true },
    { src: "images/gallery/wedding-14.jpg", alt: "Groom standing in the water kisses his bride in a fishing boat marked Mr and Mrs under a pink sunset sky", wide: true },
    { src: "images/gallery/wedding-23.jpg", alt: "Bride on a white staircase framed by pink bougainvillea, her lace train spread down the steps" },
    { src: "images/gallery/wedding-17.jpg", alt: "Groom holds his bride close as her gown and veil flow in the sea breeze" },
    { src: "images/gallery/wedding-13.jpg", alt: "Bride and her bridesmaids in blush pink posing at a seaside lighthouse under a pink sunset sky", wide: true },
    { src: "images/gallery/wedding-20.jpg", alt: "Groom kisses his bride's hand on the steps of a red, gold and green beach shack" },
    { src: "images/gallery/wedding-04.jpg", alt: "Bride and groom hold hands on a wooden footbridge above turquoise water" },
    { src: "images/gallery/wedding-18.jpg", alt: "Groom dips his bride for a kiss on a rocky shore at dusk", wide: true },
    { src: "images/gallery/wedding-22.jpg", alt: "Bride in her robe and veil smelling her bouquet beside her hanging wedding gown", wide: true },
    { src: "images/gallery/wedding-09.jpg", alt: "Bride and groom cheek to cheek by the sea with a pink and white bouquet", wide: true },
    { src: "images/gallery/wedding-15.jpg", alt: "Bride and groom kiss on a small wooden bridge under a breezy gazebo" },
    { src: "images/gallery/wedding-02.jpg", alt: "Groom lifts his bride for a kiss on a wooden pier by the sea" },
    { src: "images/gallery/wedding-19.jpg", alt: "Bride in a lace gown climbing a rustic wooden staircase under a beamed ceiling" },
    { src: "images/gallery/wedding-16.jpg", alt: "Bride and groom kiss on a yellow tricycle cart on a seaside pier", wide: true },
    { src: "images/gallery/wedding-06.jpg", alt: "Bride and groom share a first-look moment, holding hands around a door", wide: true },
    { src: "images/gallery/wedding-05.jpg", alt: "Bride and groom walk hand in hand down a tropical garden path" },
    { src: "images/gallery/wedding-21.jpg", alt: "Smiling bride holding orchids at a seaside railing at sunset" },
    { src: "images/gallery/wedding-10.jpg", alt: "Full wedding party of bridesmaids in pink and groomsmen in blue by a seaside lighthouse", wide: true },
    { src: "images/gallery/wedding-01.jpg", alt: "Groom kisses the bride's forehead as she holds a bouquet of tropical flowers" },
    { src: "images/gallery/wedding-08.jpg", alt: "Bride with her bridesmaids in blush pink gathered around her bouquet", wide: true },
    { src: "images/gallery/wedding-12.jpg", alt: "Save-the-date photo of a couple in matching red shirts holding SAVE THE DATE signs while their son does a handstand by the sea" },
    { src: "images/gallery/wedding-07.jpg", alt: "Smiling groom with his groomsmen beside the ceremony gazebo", wide: true },
    { src: "images/gallery/wedding-03.jpg", alt: "Couple in white embracing on a seaside pier" }
  ],
  events: [
    { src: "images/gallery/event-04.jpg", alt: "Laughing four-year-old in denim overalls on a white chair surrounded by balloons and a chalkboard" },
    { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", wide: true },
    { src: "images/gallery/event-01.jpg", alt: "Smiling toddler on a log under a Happy Birthday banner" },
    { src: "images/gallery/event-06.jpg", alt: "Cupcakes with swirled white frosting and gold sprinkles in gold lace wrappers on a black iron stand", wide: true },
    { src: "images/gallery/event-05.jpg", alt: "Mother and daughter in matching denim showing socks that read Skylar Marie turns 4", wide: true },
    { src: "images/gallery/event-03.jpg", alt: "Smiling woman in black holding a pink Happy Birthday cake and a bunch of balloons", wide: true },
    { src: "images/gallery/event-07.jpg", alt: "Close-up of frosted cupcakes with gold sprinkles in gold lace wrappers" }
  ],
  schools: [
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" },
    { src: "images/gallery/school-02.jpg", alt: "Speaker with a microphone at a HEART/NSTA Trust podium in front of blue and gold drapes", wide: true },
    { src: "images/gallery/school-03.jpg", alt: "Aerial view of Manning's School in Savanna-la-Mar: the historic wooden main building with its bell tower, students in uniform out front and the playing field behind", wide: true }
  ],
  sessions: [
    { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence" },
    { src: "images/gallery/family-03.jpg", alt: "Mother and daughter in matching African-print outfits, smiling in the studio" },
    { src: "images/gallery/family-05.jpg", alt: "Three smiling siblings in matching Christmas pyjamas holding hands beside a frosted wreath", wide: true },
    { src: "images/gallery/session-03.jpg", alt: "Woman in a pink pleated skirt standing on a rooftop rope swing at sunset", wide: true },
    { src: "images/gallery/family-04.jpg", alt: "Mother in a flowing pink skirt with her two sons on a pink tree swing" },
    { src: "images/gallery/couple-01.jpg", alt: "Couple in gold and silver outfits sharing a kiss under a sunlit tree", wide: true },
    { src: "images/gallery/baby-03.jpg", alt: "Smiling baby in a woven basket on a white fur blanket in the studio" },
    { src: "images/gallery/session-01.jpg", alt: "Woman in a flowing African-print halter dress and head wrap in the studio" },
    { src: "images/gallery/family-01.jpg", alt: "Family of five dressed in white on the beach" },
    { src: "images/gallery/baby-02.jpg", alt: "Close-up of a wide-eyed baby in a white headband", wide: true },
    { src: "images/gallery/session-02.jpg", alt: "Toddler in a red Christmas outfit on a leather sofa holding a mini Christmas tree" },
    { src: "images/gallery/family-02.jpg", alt: "Smiling family in white with straw hats by the sea" },
    { src: "images/hero.jpg", alt: "Outdoor baby session with a woven basket" }
  ],
  portraits: [
    { src: "images/gallery/portrait-02.jpg", alt: "Professional headshot of a woman in a navy blazer with her chin resting on her hand" },
    { src: "images/gallery/portrait-03.jpg", alt: "Musician in a plum suit and tinted glasses singing and playing an acoustic guitar outdoors", wide: true },
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" },
    { src: "images/gallery/portrait-01.jpg", alt: "Girl in a red lace dress wearing a crown of butterflies in the studio" }
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
