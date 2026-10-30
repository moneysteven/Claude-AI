// Parent's live bus map. Polls the server every 5 seconds.
(function () {
  const root = document.getElementById("track");
  const base = `/track/${root.dataset.token}`;
  const $ = (id) => document.getElementById(id);

  let map, busMarker, zoneCircle, routeLine;
  let data = null;
  let fittedForTrip = null;
  let leaveAlertedForTrip = null;

  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Same estimate the server uses: road ≈ 1.3× straight line, bus ≈ 25 km/h.
  const minutesFor = (m) => Math.max(1, Math.round((m * 1.3) / (25 / 3.6) / 60));

  function initMap(d) {
    map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    routeLine = L.polyline(d.bus.route, { color: "#0f766e", weight: 4, opacity: 0.5 }).addTo(map);
    d.bus.stops.forEach((s) =>
      L.circleMarker([s.lat, s.lng], { radius: 5, color: "#64748b" }).addTo(map).bindTooltip(s.name)
    );
    if (d.stop) {
      L.marker([d.stop.lat, d.stop.lng], {
        icon: L.divIcon({ className: "stop-icon", html: "📍", iconSize: [28, 28], iconAnchor: [14, 26] }),
      }).addTo(map).bindTooltip(`Your stop: ${d.stop.name}`, { permanent: true, direction: "top", offset: [0, -24] });
      zoneCircle = L.circle([d.stop.lat, d.stop.lng], {
        radius: d.radiusM, color: "#d97706", fillColor: "#f59e0b", fillOpacity: 0.12, weight: 2, dashArray: "6 6",
      }).addTo(map);
    }
    busMarker = L.marker(d.bus.route[0], {
      icon: L.divIcon({ className: "bus-icon", html: "🚌", iconSize: [32, 32] }),
      zIndexOffset: 1000,
    });
    map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
  }

  function notifyPhone(text) {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Time to leave for the bus stop!", { body: text }); } catch (e) { /* some browsers need a service worker */ }
    }
  }

  function render(d) {
    if (!d.hasBus) {
      $("headline").textContent = "Your child isn't on a school bus route.";
      $("subline").textContent = "Contact the school office if this is wrong.";
      $("map").hidden = true;
      return;
    }
    if (!map) initMap(d);
    $("radius-hint").textContent = `That's roughly a ${minutesFor(d.radiusM)} minute warning.`;
    if (zoneCircle) zoneCircle.setRadius(d.radiusM);

    const loc = d.trip && d.trip.location;
    if (!d.trip) {
      $("headline").textContent = `${d.bus.name} isn't running right now`;
      $("subline").textContent = "This page updates by itself when the driver starts the trip. You can leave it open.";
      busMarker.remove();
    } else if (!loc) {
      $("headline").textContent = `${d.bus.name} is starting its ${d.trip.direction} run`;
      $("subline").textContent = "Waiting for the bus's first location…";
    } else {
      busMarker.setLatLng([loc.lat, loc.lng]).addTo(map);
      if (fittedForTrip !== d.trip.startedAt && d.stop) {
        map.fitBounds(L.latLngBounds([[loc.lat, loc.lng], [d.stop.lat, d.stop.lng]]).pad(0.3));
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
    $("bi-stop").textContent = d.stop ? d.stop.name : "–";
    $("bi-driver").textContent = b.driverName;
    $("bi-phone").textContent = b.driverPhone;
    $("bi-phone").href = `tel:${b.driverPhone.replace(/[^\d+]/g, "")}`;
  }

  async function poll() {
    try {
      data = await fetch(`${base}/status.json`).then((r) => r.json());
      render(data);
    } catch (e) {
      $("subline").textContent = "No internet connection — retrying…";
    }
  }

  $("radius").onchange = async (e) => {
    await fetch(`${base}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertRadiusM: Number(e.target.value) }),
    });
    poll();
  };

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
