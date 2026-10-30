// Driver page: runs the trip, sends GPS to the server, records on/off.
(function () {
  const root = document.getElementById("driver");
  const base = `/driver/${root.dataset.token}`;
  const $ = (id) => document.getElementById(id);
  let trip = null;
  let watchId = null;
  let simTimer = null;
  let lastSent = 0;
  let wakeLock = null;

  async function post(path, body) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function sendPosition(lat, lng, speed) {
    try {
      const r = await post("/location", { lat, lng, speed });
      $("gps-status").textContent =
        `Position sent ${new Date().toLocaleTimeString()}` + (r.alertsSent ? ` · ${r.alertsSent} parent alert(s) sent` : "");
    } catch (err) {
      $("gps-status").textContent = `Could not send position: ${err.message}. Retrying…`;
    }
  }

  function startGps() {
    if (!navigator.geolocation) {
      $("gps-status").textContent = "This phone can't share its location.";
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Send at most every 5 seconds to save data and battery.
        if (Date.now() - lastSent < 5000) return;
        lastSent = Date.now();
        sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.speed);
      },
      (err) => ($("gps-status").textContent = `GPS problem: ${err.message}. Check location is turned on.`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  // --- Demo simulation: drives the bus along the route ---
  function distanceM(a, b) {
    const R = 6371000, r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function routePoints(route, stepM) {
    const pts = [];
    for (let i = 0; i < route.length - 1; i++) {
      const [a, b] = [route[i], route[i + 1]];
      const n = Math.max(1, Math.round(distanceM(a, b) / stepM));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    pts.push(route[route.length - 1]);
    return pts;
  }

  function startSimulation() {
    const route = trip.direction === "afternoon" ? window.BUS_ROUTE.slice().reverse() : window.BUS_ROUTE;
    const pts = routePoints(route, 150);
    let i = 0;
    simTimer = setInterval(() => {
      if (i >= pts.length) return stopTracking();
      // 150 m every 1.5 s of demo time ≈ a bus at 25 km/h, sped up ~14x.
      sendPosition(pts[i][0], pts[i][1], 7);
      i++;
    }, 1500);
  }

  function startTracking() {
    stopTracking();
    if ($("simulate").checked) startSimulation();
    else startGps();
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => (wakeLock = l)).catch(() => {});
  }

  function stopTracking() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (simTimer) clearInterval(simTimer);
    watchId = simTimer = null;
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  function render(boarding) {
    $("trip-status").innerHTML = trip
      ? `<span class="dot live"></span> ${trip.direction === "morning" ? "Morning" : "Afternoon"} run in progress`
      : `<span class="dot"></span> No trip running`;
    $("start-morning").hidden = $("start-afternoon").hidden = !!trip;
    $("end-trip").hidden = !trip;
    if (!trip) $("gps-status").textContent = "";
    if (boarding) {
      document.querySelectorAll(".rider").forEach((row) => {
        const e = boarding[row.dataset.student];
        row.querySelector(".rider-state").textContent = e
          ? ` · ${e.type === "on" ? "On bus" : "Off bus"} since ${new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "";
        row.classList.toggle("on-bus", !!e && e.type === "on");
      });
    }
  }

  async function load() {
    const state = await fetch(`${base}/state.json`).then((r) => r.json());
    trip = state.trip;
    render(state.boarding);
    if (trip) startTracking();
  }

  async function start(direction) {
    trip = (await post("/trip/start", { direction })).trip;
    render();
    startTracking();
  }

  $("start-morning").onclick = () => start("morning");
  $("start-afternoon").onclick = () => start("afternoon");
  $("end-trip").onclick = async () => {
    if (!confirm("End this trip?")) return;
    await post("/trip/end");
    stopTracking();
    trip = null;
    render();
  };
  $("simulate").onchange = () => trip && startTracking();

  document.querySelectorAll(".rider button").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const row = btn.closest(".rider");
      btn.disabled = true;
      try {
        await post("/board", { studentId: row.dataset.student, type: btn.dataset.type });
        const state = await fetch(`${base}/state.json`).then((r) => r.json());
        render(state.boarding);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    })
  );

  load();
})();
