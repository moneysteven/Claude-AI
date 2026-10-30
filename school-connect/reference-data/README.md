# Reference data

- `jamaica-map.json` — Jamaica's coastline (Natural Earth 1:10m, public domain,
  via the `world-atlas` npm package) and simplified borders for the 14 parishes
  (from the `@geo-insight/data` npm package, MIT). Coordinates are `[lng, lat]`;
  parishes are keyed by ISO 3166-2 code (`JM-01` Kingston … `JM-14` St. Catherine).
- `schools-westmoreland-moe.json` — Westmoreland high schools as listed in the
  Ministry of Education directory (name, type, address, phone, email). The
  `lat`/`lng` values are the town centre (approximate) until exact locations are
  imported with `npm run import-schools`. Copy entries into `data/schools-extra.json`
  to merge them into the imported list.
- `roads-natural-earth.json` — Jamaica's main highways (A1, A3, A4, T1) from
  Natural Earth 1:10m roads (public domain). Generalised: accurate at island
  scale only, so the map hides them when zoomed in.
- `roads-osm.json` (made by `npm run import-roads`) — every road from
  OpenStreetMap (© OpenStreetMap contributors, ODbL), simplified to ~5 m.
  Currently Kingston, St. Andrew and Westmoreland (9,372 roads).
- `osm-roads/<parish>.json` — the raw OpenStreetMap downloads, one per parish
  (from the per-parish Overpass Turbo links). Kept because bus routing needs the
  full road network: `node scripts/route-on-roads.js osm-roads/westmoreland.json,osm-roads/hanover.json routes.json out.json`.
  Rebuild the map data with `npm run import-roads -- reference-data/osm-roads/*.json`.
- `schools-osm.json` — every school mapped in Jamaica on OpenStreetMap
  (© OpenStreetMap contributors, ODbL), sorted into parishes, with exact
  coordinates; non-schools (university rooms, offices) and duplicates removed.
  Made with `npm run import-schools -- <export.json>`.
- `demo-routes-kingston-st-andrew.json` — the try-out page's Kingston and St. Andrew demo bus routes:
  stops (points on real streets), the school each bus serves, and the path along
  the roads, worked out with `scripts/route-on-roads.js` from `osm-roads/kingston.json` and `osm-roads/st-andrew.json`.
  Buses, drivers and families on the try-out page are made up.
