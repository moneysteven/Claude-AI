// Parent's live bus map. Polls the server every 5 seconds. The map is Google
// Maps or OpenStreetMap depending on the school's settings (see map-kit.js).
(function () {
  const root = document.getElementById("track");
  const base = `/track/${root.dataset.token}`;
  const $ = (id) => document.getElementById(id);

  let kit = null, busMarker = null, zone = null, building = false, placing = false;
  let fittedForTrip = null, leaveAlertedForTrip = null, draggingUntil = 0;

  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Same estimate the server uses: road ≈ 1.3× straight line, bus ≈ 25 km/h.
  const minutesFor = (m) => Math.max(1, Math.round((m * 1.3) / (25 / 3.6) / 60));
  // The slider runs 200 m → 5 km on a log scale, so 1 km sits in the middle.
  const R_MIN = MapKit.ZONE_MIN, R_MAX = MapKit.ZONE_MAX;
  const toR = (v) => Math.round((R_MIN * Math.pow(R_MAX / R_MIN, v / 1000)) / 10) * 10;
  const toV = (r) => Math.round((1000 * Math.log(r / R_MIN)) / Math.log(R_MAX / R_MIN));

  function save(body) {
    return fetch(`${base}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((res) => { if (res.error) $("radius-hint").textContent = res.error; });
  }
  function showRadius(r, moved) {
    $("radius-label").textContent = fmtDist(r);
    $("radius").value = toV(r);
    $("radius-hint").textContent = `That's roughly a ${minutesFor(r)} minute warning${moved ? ", from the spot you chose" : ""}.`;
    $("zone-reset").hidden = !moved;
  }

  async function buildMap(d) {
    building = true;
    kit = await MapKit.create($("map"));
    const route = d.bus.route.map(([lat, lng]) => ({ lat, lng }));
    kit.polyline(route, { color: "#ffffff", weight: 10, opacity: 0.9 });
    kit.polyline(route, { color: "#1a73e8", weight: 6 });
    d.bus.stops.forEach((s) => { if (!d.stop || s.id !== d.stop.id) kit.dot(s, { label: s.name }); });
    if (d.school) kit.label(d.school, d.school.name);
    if (d.stop) {
      kit.pin(d.stop, d.stop.label || `Your stop: ${d.stop.name}`);
      zone = kit.zone({ lat: d.zone.lat, lng: d.zone.lng }, d.radiusM, (center, r, done) => {
        draggingUntil = Date.now() + 1500; // don't let a poll snap the circle back mid-drag
        const moved = Math.hypot(center.lat - d.stop.lat, center.lng - d.stop.lng) > 0.0005;
        showRadius(r, moved);
        if (done) save({ alertRadiusM: r, zone: moved ? center : null }).then(poll);
      });
    }
    busMarker = kit.bus();
    if (d.home) kit.me(d.home);
    // Setting your spot: the next tap on the map marks where you are.
    kit.onTap((spot) => { if (placing) setHome(spot); });
    kit.fit([...route, ...(d.stop ? [d.zone] : []), ...(d.home ? [d.home] : [])]);
    building = false;
  }

  // Save where the family is; the page reloads so the map shows the new pickup point.
  function setHome(spot) {
    placing = false;
    $("where-msg").textContent = "Saving…";
    fetch(`${base}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ home: spot }) })
      .then((r) => r.json())
      .then((res) => { if (res.error) $("where-msg").textContent = res.error; else location.reload(); });
  }
  function startPlacing(why) {
    placing = true;
    $("where-msg").textContent = (why ? why + " " : "") + "Tap the map where you live (zoom in first if you like).";
    $("map").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function showWhere(d) {
    if (!d.stop) return;
    $("where").hidden = false;
    $("where-ask").hidden = !!d.home;
    $("where-set").hidden = !d.home;
    if (d.home && d.stop.walkM !== undefined) $("where-walk").textContent = `${fmtDist(d.stop.walkM)} walk from you`;
  }
  $("where-gps").addEventListener("click", () => {
    if (!navigator.geolocation) return startPlacing("This phone can't share its location.");
    $("where-msg").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      (pos) => setHome({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => startPlacing("Location is turned off or not allowed."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
  $("where-tap").addEventListener("click", () => startPlacing(""));
  $("where-change").addEventListener("click", () => { $("where-ask").hidden = false; $("where-set").hidden = true; $("where-msg").textContent = ""; });

  function notifyPhone(text) {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Time to leave for the bus stop!", { body: text }); } catch (e) { /* some browsers need a service worker */ }
    }
  }

  async function render(d) {
    if (!d.hasBus) {
      $("headline").textContent = "Your child isn't on a school bus route.";
      $("subline").textContent = "Contact the school office if this is wrong.";
      $("map").hidden = true;
      return;
    }
    if (!kit) { if (building) return; await buildMap(d); }
    showWhere(d);
    if (Date.now() > draggingUntil) {
      showRadius(d.radiusM, d.zone && d.zone.moved);
      if (zone && d.zone) { zone.setRadius(d.radiusM); zone.setCenter({ lat: d.zone.lat, lng: d.zone.lng }); }
    }

    const loc = d.trip && d.trip.location;
    if (!d.trip) {
      $("headline").textContent = `${d.bus.name} isn't running right now`;
      $("subline").textContent = "This page updates by itself when the driver starts the trip. You can leave it open.";
      busMarker.set(null);
    } else if (!loc) {
      $("headline").textContent = `${d.bus.name} is starting its ${d.trip.direction} run`;
      $("subline").textContent = "Waiting for the bus's first location…";
    } else {
      busMarker.set({ lat: loc.lat, lng: loc.lng });
      if (fittedForTrip !== d.trip.startedAt && d.stop) {
        kit.fit([{ lat: loc.lat, lng: loc.lng }, d.stop, d.zone]);
        fittedForTrip = d.trip.startedAt;
      }
      if (d.stop) {
        $("headline").textContent = d.inZone
          ? `Bus is about ${d.etaMin} min from ${d.stop.name}`
          : `Bus is ${fmtDist(d.distanceM)} away · about ${d.etaMin} min`;
      } else {
        $("headline").textContent = `${d.bus.name} is on the road`;
      }
      $("subline").textContent = d.stale
        ? `⚠ Last update at ${fmtTime(loc.at)} — the driver's phone may have lost signal.`
        : `Updated ${fmtTime(loc.at)} · ${d.bus.number} · Driver: ${d.bus.driverName}`;
    }

    const showLeave = d.trip && d.trip.direction === "morning" && d.inZone && !d.stale;
    $("leave-banner").hidden = !showLeave;
    if (showLeave) {
      const text = `The bus is about ${d.etaMin} min from ${d.stop.name}.`;
      $("leave-text").textContent = text;
      if (leaveAlertedForTrip !== d.trip.startedAt) {
        leaveAlertedForTrip = d.trip.startedAt;
        notifyPhone(text);
      }
    }

    $("children").innerHTML = "";
    d.children.forEach((c) => {
      const div = document.createElement("div");
      const status =
        c.status === "on_bus" ? `On the bus ✓ (since ${fmtTime(c.at)})`
        : c.status === "off_bus" ? (c.place === "school" ? `Arrived at school at ${fmtTime(c.at)}` : `Got off at ${c.place} at ${fmtTime(c.at)}`)
        : "Not on the bus yet today";
      div.textContent = `${c.name.split(" ")[0]}: ${status}`;
      div.className = c.status === "on_bus" ? "child on-bus" : c.status === "off_bus" ? "child done" : "child";
      $("children").appendChild(div);
    });

    const b = d.bus;
    $("bus-info").hidden = false;
    $("bi-number").textContent = b.number;
    $("bi-plate").textContent = b.plate;
    $("bi-desc").textContent = b.description;
    $("bi-route").textContent = b.name;
    $("bi-stop").textContent = d.stop ? d.stop.label || d.stop.name : "–";
    $("bi-driver").textContent = b.driverName;
    $("bi-phone").textContent = b.driverPhone;
    $("bi-phone").href = `tel:${b.driverPhone.replace(/[^\d+]/g, "")}`;
  }

  async function poll() {
    try {
      render(await fetch(`${base}/status.json`).then((r) => r.json()));
    } catch (e) {
      $("subline").textContent = "No internet connection — retrying…";
    }
  }

  // Slider: the circle follows as you drag; the new size is saved when you let go.
  $("radius").addEventListener("input", (e) => {
    const r = toR(Number(e.target.value));
    draggingUntil = Date.now() + 1500;
    $("radius-label").textContent = fmtDist(r);
    $("radius-hint").textContent = `That's roughly a ${minutesFor(r)} minute warning.`;
    if (zone) zone.setRadius(r);
  });
  $("radius").addEventListener("change", (e) => save({ alertRadiusM: toR(Number(e.target.value)) }).then(poll));
  $("zone-reset").addEventListener("click", () => { draggingUntil = 0; save({ zone: null }).then(poll); });

  const notifyBtn = $("enable-notify");
  if (!("Notification" in window)) notifyBtn.hidden = true;
  else if (Notification.permission === "granted") notifyBtn.textContent = "Phone alerts are on ✓";
  notifyBtn.onclick = async () => {
    const p = await Notification.requestPermission();
    notifyBtn.textContent = p === "granted" ? "Phone alerts are on ✓" : "Phone alerts blocked — you'll still get a text";
  };

  poll();
  setInterval(poll, 5000);
})();
