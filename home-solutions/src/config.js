// Single source of truth for every business fact on the site (BRIEF §3).
// Never hard-code business facts anywhere else — import BUSINESS instead.
// Values of "TBC" render as "Price on request" / "Coming soon" / hidden.

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
    { id:"savlamar", name:"Savanna-la-Mar", address:"Barracks Road, Savanna-la-Mar, Westmoreland", phones:["+18769559105"], fax:"876-918-2358", lat:18.219, lng:-78.133, approx:true },
    { id:"mobay", name:"Montego Bay", address:"Fairview Shopping Centre, Bogue, Montego Bay, St. James", phones:["+18769798555"], fax:"876-979-8366", lat:18.4555, lng:-77.936, approx:true },
    { id:"lucea", name:"Lucea", address:"Millers Drive, Lucea, Hanover", phones:["+18769563107"], lat:18.451, lng:-78.173, approx:true },
    { id:"greenisland", name:"Green Island", address:"Main Street, Green Island, Hanover", phones:["+18769569089"], lat:18.379, lng:-78.27, approx:true },
    { id:"falmouth", name:"Falmouth", address:"81 Market Street, Falmouth, Trelawny", phones:["+18766173008"], lat:18.493, lng:-77.656, approx:true },
    { id:"ochorios", name:"Ocho Rios", address:"White River, Ocho Rios, St. Ann", phones:["+18768831973"], lat:18.41, lng:-77.06, approx:true },
    { id:"mandeville", name:"Mandeville", address:"31 Ward Avenue, Mandeville, Manchester", phones:["+18769629081"], lat:18.041, lng:-77.507, approx:true },
    { id:"santacruz", name:"Santa Cruz", address:"House of Style Plaza, Santa Cruz, St. Elizabeth", phones:["+18769663245"], lat:18.054, lng:-77.699, approx:true }
  ],
  // Only the Negril lat/lng is known. Nominatim was unreachable from the build machine, so the other pins are
  // town-level positions (approx:true). TODO(business): confirm exact branch locations (or share Google Maps pins).
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
