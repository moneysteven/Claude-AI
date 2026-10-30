// Turns a bus route given as stops into the real road path between them, like
// a GPS route planner: it builds the road network from an OpenStreetMap
// download and finds the shortest drive from each stop to the next.
//
//   node scripts/route-on-roads.js <overpass-roads.json> <routes.json> <out.json>
//
// routes.json: { "routeId": [[lat, lng], [lat, lng], ...], ... }   (stops in order, school last)
// out.json:    { "routeId": [[lat, lng], ...] }                      (follows the roads)
//
// Uses the raw Overpass download (not the simplified map data), because roads
// only join where they share an exact point.

const fs = require("fs");

const SPEED = { motorway: 80, trunk: 70, primary: 60, secondary: 50, tertiary: 40, unclassified: 30, residential: 25, living_street: 15 };
const k = 111320 * Math.cos((18.1 * Math.PI) / 180);
const dist = (a, b) => Math.hypot((a[1] - b[1]) * k, (a[0] - b[0]) * 110574);
const key = (lat, lng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

function buildGraph(osm) {
  const nodes = new Map(); // key -> { p: [lat, lng], edges: [[key, seconds]] }
  const node = (lat, lng) => {
    const id = key(lat, lng);
    if (!nodes.has(id)) nodes.set(id, { p: [lat, lng], edges: [] });
    return id;
  };
  for (const el of osm.elements || []) {
    if (el.type !== "way" || !el.geometry || !el.tags) continue;
    const kph = SPEED[el.tags.highway.replace(/_link$/, "")];
    if (!kph) continue;
    const oneway = el.tags.oneway === "yes" || /^motorway/.test(el.tags.highway);
    for (let i = 1; i < el.geometry.length; i++) {
      const a = node(el.geometry[i - 1].lat, el.geometry[i - 1].lon), b = node(el.geometry[i].lat, el.geometry[i].lon);
      const secs = dist(nodes.get(a).p, nodes.get(b).p) / (kph / 3.6);
      nodes.get(a).edges.push([b, secs]);
      if (!oneway) nodes.get(b).edges.push([a, secs]);
    }
  }
  return nodes;
}

function nearest(nodes, p) {
  let best = null, bestD = Infinity;
  for (const [id, n] of nodes) { const d = dist(n.p, p); if (d < bestD) { bestD = d; best = id; } }
  return { id: best, metres: bestD };
}

// A* search (straight-line time at 80 km/h never overestimates, so it's exact).
function shortest(nodes, from, to) {
  const goal = nodes.get(to).p, h = (id) => dist(nodes.get(id).p, goal) / (80 / 3.6);
  const g = new Map([[from, 0]]), prev = new Map(), open = [[h(from), from]], done = new Set();
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const [nb, secs] of nodes.get(cur).edges) {
      const t = g.get(cur) + secs;
      if (t < (g.get(nb) ?? Infinity)) { g.set(nb, t); prev.set(nb, cur); open.push([t + h(nb), nb]); }
    }
  }
  if (from !== to && !prev.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path.map((id) => nodes.get(id).p);
}

function routeOnRoads(osm, stops) {
  const nodes = buildGraph(osm);
  const out = [];
  for (let i = 1; i < stops.length; i++) {
    const a = nearest(nodes, stops[i - 1]), b = nearest(nodes, stops[i]);
    const leg = a.id && b.id ? shortest(nodes, a.id, b.id) : null;
    if (!leg) throw new Error(`No road connection between stop ${i} and stop ${i + 1}`);
    out.push(...(out.length ? leg.slice(1) : leg));
  }
  return out.map(([lat, lng]) => [+lat.toFixed(5), +lng.toFixed(5)]);
}

if (require.main === module) {
  const [roadsFile, routesFile, outFile] = process.argv.slice(2);
  if (!outFile) { console.error("Usage: node scripts/route-on-roads.js <overpass-roads.json> <routes.json> <out.json>"); process.exit(1); }
  const osm = JSON.parse(fs.readFileSync(roadsFile, "utf8"));
  const routes = JSON.parse(fs.readFileSync(routesFile, "utf8"));
  const result = {};
  for (const [id, stops] of Object.entries(routes)) {
    result[id] = routeOnRoads(osm, stops);
    console.log(`${id}: ${stops.length} stops -> ${result[id].length} points along the roads`);
  }
  fs.writeFileSync(outFile, JSON.stringify(result));
}

module.exports = { buildGraph, shortest, routeOnRoads };
