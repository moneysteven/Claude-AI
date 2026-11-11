"use strict";
/* =====================================================================
   RentYaad DEMO — vehicle rental marketplace for Jamaica.
   Every host, vehicle, price, booking and review is SAMPLE data.
   Authentication and payments are DEMO implementations (local only).
   ===================================================================== */

/* ---- Rename the app in ONE place: change APP_NAME (the <title> tag is the gallery fallback). ---- */
const CONFIG = {
  APP_NAME: "RentYaad",
  STORAGE_KEY: "rentyaad-demo-v1",
  SESSION_KEY: "rentyaad-session",
  DATA_VERSION: 4,
  FX_DEFAULT: 157,           // J$ per US$1 — editable in Profile and Admin settings
  COMMISSION_DEFAULT: 10,    // % marketplace commission, editable by Admin
  SERVICE_FEE: 1200,         // J$ flat booking fee shown to customers (sample)
  GCT_RATE: 0.15,            // General Consumption Tax shown on totals
  TZ_OFFSET_H: -5,           // America/Jamaica is UTC−5 all year (no daylight saving)
  TZ_LABEL: "Jamaica time",
  PRICE_MAX: 50000,          // top of the price filter, J$/day
  AIRPORT_FEE: 2500,         // default host airport-delivery fee
  HOTEL_FEE: 3500,           // default host hotel-delivery fee
  DEMO_EMAIL: "demo@rentyaad.demo",
  DEMO_PASSWORD: "Demo1234!",
  DEMO_RESET_CODE: "482913",
};

/* All 14 parishes with towns/districts and approximate coordinates (for "Near me"). */
const PARISH_TOWNS = {
  "Kingston": [["Downtown Kingston", 17.971, -76.792], ["Port Royal", 17.937, -76.841], ["Allman Town", 17.986, -76.785], ["Franklin Town", 17.982, -76.775], ["Rae Town", 17.966, -76.781], ["Palisadoes", 17.940, -76.780]],
  "St Andrew": [["New Kingston", 18.007, -76.783], ["Half Way Tree", 18.012, -76.797], ["Constant Spring", 18.050, -76.795], ["Liguanea", 18.023, -76.766], ["Papine", 18.018, -76.743], ["Mona", 18.004, -76.749], ["Stony Hill", 18.072, -76.792], ["Red Hills", 18.052, -76.826], ["Gordon Town", 18.043, -76.711], ["Barbican", 18.031, -76.774]],
  "St Thomas": [["Morant Bay", 17.881, -76.409], ["Yallahs", 17.874, -76.563], ["Port Morant", 17.891, -76.330], ["Seaforth", 17.934, -76.455], ["Golden Grove", 17.869, -76.276], ["Bath", 17.948, -76.351]],
  "Portland": [["Port Antonio", 18.177, -76.450], ["Buff Bay", 18.232, -76.661], ["Hope Bay", 18.199, -76.566], ["Manchioneal", 18.040, -76.276], ["Boston Bay", 18.162, -76.331], ["Long Bay", 18.098, -76.312], ["Fairy Hill", 18.168, -76.370]],
  "St Mary": [["Port Maria", 18.369, -76.890], ["Oracabessa", 18.401, -76.946], ["Annotto Bay", 18.271, -76.766], ["Highgate", 18.271, -76.887], ["Gayle", 18.330, -77.004], ["Richmond", 18.232, -76.882], ["Robins Bay", 18.297, -76.733]],
  "St Ann": [["Ocho Rios", 18.408, -77.103], ["St Ann's Bay", 18.434, -77.201], ["Runaway Bay", 18.459, -77.333], ["Discovery Bay", 18.462, -77.401], ["Brown's Town", 18.393, -77.369], ["Claremont", 18.320, -77.180], ["Moneague", 18.270, -77.120], ["Alexandria", 18.302, -77.352]],
  "Trelawny": [["Falmouth", 18.493, -77.656], ["Duncans", 18.469, -77.532], ["Clark's Town", 18.420, -77.543], ["Albert Town", 18.290, -77.541], ["Wakefield", 18.404, -77.648], ["Rio Bueno", 18.471, -77.452], ["Ulster Spring", 18.318, -77.512]],
  "St James": [["Montego Bay", 18.471, -77.919], ["Rose Hall", 18.511, -77.827], ["Ironshore", 18.500, -77.862], ["Reading", 18.443, -77.948], ["Anchovy", 18.409, -77.937], ["Cambridge", 18.330, -77.858], ["Adelphi", 18.451, -77.801]],
  "Hanover": [["Lucea", 18.451, -78.174], ["Green Island", 18.383, -78.270], ["Hopewell", 18.441, -78.026], ["Sandy Bay", 18.444, -78.083], ["Ramble", 18.367, -78.171]],
  "Westmoreland": [["Savanna-la-Mar", 18.219, -78.133], ["Negril", 18.268, -78.348], ["Little London", 18.252, -78.220], ["Frome", 18.292, -78.152], ["Grange Hill", 18.311, -78.181], ["Bluefields", 18.170, -78.030], ["Whitehouse", 18.082, -77.963], ["Darliston", 18.241, -78.051], ["Bethel Town", 18.290, -77.966]],
  "St Elizabeth": [["Black River", 18.026, -77.848], ["Santa Cruz", 18.056, -77.701], ["Treasure Beach", 17.889, -77.756], ["Junction", 17.929, -77.610], ["Balaclava", 18.172, -77.648], ["Malvern", 17.971, -77.700], ["Lacovia", 18.083, -77.760], ["Middle Quarters", 18.081, -77.800]],
  "Manchester": [["Mandeville", 18.041, -77.507], ["Christiana", 18.180, -77.490], ["Porus", 18.039, -77.410], ["Spaldings", 18.153, -77.456], ["Williamsfield", 18.062, -77.469], ["Mile Gully", 18.122, -77.563]],
  "Clarendon": [["May Pen", 17.965, -77.245], ["Chapelton", 18.084, -77.268], ["Lionel Town", 17.810, -77.237], ["Frankfield", 18.148, -77.367], ["Hayes", 17.870, -77.240], ["Four Paths", 17.972, -77.297], ["Kellits", 18.120, -77.262]],
  "St Catherine": [["Spanish Town", 17.991, -76.957], ["Portmore", 17.950, -76.882], ["Old Harbour", 17.941, -77.108], ["Linstead", 18.137, -77.031], ["Bog Walk", 18.102, -77.006], ["Ewarton", 18.183, -77.085], ["Old Harbour Bay", 17.906, -77.097]],
};
const PARISHES = Object.keys(PARISH_TOWNS);
const TOWN_INDEX = []; for (const p of PARISHES) for (const [n, lat, lng] of PARISH_TOWNS[p]) TOWN_INDEX.push({ parish: p, town: n, lat, lng });
const PARISH_CENTER = Object.fromEntries(PARISHES.map(p => { const t = PARISH_TOWNS[p]; return [p, [t.reduce((a, x) => a + x[1], 0) / t.length, t.reduce((a, x) => a + x[2], 0) / t.length]]; }));
const AIRPORTS = {
  mbj: { id: "mbj", name: "Sangster Int’l Airport (MBJ)", short: "MBJ airport", parish: "St James", town: "Montego Bay", lat: 18.504, lng: -77.913 },
  kin: { id: "kin", name: "Norman Manley Int’l Airport (KIN)", short: "KIN airport", parish: "Kingston", town: "Palisadoes", lat: 17.936, lng: -76.788 },
};
const AREAS = { corporate: { id: "corporate", label: "Kingston & St Andrew", parishes: ["Kingston", "St Andrew"] } };
const POPULAR = [
  { kind: "area", id: "corporate", label: "Kingston" },
  { kind: "town", parish: "St James", town: "Montego Bay", label: "Montego Bay" },
  { kind: "town", parish: "Westmoreland", town: "Negril", label: "Negril" },
  { kind: "town", parish: "St Ann", town: "Ocho Rios", label: "Ocho Rios" },
  { kind: "town", parish: "Manchester", town: "Mandeville", label: "Mandeville" },
  { kind: "town", parish: "Westmoreland", town: "Savanna-la-Mar", label: "Savanna-la-Mar" },
];

const TYPES = [
  { id: "car", name: "Car", plural: "Cars", icon: "car" },
  { id: "suv", name: "SUV", plural: "SUVs", icon: "suv" },
  { id: "van", name: "Van", plural: "Vans", icon: "van" },
  { id: "bus", name: "Bus", plural: "Buses", icon: "bus" },
  { id: "pickup", name: "Pickup", plural: "Pickups", icon: "pickup" },
  { id: "bike", name: "Bike", plural: "Bikes", icon: "bike" },
  { id: "scooter", name: "Scooter", plural: "Scooters", icon: "scooter" },
];
const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));
const TWO_WHEEL = new Set(["bike", "scooter"]);

const FEATURES = [
  { id: "ac", name: "A/C", icon: "snow" },
  { id: "bluetooth", name: "Bluetooth audio", icon: "bluetooth" },
  { id: "backup_camera", name: "Backup camera", icon: "camera" },
  { id: "gps", name: "GPS navigation", icon: "nav" },
  { id: "carplay", name: "Apple CarPlay / Android Auto", icon: "phoneCar" },
  { id: "usb", name: "USB charging", icon: "usb" },
  { id: "child_seat", name: "Child seat available", icon: "childSeat" },
  { id: "keyless", name: "Keyless entry", icon: "key" },
  { id: "cruise", name: "Cruise control", icon: "gauge" },
  { id: "sunroof", name: "Sunroof", icon: "sunroof" },
  { id: "4x4", name: "4x4", icon: "mountain" },
  { id: "driver", name: "Driver included", icon: "steer" },
  { id: "helmet", name: "Helmets included", icon: "helmet" },
];
const FEAT = Object.fromEntries(FEATURES.map(f => [f.id, f]));
/* search filters: two are features, two are pick-up options */
const FILTER_FEATURES = [
  { id: "ac", name: "A/C", icon: "snow" },
  { id: "driver", name: "Driver included", icon: "steer" },
  { id: "airport", name: "Airport delivery", icon: "plane" },
  { id: "hotel", name: "Hotel delivery", icon: "hotel" },
];
const RULES = [
  { id: "no_smoking", name: "No smoking" },
  { id: "no_pets", name: "No pets" },
  { id: "no_offroad", name: "No off-road driving" },
  { id: "no_food", name: "No eating inside" },
  { id: "clean", name: "Return it reasonably clean" },
  { id: "no_beach", name: "No riding on the beach" },
  { id: "helmet", name: "Helmets must be worn" },
];
const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));

const PAYMENT_METHODS = {
  app: { id: "app", name: "Pay in app", sub: "Card · demo payment screen", icon: "card" },
  cash: { id: "cash", name: "Cash on pick-up", sub: "Pay the host when you collect", icon: "cash" },
  bank: { id: "bank", name: "Bank transfer", sub: "Transfer to the host before pick-up", icon: "bank" },
};
const PAYOUT_OPTIONS = [{ v: "bank", label: "Bank transfer" }, { v: "wallet", label: "Mobile wallet" }, { v: "later", label: "Decide later" }];

const INSURANCE = [
  { id: "basic", name: "Basic cover", perDay: 0, excessPct: 100, desc: "Third-party liability is included. You’re responsible for damage up to the full deposit." },
  { id: "standard", name: "Standard CDW", perDay: 1500, excessPct: 50, desc: "Collision damage waiver. Your damage excess drops to 50% of the deposit." },
  { id: "premium", name: "Premium cover", perDay: 2800, excessPct: 0, desc: "Zero excess for collision and theft. Tyres and glass included." },
];
const TYPE_INS_MULT = { car: 1, suv: 1.4, van: 1.4, pickup: 1.3, bus: 2, bike: 0.5, scooter: 0.4 };

const EXTRAS = {
  childSeat: { name: "Child seat", perDay: 800 },
  extraDriver: { name: "Extra driver", perDay: 1000 },
  chauffeur: { name: "Driver / chauffeur", perDay: 6500 },
};

const POLICIES = {
  flexible: { id: "flexible", name: "Flexible", short: "Free cancellation until 24 hours before pick-up", desc: "Cancel for free up to 24 hours before pick-up. After that, one day’s rental is charged. Date changes are free until 24 hours before pick-up." },
  moderate: { id: "moderate", name: "Moderate", short: "Free cancellation until 5 days before pick-up", desc: "Cancel for free up to 5 days before pick-up. After that, 50% of the rental is charged. Date changes are free until 24 hours before pick-up." },
  strict: { id: "strict", name: "Strict", short: "50% refund until 7 days before pick-up", desc: "Cancel up to 7 days before pick-up and 50% of the rental is charged. After that, the full rental is charged. Date changes cost J$2,000 and close 24 hours before pick-up." },
};
const FUEL_POLICIES = {
  "full-to-full": { name: "Full to full", desc: "Pick up with a full tank and return it full. Missing fuel is charged at J$1,200 per ⅛ tank." },
  "same-to-same": { name: "Same to same", desc: "Return with the same fuel level as at pick-up. Missing fuel is charged at J$1,200 per ⅛ tank." },
};
const FUEL_PER_EIGHTH = 1200;
const LATE_GRACE_MIN = 59;
const STRICT_CHANGE_FEE = 2000;
const DEFAULT_SEASONS = [
  { name: "Winter peak", from: "12-15", to: "04-15", pct: 15 },
  { name: "Christmas & New Year", from: "12-20", to: "01-03", pct: 25 },
];

const STATUS = {
  requested: { label: "Awaiting host", host: "New request", tone: "warn", icon: "clock" },
  confirmed: { label: "Confirmed", host: "Confirmed", tone: "info", icon: "check" },
  active: { label: "On trip", host: "On trip", tone: "pos", icon: "key" },
  completed: { label: "Completed", host: "Completed", tone: "grey", icon: "check" },
  cancelled: { label: "Cancelled", host: "Cancelled", tone: "neg", icon: "x" },
  declined: { label: "Declined", host: "Declined", tone: "neg", icon: "x" },
  expired: { label: "Expired", host: "Expired", tone: "grey", icon: "clock" },
};

/* Automotive paint colours (names are shown to hosts) */
const COLORS = [
  { n: "Pearl white", c: "#E9E8E4" }, { n: "Silver", c: "#B4B8BD" }, { n: "Graphite", c: "#53575D" }, { n: "Black", c: "#1A1B1D" },
  { n: "Midnight blue", c: "#1E2940" }, { n: "Steel blue", c: "#4C6377" }, { n: "Deep red", c: "#6B1E22" }, { n: "Forest green", c: "#2C4739" },
  { n: "Champagne", c: "#C6B595" }, { n: "Bronze", c: "#77583B" }, { n: "Teal", c: "#2A5A60" }, { n: "Sand", c: "#B3A086" },
];
const colorName = c => (COLORS.find(x => x.c.toLowerCase() === String(c).toLowerCase()) || {}).n || "Custom";

/* Thin line icons, 24×24, stroked with currentColor */
const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  suitcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  chat: '<path d="M20.5 11.8a8.3 8.3 0 0 1-12.2 7.3L3.5 20.3l1.3-4.4a8.3 8.3 0 1 1 15.7-4.1z"/>',
  heart: '<path d="M12 20s-7.2-4.5-9.1-9.1A4.9 4.9 0 0 1 12 7.6a4.9 4.9 0 0 1 9.1 3.3C19.2 15.5 12 20 12 20z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>',
  gauge: '<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l3.6-5.2"/><path d="M6.2 12.6l1 .6M17.8 12.6l-1 .6M12 8.4v1.2"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  car: '<path d="M5 17H4a1 1 0 0 1-1-1v-3l2.1-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.9 1.3L21 13v3a1 1 0 0 1-1 1h-1M9.5 17h5"/><circle cx="7.3" cy="17" r="2.1"/><circle cx="16.7" cy="17" r="2.1"/><path d="M3.5 12.5h17"/>',
  suv: '<path d="M5 17H4a1 1 0 0 1-1-1v-4l1.6-5A1.5 1.5 0 0 1 6 6h11a1.5 1.5 0 0 1 1.4.9L21 12v4a1 1 0 0 1-1 1h-1M9.4 17h5.2"/><circle cx="7.2" cy="17" r="2.1"/><circle cx="16.8" cy="17" r="2.1"/><path d="M3.4 11.5h17.2M12 6v5.5"/>',
  van: '<path d="M5 17H4a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h10.5l5.5 5v5a1 1 0 0 1-1 1h-1M9.4 17h5.2"/><circle cx="7.2" cy="17" r="2.1"/><circle cx="16.8" cy="17" r="2.1"/><path d="M3 11h18M10 6v5"/>',
  bus: '<rect x="4" y="3.5" width="16" height="14" rx="2.5"/><path d="M4 11h16M4 7.5h16"/><circle cx="8" cy="20" r="1.4"/><circle cx="16" cy="20" r="1.4"/><path d="M7.5 14.5h1M15.5 14.5h1"/>',
  pickup: '<path d="M4.6 17H3.5a1 1 0 0 1-1-1v-4h8V7h5.2l3 5H21a.5.5 0 0 1 .5.5V16a1 1 0 0 1-1 1h-1M9 17h6"/><circle cx="6.8" cy="17" r="2.1"/><circle cx="17.2" cy="17" r="2.1"/>',
  bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16l4-6h5l4 6M9.5 10l-1-3H6M14.5 10l1.6-4h2.4"/>',
  scooter: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7M16.5 15l-2-10h2.5M6 14.5V13h5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  store: '<path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9M3 10l2-6h14l2 6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M8.6 12l2.4 2.4 4.4-4.8"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ticks: '<path d="M2.5 12.5l4 4L15 8"/><path d="M11 16l1 .6L21 8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sparkles: '<path d="M11 3l1.9 4.9L17.8 9.8l-4.9 1.9L11 16.6l-1.9-4.9L4.2 9.8l4.9-1.9z"/><path d="M18.5 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.6L12 6.2l2.5-1.6M9.5 19.4L12 17.8l2.5 1.6"/>',
  steer: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M3.8 10.4l6.1 1.1M20.2 10.4l-6.1 1.1M12 14.2v6.3"/>',
  plane: '<path d="M21 15.5v-2l-7.5-4.7V3.9a1.5 1.5 0 0 0-3 0v4.9L3 13.5v2l7.5-2.3v4.3l-2 1.5V21l3.5-1 3.5 1v-2l-2-1.5v-4.3z"/>',
  hotel: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10.5 21v-3h3v3"/>',
  seat: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M21 19.5a6 6 0 0 0-3.8-5.6"/>',
  gear: '<circle cx="6" cy="5.5" r="1.8"/><circle cx="12" cy="5.5" r="1.8"/><circle cx="18" cy="5.5" r="1.8"/><circle cx="6" cy="18.5" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/><path d="M6 7.3v9.4M12 7.3v9.4M18 7.3V12H6"/>',
  fuel: '<path d="M5 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15M3.5 20h12M5 10h9"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
  road: '<path d="M8 3L4 21M16 3l4 18M12 4v2.5M12 10v3M12 16.5V20"/>',
  wrench: '<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>',
  flag: '<path d="M5 21V4M5 4h11.5l-2 4 2 4H5"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6" width="3" height="11.5" rx="1"/><rect x="15.5" y="13" width="3" height="4.5" rx="1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
  alert: '<path d="M10.3 4.5L2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17.3v.4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  mountain: '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
  helmet: '<path d="M4 16a8 8 0 0 1 16 0v2H4z"/><path d="M12 8v5h8"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  dollar: '<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3.2c0 4.3 9 2.3 9 6.8 0 1.9-2 3.2-4.5 3.2s-4.5-1.3-4.5-3"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  whatsapp: '<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.1-4.2A8.5 8.5 0 1 1 20.5 12z"/><path d="M9 8.6c0 3.4 3 6.4 6.4 6.4l1-1.5-2-1-1 .8a4.5 4.5 0 0 1-2.3-2.3l.8-1-1-2z"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H8M8 21l-4-4 4-4M4 17h12"/>',
  dispute: '<path d="M20.5 11.8a8.3 8.3 0 0 1-12.2 7.3L3.5 20.3l1.3-4.4a8.3 8.3 0 1 1 15.7-4.1z"/><path d="M12 8v4.5M12 15.6v.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 7.6C3.9 9.3 2.5 12 2.5 12S6 18 12 18a9 9 0 0 0 3.4-.7M9.9 10a3 3 0 0 0 4.1 4.1"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  bank: '<path d="M3 9.5L12 4l9 5.5M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8M3 20h18"/>',
  wallet: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11v3"/><rect x="3.5" y="7.5" width="17" height="11.5" rx="2.5"/><path d="M16 13.2h.01"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>',
  fingerprint: '<path d="M7.5 5.5A7.5 7.5 0 0 1 19.5 11v1.5M4.5 9A7.5 7.5 0 0 0 4.5 14M12 11v2.5a9 9 0 0 1-2 5.5M8.5 9.8A3.5 3.5 0 0 1 15.5 11v2.5a12 12 0 0 1-1 4.5M8.5 13a10 10 0 0 1-1.6 5M18.9 15.5a15 15 0 0 1-.9 3"/>',
  grip: '<circle cx="9" cy="6.5" r=".9"/><circle cx="15" cy="6.5" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="17.5" r=".9"/><circle cx="15" cy="17.5" r=".9"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  nav: '<path d="M20 4L3.5 11l7 2.5L13 20.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  idcard: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16a3 3 0 0 1 6 0M14 10h4.5M14 13.5h3"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  bluetooth: '<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9"/>',
  usb: '<path d="M12 3v13"/><circle cx="12" cy="18.5" r="2.2"/><path d="M12 12.5l-4-2.2V8M12 10l4-2.2V6"/><rect x="6.8" y="5.8" width="2.4" height="2.4" rx=".4"/><circle cx="16" cy="5" r="1.2"/>',
  sunroof: '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8" y="7.5" width="8" height="5" rx="1"/>',
  phoneCar: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  childSeat: '<path d="M9 4h4a3 3 0 0 1 3 3v6H9z"/><path d="M9 13l-1.2 7M16 13l1.5 7M6.5 20h12"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M3 20.5a7 7 0 0 1 12.5-4.3M18 14v6M15 17h6"/>',
  ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/>',
};
