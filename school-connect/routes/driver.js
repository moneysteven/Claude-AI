// The bus driver's phone page. The link contains the bus's secret token, so
// the driver doesn't need a password — the school just sends them the link.
// The driver only starts and ends the trip; students scan themselves on at
// the door (routes/scanner.js).

const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const bus = require("../lib/bus");

function loadBus(req, res, next) {
  const found = store.all("buses").find((b) => b.driverToken === req.params.token);
  if (!found) return res.status(404).render("404", { title: "Not found" });
  req.bus = found;
  next();
}

router.get("/:token", loadBus, (req, res) => {
  res.render("driver", { title: req.bus.name, bus: req.bus, token: req.params.token });
});

router.get("/:token/state.json", loadBus, (req, res) => {
  res.json({ trip: req.bus.trip, onBoard: req.bus.trip ? bus.onBoard(req.bus.trip.id).length : 0 });
});

router.post("/:token/trip/start", loadBus, (req, res) => {
  res.json({ trip: bus.startTrip(req.bus, req.body.direction) });
});

router.post("/:token/trip/end", loadBus, async (req, res) => {
  await bus.endTrip(req.bus);
  res.json({ ok: true });
});

router.post("/:token/location", loadBus, async (req, res) => {
  try {
    const { lat, lng, speed } = req.body;
    const result = await bus.updateLocation(req.bus, {
      lat: Number(lat),
      lng: Number(lng),
      speed: speed === null || speed === undefined ? null : Number(speed),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
