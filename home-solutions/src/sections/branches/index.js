// Section 10 Branch finder behaviour (BRIEF §4.10, §6.8):
//  - open-now badges per card (America/Jamaica), refreshed every minute
//  - Leaflet + its CSS + the Jamaica outline load only when the section nears the viewport
//  - card / "Show on map" / 'branches:focus' {detail:{id}} -> highlight + flyTo the pin
//  - "Use my location": Haversine sort (Flip reorder) with km chips; denial handled
import { openStatus } from "../../lib/hours.js";
import { esc, telHref, phoneDisplay } from "../../lib/format.js";
import { directionsUrl, haversineKm } from "./util.js";

const TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const PIN_SVG = `<svg viewBox="0 0 36 46" aria-hidden="true" focusable="false"><path d="M18 44.5S33 31.3 33 18.5a15 15 0 0 0-30 0C3 31.3 18 44.5 18 44.5Z" fill="#26A8E0" stroke="#fff" stroke-width="2"/><path d="M10.5 19.5 18 15l7.5 4.5V26h-15Z" fill="#fff"/><rect x="16.2" y="21.2" width="3.6" height="4.8" fill="#26A8E0"/></svg>`;

const kmText = (km) => `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
const hasXY = (b) => typeof b.lat === "number" && typeof b.lng === "number";

export default function init(ctx) {
  const root = document.getElementById("branches");
  if (!root) return;
  const { B, Flip, reduced, EASE, getLenis, finePointer } = ctx;
  const list = root.querySelector("[data-br-list]");
  const mapWrap = root.querySelector("[data-br-map-wrap]");
  const mapEl = root.querySelector("[data-br-map]");
  const msg = root.querySelector("[data-br-msg]");
  const tools = root.querySelector("[data-br-tools]");
  const locate = root.querySelector("[data-br-locate]");
  const cards = new Map([...list.querySelectorAll("[data-br-card]")].map((c) => [c.dataset.brCard, c]));
  const byId = (id) => B.branches.find((b) => b.id === id);

  // ---- open-now badges (client-side only; markup ships them hidden) ----
  // TODO(business): one set of hours for all branches until per-branch hours are confirmed (b.hours overrides).
  function tick() {
    for (const [id, card] of cards) {
      const el = card.querySelector("[data-br-status]");
      const s = openStatus(byId(id)?.hours || B.hours);
      el.textContent = s.label;
      el.classList.toggle("br-status--open", s.open);
      el.hidden = false;
    }
  }
  tick();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000) + 200);

  root.querySelectorAll("[data-br-show]").forEach((b) => { b.hidden = false; });

  // ---- map (lazy) ----
  let L = null, map = null, loading = null, meMarker = null, me = null, active = null;
  const markers = new Map();

  const popupHtml = (b) =>
    `<p class="br-pop__name">${esc(b.name)}</p><p>${esc(b.address)}</p>` +
    (b.approx ? `<span class="br-pop__approx">Approximate location</span>` : "") +
    `<p class="br-pop__links">${b.phones.map((p) => `<a href="${telHref(p)}" aria-label="Call ${esc(b.name)}, ${phoneDisplay(p)}">${phoneDisplay(p)}</a>`).join("")}` +
    `<a href="${esc(directionsUrl(b))}" target="_blank" rel="noopener">Directions</a></p>`;

  function build(geo) {
    map = L.map(mapEl, {
      scrollWheelZoom: false, // page wheel stays with Lenis
      dragging: finePointer || !L.Browser.mobile, // one-finger swipes keep scrolling the page on phones
      zoomSnap: 0.25, minZoom: 7,
      maxBounds: [[16.8, -79.6], [19.6, -75.2]], maxBoundsViscosity: 0.8,
      fadeAnimation: !reduced, zoomAnimation: !reduced, markerZoomAnimation: !reduced,
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    // Coastline under the tiles: the island still reads if the tile server is blocked.
    map.createPane("br-land").style.zIndex = 150;
    L.geoJSON(geo, { pane: "br-land", interactive: false, style: { color: "#26A8E0", weight: 1.5, opacity: 0.85, fillColor: "#F7F9FB", fillOpacity: 1 } }).addTo(map);
    L.tileLayer(TILES, { subdomains: "abcd", maxZoom: 19, attribution: ATTR }).addTo(map);

    const pts = [];
    for (const b of B.branches) {
      if (!hasXY(b)) continue;
      const icon = L.divIcon({
        className: "br-pin" + (b.id === active ? " is-active" : ""),
        html: `<span class="br-pin__body">${PIN_SVG}</span>${b.approx ? '<span class="br-pin__ring"></span>' : ""}`,
        iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -42],
      });
      const m = L.marker([b.lat, b.lng], { icon, title: b.name, keyboard: true, riseOnHover: true }).addTo(map);
      m.bindPopup(popupHtml(b), { maxWidth: 260 });
      m.on("click", () => select(b.id, { fly: false }));
      m.getElement()?.setAttribute("aria-label", `${b.name}${b.approx ? ", approximate location" : ""}. Show details`);
      markers.set(b.id, m);
      pts.push([b.lat, b.lng]);
    }
    if (pts.length) map.fitBounds(pts, { padding: [36, 36] });
    else map.setView([18.15, -77.3], 8);
    if (me) addMe();
    if ("ResizeObserver" in window) new ResizeObserver(() => map.invalidateSize()).observe(mapEl);
  }

  function loadMap() {
    if (!loading) {
      loading = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css"), import("../../data/jamaica.geo.json")])
        .then(([mod, , geo]) => { L = mod.default ?? mod; build(geo.default ?? geo); })
        .catch((err) => {
          console.warn("[branches] map unavailable", err);
          mapWrap.hidden = true; // the list below still has everything
        });
    }
    return loading;
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadMap(); }
    }, { rootMargin: "600px 0px" });
    io.observe(root);
  } else loadMap();

  // ---- selection ----
  function revealMap() {
    if (matchMedia("(min-width: 1024px)").matches || mapWrap.hidden) return;
    const r = mapWrap.getBoundingClientRect();
    if (r.top >= 56 && r.bottom <= innerHeight) return;
    const lenis = getLenis?.();
    if (lenis) lenis.scrollTo(mapWrap, { offset: -80, duration: 1 });
    else mapWrap.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function select(id, { fly = true, reveal = false } = {}) {
    const b = byId(id);
    if (!b) return;
    active = id;
    for (const [cid, card] of cards) {
      const on = cid === id;
      card.classList.toggle("is-active", on);
      card.querySelector("[data-br-show]")?.setAttribute("aria-pressed", String(on));
    }
    for (const [mid, m] of markers) m.getElement()?.classList.toggle("is-active", mid === id);
    if (reveal) revealMap();
    if (!map) { loadMap().then(() => { if (map && active === id) select(id, { fly }); }); return; }
    const m = markers.get(id);
    if (!m) return;
    if (fly && hasXY(b)) {
      const z = b.approx ? 12 : 14;
      if (reduced) { map.setView([b.lat, b.lng], z, { animate: false }); m.openPopup(); }
      else { map.closePopup(); map.once("moveend", () => { if (active === id) m.openPopup(); }); map.flyTo([b.lat, b.lng], z, { duration: 1.2 }); }
    } else m.openPopup();
  }

  list.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // tel / directions links keep their default
    const card = e.target.closest("[data-br-card]");
    if (!card || (!e.target.closest("button") && String(getSelection?.() || ""))) return;
    select(card.dataset.brCard, { reveal: true });
  });
  window.addEventListener("branches:focus", (e) => { if (e.detail?.id) select(e.detail.id); });

  // ---- use my location ----
  function addMe() {
    if (!map || !me) return;
    if (meMarker) meMarker.setLatLng(me);
    else meMarker = L.marker(me, { icon: L.divIcon({ className: "", html: '<span class="br-me"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: false, title: "Your location" }).addTo(map);
  }

  if ("geolocation" in navigator && tools && locate) {
    tools.hidden = false;
    locate.addEventListener("click", () => {
      locate.setAttribute("aria-busy", "true");
      locate.disabled = true;
      msg.textContent = "Finding your location…";
      const done = () => { locate.removeAttribute("aria-busy"); locate.disabled = false; };
      navigator.geolocation.getCurrentPosition((pos) => {
        done();
        me = [pos.coords.latitude, pos.coords.longitude];
        const ranked = B.branches.filter(hasXY)
          .map((b) => ({ b, km: haversineKm(me[0], me[1], b.lat, b.lng) }))
          .sort((x, y) => x.km - y.km);
        const all = [...cards.values()];
        const state = !reduced && Flip ? Flip.getState(all) : null;
        for (const { b, km } of ranked) {
          const card = cards.get(b.id);
          const chip = card.querySelector("[data-br-dist]");
          chip.textContent = `${kmText(km)} away`;
          chip.hidden = false;
          list.appendChild(card);
        }
        if (state) Flip.from(state, { duration: 0.7, ease: EASE.out, stagger: 0.03 });
        const near = ranked[0];
        if (!near) return;
        msg.textContent = `Sorted by straight-line distance. Nearest branch: ${near.b.name}, about ${kmText(near.km)} away.`;
        addMe();
        select(near.b.id);
      }, (err) => {
        done();
        msg.textContent = err && err.code === 1
          ? "Location access was declined. No problem: choose a branch from the list."
          : "We couldn’t get your location just now. You can still choose a branch from the list.";
      }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
    });
  }
}
