// Downloads every school mapped in Jamaica from OpenStreetMap (name + exact
// coordinates), sorted into the 14 parishes, and saves data/schools.json.
//
//   npm run import-schools
//
// Needs internet access to overpass-api.de (or a file saved from it — see main()). Data © OpenStreetMap
// contributors (ODbL) — keep the attribution wherever the list is shown.
//
// OpenStreetMap is volunteer-mapped, so a few schools may be missing or
// unnamed. The Ministry of Education's school list is the official source;
// add or correct schools in data/schools-extra.json and they are merged in.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT = path.join(__dirname, "..", "data", "schools.json");
const EXTRA = path.join(__dirname, "..", "data", "schools-extra.json");

// ISO 3166-2 codes for Jamaica's parishes → our 3-letter parish codes.
const PARISHES = {
  "JM-01": ["KGN", "Kingston"], "JM-02": ["STA", "St. Andrew"], "JM-03": ["STT", "St. Thomas"],
  "JM-04": ["POR", "Portland"], "JM-05": ["STM", "St. Mary"], "JM-06": ["STN", "St. Ann"],
  "JM-07": ["TRL", "Trelawny"], "JM-08": ["STJ", "St. James"], "JM-09": ["HAN", "Hanover"],
  "JM-10": ["WML", "Westmoreland"], "JM-11": ["STE", "St. Elizabeth"], "JM-12": ["MAN", "Manchester"],
  "JM-13": ["CLA", "Clarendon"], "JM-14": ["STC", "St. Catherine"],
};

// For each parish: print the parish, then every school inside it.
const QUERY = `[out:json][timeout:240];
area["ISO3166-1"="JM"][admin_level=2]->.jm;
rel(area.jm)["boundary"="administrative"]["ISO3166-2"~"^JM-"];
map_to_area->.parishes;
foreach.parishes->.p(
  .p out tags;
  (node(area.p)["amenity"="school"]; way(area.p)["amenity"="school"]; rel(area.p)["amenity"="school"];);
  out center tags;
);`;

// Grades offered, guessed from the school's name (the school can correct it).
function schoolType(name, tags) {
  const n = name.toLowerCase();
  if (/\b(basic|infant|early childhood|kindergarten|nursery)\b/.test(n)) return "early";
  if (/\ball[- ]age\b/.test(n)) return "all-age";
  if (/\b(primary|prep|preparatory|junior)\b/.test(n)) return "primary";
  if (/\b(high|secondary|college|technical|academy|comprehensive)\b/.test(n)) return "high";
  if (tags["isced:level"]) return /2|3/.test(tags["isced:level"]) ? "high" : "primary";
  return "unknown";
}

function parse(osm) {
  const schools = [];
  const seen = new Set();
  let parish = null;
  for (const el of osm.elements) {
    if (el.type === "area") {
      parish = PARISHES[el.tags && el.tags["ISO3166-2"]] || null;
      continue;
    }
    const name = el.tags && (el.tags.name || el.tags["name:en"]);
    const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
    const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
    if (!parish || !name || lat === undefined) continue;
    const key = `${parish[0]}|${name.toLowerCase()}`;
    if (seen.has(key)) continue; // same school mapped twice (point + outline)
    seen.add(key);
    schools.push({
      osm: `${el.type}/${el.id}`,
      name: name.trim(),
      parish: parish[0],
      parishName: parish[1],
      type: schoolType(name, el.tags),
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
  }
  return schools;
}

function finalize(schools) {
  if (fs.existsSync(EXTRA)) {
    for (const extra of JSON.parse(fs.readFileSync(EXTRA, "utf8"))) {
      const i = schools.findIndex((s) => s.parish === extra.parish && s.name.toLowerCase() === extra.name.toLowerCase());
      if (i >= 0) schools[i] = { ...schools[i], ...extra };
      else schools.push(extra);
    }
  }
  schools.sort((a, b) => a.parish.localeCompare(b.parish) || a.name.localeCompare(b.name));
  // A stable school number within each parish, used in student ID numbers.
  const counters = {};
  for (const s of schools) s.num = counters[s.parish] = (counters[s.parish] || 0) + 1;
  return schools;
}

// Usage:
//   npm run import-schools                      download now (needs internet access to overpass-api.de)
//   npm run import-schools -- jamaica-schools.json   use a file already downloaded in a browser
function main() {
  const file = process.argv[2];
  let raw;
  if (file) {
    console.log(`Reading ${file}…`);
    raw = fs.readFileSync(file, "utf8");
  } else {
    console.log("Downloading Jamaican schools from OpenStreetMap… (can take a minute)");
    raw = execFileSync("curl", ["-sS", "--fail", "-m", "300", "--data-urlencode", `data=${QUERY}`, "https://overpass-api.de/api/interpreter"], { maxBuffer: 64 * 1024 * 1024 });
  }
  const schools = finalize(parse(JSON.parse(raw)));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL)", downloaded: new Date().toISOString(), schools }, null, 1));
  const byParish = {};
  schools.forEach((s) => (byParish[s.parishName] = (byParish[s.parishName] || 0) + 1));
  console.log(`Saved ${schools.length} schools to ${OUT}`);
  console.table(byParish);
}

if (require.main === module) main();
module.exports = { parse, finalize, schoolType };
