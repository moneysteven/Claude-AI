// Turns an OpenStreetMap road download into compact map data for the try-out
// page: every road with its class and name, simplified to ~5 m accuracy.
//
//   npm run import-roads -- jamaica-roads.json      (file saved from the browser link)
//   npm run import-roads -- westmoreland.json hanover.json ...   (one file per parish)
//   npm run import-roads                            (downloads it; needs overpass-api.de)
//
// Output: reference-data/roads-osm.json = [[class, name, [lng, lat, lng, lat, ...]], ...]
// Data © OpenStreetMap contributors (ODbL) — keep the credit on the map.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT = path.join(__dirname, "..", "reference-data", "roads-osm.json");

// Main roads for the whole island, plus every street in the parishes that use
// the app (Westmoreland for now — add more ISO codes as schools join).
const STREET_PARISHES = ["JM-10"];
const QUERY = `[out:json][timeout:300];
area["ISO3166-1"="JM"][admin_level=2]->.jm;
(${STREET_PARISHES.map((c) => `area["ISO3166-2"="${c}"];`).join("")})->.streets;
(
  way(area.jm)["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"];
  way(area.streets)["highway"~"^(unclassified|residential|living_street)$"];
);
out tags geom qt;`;

const CLASS = {
  motorway: "motorway", motorway_link: "motorway", trunk: "trunk", trunk_link: "trunk",
  primary: "primary", primary_link: "primary", secondary: "secondary", secondary_link: "secondary",
  tertiary: "tertiary", tertiary_link: "tertiary", unclassified: "minor", residential: "minor", living_street: "minor",
};

// Douglas–Peucker line simplification in metres.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const k = 111320 * Math.cos((18.1 * Math.PI) / 180);
  const xy = pts.map(([lng, lat]) => [lng * k, lat * 110574]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = tol;
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function convert(osm) {
  const roads = [];
  for (const el of osm.elements || []) {
    if (el.type !== "way" || !el.geometry || !el.tags) continue;
    const cls = CLASS[el.tags.highway];
    if (!cls) continue;
    const pts = simplify(el.geometry.map((g) => [g.lon, g.lat]), cls === "minor" ? 6 : 4);
    const flat = [];
    for (const [lng, lat] of pts) flat.push(+lng.toFixed(5), +lat.toFixed(5));
    roads.push([cls, el.tags.ref || el.tags.name || "", flat]);
  }
  return roads;
}

// Several parish downloads become one; a road on a parish border is in both
// files, so each OpenStreetMap way is kept once.
function mergeDownloads(list) {
  const seen = new Set(), elements = [];
  for (const osm of list) for (const el of osm.elements || []) {
    const id = `${el.type}/${el.id}`;
    if (!seen.has(id)) { seen.add(id); elements.push(el); }
  }
  return { elements };
}

function main() {
  const files = process.argv.slice(2);
  const osm = files.length
    ? mergeDownloads(files.map((f) => JSON.parse(fs.readFileSync(f, "utf8"))))
    : JSON.parse(execFileSync("curl", ["-sS", "--fail", "-m", "400", "--data-urlencode", `data=${QUERY}`, "https://overpass-api.de/api/interpreter"], { maxBuffer: 512 * 1024 * 1024 }));
  const roads = convert(osm);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(roads));
  const count = {};
  roads.forEach(([c]) => (count[c] = (count[c] || 0) + 1));
  console.log(`Saved ${roads.length} roads (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) to ${OUT}`);
  console.table(count);
}

if (require.main === module) main();
module.exports = { convert, simplify, mergeDownloads, QUERY };
