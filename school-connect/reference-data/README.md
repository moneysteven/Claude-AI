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
