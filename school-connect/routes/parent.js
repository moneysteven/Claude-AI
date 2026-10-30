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
    radiusOptions: bus.ALERT_RADIUS_OPTIONS,
  });
});

router.get("/:token/status.json", loadParent, (req, res) => {
  res.json(bus.statusForParent(req.parent));
});

router.post("/:token/settings", loadParent, (req, res) => {
  const radius = Number(req.body.alertRadiusM);
  if (!bus.ALERT_RADIUS_OPTIONS.includes(radius)) return res.status(400).json({ error: "Invalid radius" });
  req.parent.alertRadiusM = radius;
  store.upsert("parents", req.parent);
  res.json({ ok: true, alertRadiusM: radius });
});

module.exports = router;
