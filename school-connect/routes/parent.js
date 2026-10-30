// The parent's live bus map. Each parent has their own secret link (texted
// to them from the Students page), so there's no app to install and no
// password to remember.

const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const bus = require("../lib/bus");

function loadParent(req, res, next) {
  const found = store.all("parents").find((p) => p.token === req.params.token);
  if (!found) return res.status(404).render("404", { title: "Not found" });
  req.parent = found;
  next();
}

router.get("/:token", loadParent, (req, res) => {
  res.render("track", {
    title: "Bus tracker",
    parent: req.parent,
    token: req.params.token,
    radiusMin: bus.ALERT_RADIUS_MIN,
    radiusMax: bus.ALERT_RADIUS_MAX,
  });
});

router.get("/:token/status.json", loadParent, (req, res) => {
  res.json(bus.statusForParent(req.parent));
});

// Save the alert zone: its size, and optionally where it was dragged to
// (zone: null puts it back on the family's stop).
router.post("/:token/settings", loadParent, (req, res) => {
  const { alertRadiusM, zone } = req.body || {};
  if (alertRadiusM !== undefined) {
    const radius = Math.round(Number(alertRadiusM));
    if (!(radius >= bus.ALERT_RADIUS_MIN && radius <= bus.ALERT_RADIUS_MAX)) return res.status(400).json({ error: "Zone size must be between 200 m and 5 km" });
    req.parent.alertRadiusM = radius;
  }
  if (zone === null) delete req.parent.zone;
  else if (zone !== undefined) {
    const point = { lat: Number(zone.lat), lng: Number(zone.lng) };
    const student = store.all("students").find((s) => s.parentId === req.parent.id && s.busId);
    const theBus = student && store.find("buses", student.busId);
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !theBus || !bus.zoneNearRoute(theBus, point)) {
      return res.status(400).json({ error: "Keep the zone near your bus route" });
    }
    req.parent.zone = { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6) };
  }
  store.upsert("parents", req.parent);
  res.json({ ok: true, alertRadiusM: req.parent.alertRadiusM, zone: req.parent.zone || null });
});

module.exports = router;
