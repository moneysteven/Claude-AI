// Placeholder catalog. Prices and specs are samples — replace with Eclipse's real inventory.
const CATEGORIES = {
  machines: { name: "Gaming Machines", blurb: "Skill-game cabinets and terminals built for floor performance and uptime." },
  parts: { name: "Machine Parts", blurb: "Genuine and compatible components to keep every unit earning." },
  accessories: { name: "Accessories", blurb: "Everything else for outfitting and protecting your floor." }
};
const PRODUCTS = [
  { id: "m1", cat: "machines", art: "cabinet", name: "Eclipse Vault 43\" Upright", price: 5890, tag: "Flagship", desc: "Full-size upright cabinet with a 43\" curved HD display, LED marquee and lockable cash vault.", specs: ["43\" curved HD touchscreen", "Lockable steel cash vault", "Multi-game library, update-ready", "Ships assembled and ready to run"] },
  { id: "m2", cat: "machines", art: "dual", name: "Eclipse Nova Dual-Screen", price: 4650, tag: "Popular", desc: "Dual 27\" screens with an animated top box. Built for high-traffic floors.", specs: ["2 × 27\" displays", "Illuminated button deck", "Bill acceptor included"] },
  { id: "m3", cat: "machines", art: "slant", name: "Eclipse Apex Slant-Top", price: 3950, desc: "Classic slant-top profile with a compact footprint and a bright 32\" display.", specs: ["32\" HD display", "Compact 24\" wide footprint", "Quiet cooling system"] },
  { id: "m4", cat: "machines", art: "counter", name: "Eclipse Orbit Countertop", price: 1890, tag: "New", desc: "A compact countertop terminal for bars, lounges and small venues.", specs: ["22\" touchscreen", "Fits any counter", "Printer-ready"] },
  { id: "p1", cat: "parts", art: "screen", name: "22\" Touchscreen Panel", price: 289, desc: "Replacement capacitive touch display, plug-and-play for Orbit and Apex units.", specs: ["Capacitive multi-touch", "Anti-glare glass"] },
  { id: "p2", cat: "parts", art: "acceptor", name: "Bill Acceptor Module", price: 215, desc: "High-accuracy bill validator with a lockable stacker.", specs: ["Multi-currency firmware", "600-note stacker", "Drop-in bezel"] },
  { id: "p3", cat: "parts", art: "board", name: "Main Control Board", price: 420, desc: "Replacement mainboard preloaded with the latest Eclipse firmware.", specs: ["Fits Vault, Nova & Apex", "Tested before shipping"] },
  { id: "p4", cat: "parts", art: "buttons", name: "Illuminated Button Panel", price: 98, desc: "Full LED button deck with wiring harness.", specs: ["Micro-switch buttons", "Colour-matched LEDs", "Tool-free fitment"] },
  { id: "p5", cat: "parts", art: "printer", name: "Thermal Ticket Printer", price: 175, desc: "Fast, quiet thermal printer for ticket-out machines.", specs: ["Jam-resistant feeder", "Auto-cutter", "USB/serial"] },
  { id: "p6", cat: "parts", art: "power", name: "Power Supply Unit", price: 76, desc: "Industrial 350W PSU with surge protection.", specs: ["Universal input", "Surge protected", "Fan-cooled"] },
  { id: "a1", cat: "accessories", art: "lamp", name: "LED Marquee Lighting Kit", price: 120, desc: "Programmable RGB lighting that makes any cabinet stand out.", specs: ["16M colours", "Remote controlled", "Easy peel-and-stick"] },
  { id: "a3", cat: "accessories", art: "cover", name: "Cabinet Protection Cover", price: 64, desc: "Padded transit cover that protects cabinets during moves and storage.", specs: ["Water-resistant", "Fits upright models", "Machine washable"] },
  { id: "a4", cat: "accessories", art: "lock", name: "Security Lock & Key Set", price: 45, desc: "High-security cylinder locks for doors and cash vaults.", specs: ["Keyed-alike option", "Pick-resistant", "Set of 2 keys"] }
];
