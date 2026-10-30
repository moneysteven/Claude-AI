// One small map API used by every map in the app. It draws with Google Maps
// when the school has set GOOGLE_MAPS_API_KEY, and with OpenStreetMap
// (Leaflet) otherwise — the pages don't need to know which.
//
//   const kit = await MapKit.create(element);
//   kit.polyline(path, { color, weight, opacity });
//   kit.dot(point, { color, label });          // a bus stop
//   kit.pin(point, label);                     // the family's own stop
//   kit.label(point, text);                    // e.g. the school
//   const bus = kit.bus();  bus.set(point | null);   // glides between updates
//   const zone = kit.zone(center, radius, onChange); // drag to move, drag edge to resize
//   kit.fit(points);
//
// Points are { lat, lng }.

(function () {
  const BUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="4.5" y="3" width="15" height="15" rx="3.2"/><path d="M4.5 11h15M8 21v-3M16 21v-3"/></svg>';
  const GLIDE_MS = 4800; // just under the 5 s between position updates, so the bus never stops
  const ZONE_MIN = 200, ZONE_MAX = 5000;

  // Moves a marker smoothly from where it is to the new point.
  function glider(setPos) {
    let cur = null, raf = 0;
    const put = (p) => { cur = p; setPos(p); };
    return function set(p) {
      cancelAnimationFrame(raf);
      if (!p || !cur || matchMedia("(prefers-reduced-motion: reduce)").matches) { put(p); return; }
      const from = cur, start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / GLIDE_MS);
        put({ lat: from.lat + (p.lat - from.lat) * k, lng: from.lng + (p.lng - from.lng) * k });
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
  }
  const clampR = (r) => Math.min(ZONE_MAX, Math.max(ZONE_MIN, Math.round(r / 10) * 10));

  // ---------------- Google Maps ----------------
  function loadGoogle(key) {
    if (window.google && window.google.maps) return Promise.resolve();
    return new Promise((resolve, reject) => {
      window.__mapkitReady = resolve;
      // Called by Google if the key is wrong or not allowed on this website.
      window.gm_authFailure = () => {
        try { sessionStorage.setItem("mapkit-no-google", "1"); } catch (e) { /* ignore */ }
        location.reload();
      };
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__mapkitReady`;
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
      setTimeout(() => reject(new Error("Google Maps took too long to load")), 10000);
    });
  }

  function googleKit(el) {
    const g = google.maps;
    const map = new g.Map(el, {
      center: { lat: 18.1, lng: -77.3 }, zoom: 9,
      gestureHandling: "greedy",          // one finger pans, pinch zooms — like the Google Maps app
      fullscreenControl: true, streetViewControl: false, mapTypeControl: false, clickableIcons: false,
    });

    // HTML markers (bus, pin, labels) drawn on top of the map.
    class Html extends g.OverlayView {
      constructor(pos, html, cls) { super(); this.pos = pos; this.div = document.createElement("div"); this.div.className = "mk " + cls; this.div.innerHTML = html; this.setMap(map); }
      onAdd() { this.getPanes().overlayMouseTarget.appendChild(this.div); }
      draw() {
        if (!this.pos) { this.div.style.display = "none"; return; }
        const p = this.getProjection().fromLatLngToDivPixel(new g.LatLng(this.pos.lat, this.pos.lng));
        if (!p) return;
        this.div.style.display = ""; this.div.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      onRemove() { this.div.remove(); }
      move(pos) { this.pos = pos; this.draw(); }
    }

    return {
      provider: "google",
      polyline(path, o = {}) { return new g.Polyline({ map, path, strokeColor: o.color || "#1a73e8", strokeWeight: o.weight || 6, strokeOpacity: o.opacity ?? 1, zIndex: o.z || 1 }); },
      dot(p, o = {}) { const m = new Html(p, `<span class="mk-dot" style="--c:${o.color || "#1a73e8"}"></span>`, "mk-center"); if (o.label) m.div.title = o.label; return m; },
      pin(p, label) { return new Html(p, `<span class="pin"></span>${label ? `<span class="mk-pinlbl">${escapeHtml(label)}</span>` : ""}`, "mk-pin"); },
      label(p, text) { return new Html(p, `<span class="mk-label">${escapeHtml(text)}</span>`, "mk-center"); },
      bus() {
        const m = new Html(null, `<span class="busdot">${BUS_SVG}</span>`, "mk-center mk-bus");
        const set = glider((p) => m.move(p));
        return { set };
      },
      zone(center, radius, onChange) {
        const c = new g.Circle({ map, center, radius, editable: true, draggable: true, strokeColor: "#ff9500", strokeWeight: 2, fillColor: "#ff9500", fillOpacity: 0.15, zIndex: 2 });
        let quiet = false, timer = 0;
        const report = (done) => {
          if (quiet) return;
          const r = clampR(c.getRadius());
          if (r !== c.getRadius()) { quiet = true; c.setRadius(r); quiet = false; }
          const ctr = c.getCenter();
          onChange({ lat: ctr.lat(), lng: ctr.lng() }, r, done);
        };
        c.addListener("radius_changed", () => { report(false); clearTimeout(timer); timer = setTimeout(() => report(true), 400); });
        c.addListener("center_changed", () => report(false));
        c.addListener("dragend", () => report(true));
        return {
          setRadius(r) { quiet = true; c.setRadius(r); quiet = false; },
          setCenter(p) { quiet = true; c.setCenter(p); quiet = false; },
        };
      },
      fit(points) { const b = new g.LatLngBounds(); points.forEach((p) => b.extend(p)); map.fitBounds(b, 40); },
    };
  }

  // ---------------- OpenStreetMap (Leaflet) ----------------
  function leafletKit(el) {
    const map = L.map(el, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    map.setView([18.1, -77.3], 9);
    const ll = (p) => [p.lat, p.lng];
    const html = (h, size, anchor) => L.divIcon({ className: "mk-leaflet", html: h, iconSize: size, iconAnchor: anchor });

    return {
      provider: "osm",
      polyline(path, o = {}) { return L.polyline(path.map(ll), { color: o.color || "#1a73e8", weight: o.weight || 6, opacity: o.opacity ?? 1 }).addTo(map); },
      dot(p, o = {}) { const m = L.circleMarker(ll(p), { radius: 5, color: o.color || "#1a73e8", weight: 3, fillColor: "#ffffff", fillOpacity: 1 }).addTo(map); if (o.label) m.bindTooltip(o.label); return m; },
      pin(p, label) { const m = L.marker(ll(p), { icon: html('<span class="pin"></span>', [30, 30], [15, 30]) }).addTo(map); if (label) m.bindTooltip(label, { permanent: true, direction: "top", offset: [0, -28] }); return m; },
      label(p, text) { return L.marker(ll(p), { icon: html(`<span class="mk-label">${escapeHtml(text)}</span>`, null, null), interactive: false }).addTo(map); },
      bus() {
        const m = L.marker([0, 0], { icon: html(`<span class="busdot">${BUS_SVG}</span>`, [36, 36], [18, 18]), zIndexOffset: 1000 });
        const set = glider((p) => { if (p) m.setLatLng(ll(p)).addTo(map); else m.remove(); });
        return { set };
      },
      // Leaflet has no editable circle, so: a handle in the middle moves it and
      // a handle on the edge resizes it.
      zone(center, radius, onChange) {
        const c = L.circle(ll(center), { radius, color: "#ff9500", weight: 2, fillColor: "#ff9500", fillOpacity: 0.15, dashArray: "6 6" }).addTo(map);
        const mover = L.marker(ll(center), { draggable: true, icon: html('<span class="zone-handle move"></span>', [26, 26], [13, 13]), zIndexOffset: 900 }).addTo(map);
        const sizer = L.marker([0, 0], { draggable: true, icon: html('<span class="zone-handle size"></span>', [22, 22], [11, 11]), zIndexOffset: 900 }).addTo(map);
        const edge = () => { const ctr = c.getLatLng(), r = c.getRadius(); return L.latLng(ctr.lat, ctr.lng + r / (111320 * Math.cos((ctr.lat * Math.PI) / 180))); };
        const place = () => sizer.setLatLng(edge());
        place();
        const out = (done) => { const ctr = c.getLatLng(); onChange({ lat: ctr.lat, lng: ctr.lng }, c.getRadius(), done); };
        mover.on("drag", () => { c.setLatLng(mover.getLatLng()); place(); out(false); });
        mover.on("dragend", () => out(true));
        sizer.on("drag", () => { c.setRadius(clampR(c.getLatLng().distanceTo(sizer.getLatLng()))); out(false); });
        sizer.on("dragend", () => { place(); out(true); });
        return {
          setRadius(r) { c.setRadius(r); place(); },
          setCenter(p) { c.setLatLng(ll(p)); mover.setLatLng(ll(p)); place(); },
        };
      },
      fit(points) { map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [30, 30] }); },
    };
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  async function create(el) {
    let noGoogle = false;
    try { noGoogle = sessionStorage.getItem("mapkit-no-google") === "1"; } catch (e) { /* ignore */ }
    if (window.GMAPS_KEY && !noGoogle) {
      try { await loadGoogle(window.GMAPS_KEY); return googleKit(el); }
      catch (e) { console.warn("Google Maps unavailable, using OpenStreetMap:", e.message); }
    }
    return leafletKit(el);
  }

  window.MapKit = { create, ZONE_MIN, ZONE_MAX };
})();
