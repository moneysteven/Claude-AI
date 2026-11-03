// Extracts Jamaica's coastline from Natural Earth (world-atlas 10m) into
// src/data/jamaica.geo.json, used as an always-available base layer under
// the branch map (and as the whole map if tile servers are unreachable).
import { feature } from "topojson-client";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const topo = require("world-atlas/countries-10m.json");
const countries = feature(topo, topo.objects.countries);
const ja = countries.features.find((f) => f.id === "388" || f.properties.name === "Jamaica");
const round = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(4), +c[1].toFixed(4)] : c.map(round));
ja.geometry.coordinates = round(ja.geometry.coordinates);
await fs.mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../src/data/jamaica.geo.json", import.meta.url), JSON.stringify({ type: "Feature", properties: { name: "Jamaica" }, geometry: ja.geometry }));
console.log("Jamaica outline:", ja.geometry.type, JSON.stringify(ja.geometry).length, "bytes");
