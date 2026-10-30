// The ID card scanner at the bus door: a cheap phone or tablet mounted by
// the door with this page open. Students hold their ID card's QR code up to
// the camera as they get on (and, in the afternoon, as they get off). The
// driver never has to touch it.

const express = require("express");
const router = express.Router();
const store = require("../lib/store");
const bus = require("../lib/bus");
const { firstName } = require("../lib/util");

function loadBus(req, res, next) {
  const found = store.all("buses").find((b) => b.scannerToken === req.params.token);
  if (!found) return res.status(404).render("404", { title: "Not found" });
  req.bus = found;
  next();
}

router.get("/:token", loadBus, (req, res) => {
  res.render("scanner", { title: `${req.bus.number} door scanner`, bus: req.bus, token: req.params.token });
});

router.get("/:token/state.json", loadBus, (req, res) => {
  const trip = req.bus.trip;
  res.json({ tripRunning: !!trip, direction: trip ? trip.direction : null, onBoard: trip ? bus.onBoard(trip.id).length : 0 });
});

router.post("/:token/scan", loadBus, async (req, res) => {
  try {
    const { event, student, repeat, wrongBus } = await bus.recordScan(req.bus, req.body.code);
    res.json({
      ok: true,
      name: firstName(student.name),
      type: event.type,
      repeat: !!repeat,
      wrongBus: !!wrongBus,
      onBoard: bus.onBoard(req.bus.trip.id).length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
