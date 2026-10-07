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
  // Calls: every "Call" button and phone link on the site rings the office.
  phoneLabel: "Office", // shown before the number in the footer; "" to hide
  phoneDisplay: "(876) 993-1818",
  phoneLink: "+18769931818",
  // WhatsApp: every WhatsApp button, the floating button and the forms.
  whatsappDisplay: "(876) 858-5172",
  whatsapp: "18768585172", // country code + number, digits only
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
   HOME PAGE — "Featured work"
   Photos with an `area` are that area's COVER: the home page shows one cover per
   area (6 tiles), and tapping a cover opens that area's gallery. Photos without
   an `area` appear when a visitor taps "See more photos" (up to 12).
   src  = path to the photo
   alt  = short description (helps Google + screen readers)
   area = gallery to open: weddings, events, schools, sessions, portraits, aerial
   category = label on the photo
   wide = true for landscape (sideways) photos, so they get a large square
          spot instead of a tall narrow one
   pos  = optional focus point if the important part is off-centre,
          e.g. "85% 50%" keeps the right-hand side in view
   --------------------------------------------------------------------- */
window.FEATURED = [
  // Area covers (shown first, in this order)
  { src: "images/gallery/wedding-16.jpg", alt: "Bride and groom kiss on a yellow tricycle cart on a seaside pier", area: "weddings", category: "Weddings", pos: "46% 50%" },
  { src: "images/gallery/event-14.jpg", alt: "Two-year-old in a black vest and bow tie on a stool under black Happy Birthday balloons, with a giant 2 balloon", area: "events", category: "Birthdays & Events", pos: "50% 45%" },
  { src: "images/gallery/school-04.jpg", alt: "Manning's School Sixth Form Graduating Class of 2024 portrait of a smiling graduate holding her diploma tube", area: "schools", category: "Schools" },
  { src: "images/hero.jpg", alt: "Smiling baby in a white headband sitting in a woven basket among cut logs", area: "sessions", category: "Photo Sessions", pos: "50% 35%" },
  { src: "images/gallery/portrait-03.jpg", alt: "Musician in a plum suit and tinted glasses singing and playing an acoustic guitar outdoors", area: "portraits", category: "Portraits", pos: "47% 50%" },
  { src: "images/gallery/aerial-02.jpg", alt: "Aerial view of a new housing development above a turquoise bay in Westmoreland", area: "aerial", category: "Aerial & Real Estate" },
  // Shown after "See more photos"
  { src: "images/gallery/wedding-17.jpg", alt: "Groom holds his bride close as her gown and veil flow in the sea breeze", category: "Weddings" },
  { src: "images/gallery/wedding-11.jpg", alt: "Bride and groom nose to nose on a seaside terrace as her veil flies in the wind", category: "Weddings", wide: true, pos: "68% 50%" },
  { src: "images/gallery/event-08.jpg", alt: "Smiling five-year-old in a pink tiara and ruffled pink dress holding her number 5 birthday cake", category: "Birthdays & Events" },
  { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence", category: "Photo Sessions" },
  { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", category: "Birthdays & Events", wide: true, pos: "85% 50%" },
  { src: "images/gallery/event-10.jpg", alt: "Sweet sixteen in a sunflower print outfit and Happy Birthday sash leaning on a white fence beside gold 1 and 6 balloons", category: "Birthdays & Events" },
  { src: "images/gallery/family-07.jpg", alt: "Mother and her daughters in matching red Christmas pyjamas playing with a snowman ornament beside a flocked Christmas tree", category: "Photo Sessions" },
  { src: "images/gallery/aerial-03.jpg", alt: "Aerial view of a modern villa with an infinity pool and hot tub", category: "Aerial & Real Estate", wide: true },
  { src: "images/gallery/session-04.jpg", alt: "Toddler dressed as a little builder in a yellow safety vest, holding a hard hat and a toy screwdriver", category: "Photo Sessions" },
  { src: "images/gallery/wedding-30.jpg", alt: "Smiling bride with a tropical bouquet and groom in a navy suit and straw hat on a stone cliff terrace above the sea", category: "Weddings" },
  { src: "images/gallery/portrait-02.jpg", alt: "Professional headshot of a woman in a navy blazer with her chin resting on her hand", category: "Portraits" },
  { src: "images/gallery/school-03.jpg", alt: "Aerial view of Manning's School in Savanna-la-Mar: the historic wooden main building with its bell tower, students in uniform out front and the playing field behind", category: "Schools", wide: true }
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
    { src: "images/gallery/wedding-24.jpg", alt: "Seaside ceremony set up on a lawn: white folding chairs facing a draped white gazebo, with cocktail tables by the pool and the sea beyond", wide: true },
    { src: "images/gallery/wedding-18.jpg", alt: "Groom dips his bride for a kiss on a rocky shore at dusk", wide: true },
    { src: "images/gallery/wedding-22.jpg", alt: "Bride in her robe and veil smelling her bouquet beside her hanging wedding gown", wide: true },
    { src: "images/gallery/wedding-09.jpg", alt: "Bride and groom cheek to cheek by the sea with a pink and white bouquet", wide: true },
    { src: "images/gallery/wedding-15.jpg", alt: "Bride and groom kiss on a small wooden bridge under a breezy gazebo" },
    { src: "images/gallery/wedding-02.jpg", alt: "Groom lifts his bride for a kiss on a wooden pier by the sea" },
    { src: "images/gallery/wedding-19.jpg", alt: "Bride in a lace gown climbing a rustic wooden staircase under a beamed ceiling" },
    { src: "images/gallery/wedding-16.jpg", alt: "Bride and groom kiss on a yellow tricycle cart on a seaside pier", wide: true },
    { src: "images/gallery/wedding-06.jpg", alt: "Bride and groom share a first-look moment, holding hands around a door", wide: true },
    { src: "images/gallery/wedding-05.jpg", alt: "Bride and groom walk hand in hand down a tropical garden path" },
    { src: "images/gallery/wedding-26.jpg", alt: "Groom kisses his smiling bride's cheek beneath a weathered driftwood tree on the beach" },
    { src: "images/gallery/wedding-25.jpg", alt: "Detail shot of the groomsmen's tan leather lace-up shoes", wide: true },
    { src: "images/gallery/wedding-21.jpg", alt: "Smiling bride holding orchids at a seaside railing at sunset" },
    { src: "images/gallery/wedding-10.jpg", alt: "Full wedding party of bridesmaids in pink and groomsmen in blue by a seaside lighthouse", wide: true },
    { src: "images/gallery/wedding-01.jpg", alt: "Groom kisses the bride's forehead as she holds a bouquet of tropical flowers" },
    { src: "images/gallery/wedding-08.jpg", alt: "Bride with her bridesmaids in blush pink gathered around her bouquet", wide: true },
    { src: "images/gallery/wedding-28.jpg", alt: "Bride and groom in a straw hat smile at each other in front of a bamboo fence on the sand" },
    { src: "images/gallery/wedding-27.jpg", alt: "Bride and groom share a kiss against a corrugated zinc wall on the beach" },
    { src: "images/gallery/wedding-07.jpg", alt: "Smiling groom with his groomsmen beside the ceremony gazebo", wide: true },
    { src: "images/gallery/wedding-03.jpg", alt: "Couple in white embracing on a seaside pier" },
    { src: "images/gallery/wedding-30.jpg", alt: "Smiling bride with a tropical bouquet and groom in a navy suit and straw hat on a stone cliff terrace above the sea" },
    { src: "images/gallery/wedding-29.jpg", alt: "Bride and groom kiss against a sunlit bamboo wall on the beach", wide: true },
    { src: "images/gallery/wedding-31.jpg", alt: "Bridal detail: ivory satin heels with crystal bows and straps, with sparkling jewellery on a white table" },
    { src: "images/gallery/wedding-32.jpg", alt: "Smiling bride in a lace-sleeved satin robe, crystal necklace and hair vine, by a white lattice porch" },
    { src: "images/gallery/wedding-33.jpg", alt: "Flower girl in white high-fives the bride through a window as they get ready" },
    { src: "images/gallery/wedding-34.jpg", alt: "Groom in a grey suit kisses his smiling bride's forehead as she holds a pink and white bouquet" },
    { src: "images/gallery/wedding-35.jpg", alt: "Bride and groom embrace under a gold hoop arch with flowers and greenery on a petal-strewn aisle" },
    { src: "images/gallery/wedding-36.jpg", alt: "Smiling bride in a long-sleeved lace gown, crystal hairpiece and cathedral veil holding white roses under the trees" },
    { src: "images/gallery/wedding-37.jpg", alt: "Couple embrace under a floral arch draped in white at a beach ceremony, palm trees and the sea behind" },
    { src: "images/gallery/wedding-38.jpg", alt: "Newlyweds in a floral dress and a pink shirt dance back down the beach aisle as guests cheer", wide: true },
    { src: "images/gallery/wedding-39.jpg", alt: "Smiling newlyweds walk hand in hand down the sandy aisle between rows of guests on white chairs", wide: true },
    { src: "images/gallery/wedding-40.jpg", alt: "Laughing groom in pink leads his smiling bride down the beach aisle as she lifts her floral skirt", wide: true },
    { src: "images/gallery/wedding-41.jpg", alt: "Couple in a floral dress and pink outfit stroll hand in hand down a garden path by a wooden rail", wide: true },
    { src: "images/gallery/wedding-42.jpg", alt: "Smiling couple walk hand in hand among palm trees, she in a blue and pink floral dress, he in pink", wide: true },
    { src: "images/gallery/wedding-43.jpg", alt: "Couple embrace by a green hedge, she holding pink carnations in a blue and pink floral dress, he in a pink shirt" },
    { src: "images/gallery/wedding-44.jpg", alt: "Couple laugh together as they dance in a tropical garden, a pink carnation bouquet over his shoulder", wide: true },
    { src: "images/gallery/wedding-45.jpg", alt: "Playful moment as the groom puckers up and the laughing bride holds his chin in a tropical garden", wide: true },
    { src: "images/gallery/wedding-46.jpg", alt: "Couple face each other on stone steps in front of a rock waterfall framed by ivy-covered pillars" }
  ],
  events: [
    { src: "images/gallery/event-04.jpg", alt: "Laughing four-year-old in denim overalls on a white chair surrounded by balloons and a chalkboard" },
    { src: "images/gallery/event-02.jpg", alt: "One-year-old in a rainbow tutu with balloons and wooden ONE letters", wide: true },
    { src: "images/gallery/event-08.jpg", alt: "Smiling five-year-old in a pink tiara and ruffled pink dress holding her number 5 birthday cake" },
    { src: "images/gallery/event-01.jpg", alt: "Smiling toddler on a log under a Happy Birthday banner" },
    { src: "images/gallery/event-10.jpg", alt: "Sweet sixteen in a sunflower print outfit and Happy Birthday sash leaning on a white fence beside gold 1 and 6 balloons" },
    { src: "images/gallery/event-06.jpg", alt: "Cupcakes with swirled white frosting and gold sprinkles in gold lace wrappers on a black iron stand", wide: true },
    { src: "images/gallery/event-11.jpg", alt: "Sweet sixteen in a blush satin dress sitting on a tree stump with her butterfly cake beside gold 1 and 6 balloons" },
    { src: "images/gallery/event-05.jpg", alt: "Mother and daughter in matching denim showing socks that read Skylar Marie turns 4", wide: true },
    { src: "images/gallery/event-09.jpg", alt: "Laughing birthday girl with frosting on her lips holding her cake in front of a pink Happy Birthday backdrop" },
    { src: "images/gallery/event-03.jpg", alt: "Smiling woman in black holding a pink Happy Birthday cake and a bunch of balloons", wide: true },
    { src: "images/gallery/event-14.jpg", alt: "Two-year-old in a black vest and bow tie on a stool under black Happy Birthday balloons, with a giant 2 balloon" },
    { src: "images/gallery/event-17.jpg", alt: "Smiling contestant with copper locs wearing a Miss Demma's Catering sash in front of a yellow JCDC banner" },
    { src: "images/gallery/event-12.jpg", alt: "Guests in smart evening wear chatting with drinks at an indoor reception", wide: true },
    { src: "images/gallery/event-07.jpg", alt: "Close-up of frosted cupcakes with gold sprinkles in gold lace wrappers" },
    { src: "images/gallery/event-16.jpg", alt: "Smiling young woman in a black dress, tiara and Birthday Queen sash walking past a white picket fence with a bouquet" },
    { src: "images/gallery/event-15.jpg", alt: "Birthday boy in a bow tie kissing his smiling mother on the cheek under black Happy Birthday balloons" },
    { src: "images/gallery/event-13.jpg", alt: "Five smiling guests posing around a cocktail table with flowers, drinks and desserts at an evening reception", wide: true }
  ],
  schools: [
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" },
    { src: "images/gallery/school-02.jpg", alt: "Speaker with a microphone at a HEART/NSTA Trust podium in front of blue and gold drapes", wide: true },
    { src: "images/gallery/school-04.jpg", alt: "Manning's School Sixth Form Graduating Class of 2024 portrait of a smiling graduate holding her diploma tube" },
    { src: "images/gallery/school-03.jpg", alt: "Aerial view of Manning's School in Savanna-la-Mar: the historic wooden main building with its bell tower, students in uniform out front and the playing field behind", wide: true }
  ],
  sessions: [
    { src: "images/gallery/maternity-01.jpg", alt: "Maternity portrait in a flowing light-blue gown by a rustic fence" },
    { src: "images/gallery/family-03.jpg", alt: "Mother and daughter in matching African-print outfits, smiling in the studio" },
    { src: "images/gallery/maternity-02.jpg", alt: "Maternity portrait in a burgundy lace-panel dress, cradling her bump beside a wooden pergola post" },
    { src: "images/gallery/family-05.jpg", alt: "Three smiling siblings in matching Christmas pyjamas holding hands beside a frosted wreath", wide: true },
    { src: "images/gallery/maternity-03.jpg", alt: "Expectant mother holding a tiny pair of white knitted baby booties" },
    { src: "images/gallery/session-03.jpg", alt: "Woman in a pink pleated skirt standing on a rooftop rope swing at sunset", wide: true },
    { src: "images/gallery/family-07.jpg", alt: "Mother and her daughters in matching red Christmas pyjamas playing with a snowman ornament beside a flocked Christmas tree" },
    { src: "images/gallery/family-04.jpg", alt: "Mother in a flowing pink skirt with her two sons on a pink tree swing" },
    { src: "images/gallery/baby-03.jpg", alt: "Smiling baby in a woven basket on a white fur blanket in the studio" },
    { src: "images/gallery/couple-01.jpg", alt: "Couple sharing a kiss under a sunlit tree, him in a black satin outfit with a gold-trimmed sash, her in a silver striped top and lilac tulle skirt", wide: true },
    { src: "images/gallery/session-01.jpg", alt: "Woman in a flowing African-print halter dress and head wrap in the studio" },
    { src: "images/gallery/family-01.jpg", alt: "Family of five dressed in white on the beach" },
    { src: "images/gallery/baby-02.jpg", alt: "Close-up of a wide-eyed baby in a white headband", wide: true },
    { src: "images/gallery/baby-04.jpg", alt: "Six-month milestone: baby in a bow tie and suspenders on a wooden crate above a Half Way to One sign, with a gold one-half cut-out" },
    { src: "images/gallery/baby-05.jpg", alt: "Curly-haired baby in a navy bow tie peeks over the edge of a wooden crate at a six-month milestone session outdoors" },
    { src: "images/gallery/session-04.jpg", alt: "Toddler dressed as a little builder in a yellow safety vest, holding a hard hat and a toy screwdriver" },
    { src: "images/gallery/session-02.jpg", alt: "Toddler in a red Christmas outfit on a leather sofa holding a mini Christmas tree" },
    { src: "images/gallery/family-02.jpg", alt: "Smiling family in white with straw hats by the sea" },
    { src: "images/gallery/family-06.jpg", alt: "Mother with her three children in red and plaid at an outdoor Christmas setup with Merry and Bright pillows", wide: true },
    { src: "images/hero.jpg", alt: "Smiling baby in a white headband sitting in a woven basket among cut logs" },
    { src: "images/gallery/session-05.jpg", alt: "Woman in a gold brocade corset and pleated skirt smiling as she leans on a wooden pergola post" },
    { src: "images/gallery/session-07.jpg", alt: "Black and white fashion portrait of a woman in striped high-waisted trousers and sunglasses holding an umbrella, astride a vintage bicycle in a cut cane field", wide: true },
    { src: "images/gallery/session-06.jpg", alt: "Smiling woman with long curls and pink hair clips leaning on a white picket fence" },
    { src: "images/gallery/portrait-01.jpg", alt: "Girl in a red lace dress wearing a crown of butterflies in the studio" },
    { src: "images/gallery/portrait-05.jpg", alt: "Smiling young woman with twists and flower hair clips resting her chin on her hands outdoors" },
    { src: "images/gallery/session-08.jpg", alt: "Grinning little boy in white sits on garden rocks hugging a big Spider-Man balloon" },
    { src: "images/gallery/session-09.jpg", alt: "Little boy in a blue dinosaur T-shirt sits on wooden steps holding the rail", wide: true },
    { src: "images/gallery/session-10.jpg", alt: "Little boy in a cream linen outfit and maroon sneakers leans against a wooden post on a deck", wide: true }
  ],
  portraits: [
    { src: "images/gallery/portrait-02.jpg", alt: "Professional headshot of a woman in a navy blazer with her chin resting on her hand" },
    { src: "images/gallery/school-01.jpg", alt: "Sixth form graduation portrait holding a diploma tube against a blue backdrop" },
    { src: "images/gallery/product-01.jpg", alt: "Product photo of a pearl necklace with crystal rondelles and a gold toggle clasp laid flat on black velvet", wide: true },
    { src: "images/gallery/portrait-04.jpg", alt: "Professional headshot of a smiling man in a navy suit and orange tie against a white background" },
    { src: "images/gallery/wedding-12.jpg", alt: "Save-the-date photo of a couple in matching red shirts holding SAVE THE DATE signs while their son does a handstand by the sea" },
    { src: "images/gallery/portrait-03.jpg", alt: "Musician in a plum suit and tinted glasses singing and playing an acoustic guitar outdoors", wide: true },
    { src: "images/gallery/product-02.jpg", alt: "Product photo of a multi-strand pearl necklace displayed on a clear acrylic bust against black" },
    { src: "images/gallery/portrait-06.jpg", alt: "Smiling man in glasses and a navy check three-piece suit with an orange tie against a white backdrop" },
    { src: "images/gallery/product-03.jpg", alt: "Product photo of drop earrings with orange and fuchsia crystals on black velvet", wide: true }
  ],
  aerial: [
    { src: "images/gallery/aerial-02.jpg", alt: "Aerial view of a new housing development above a turquoise bay in Westmoreland", wide: true },
    { src: "images/gallery/aerial-03.jpg", alt: "Aerial view of a modern villa with an infinity pool and hot tub", wide: true },
    { src: "images/gallery/aerial-01.jpg", alt: "Aerial view of White House Beach Club homes under construction in the Westmoreland hills", wide: true }
  ],
  id: [
    { src: "images/gallery/id-01.jpg", alt: "Discount card designed and printed for AJ's Tiles & Home Decor, Big Bridge, Westmoreland: blue card reading Get 7% off", wide: true }
  ]
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
