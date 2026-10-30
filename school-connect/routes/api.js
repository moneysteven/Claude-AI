// Machine-to-machine endpoints. Your existing lunch system calls this when a
// student receives lunch, so the "didn't collect lunch" alerts know who ate.
//
//   POST /api/lunch/collected
//   x-api-key: <LUNCH_API_KEY>
//   { "studentId": "st01" }

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const store = require("../lib/store");
const school = require("../lib/school");

function requireApiKey(req, res, next) {
  const expected = process.env.LUNCH_API_KEY;
  const given = req.get("x-api-key") || "";
  const ok =
    expected &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (ok) return next();
  res.status(401).json({ error: "Invalid or missing x-api-key" });
}

router.post("/lunch/collected", requireApiKey, (req, res) => {
  const { studentId } = req.body || {};
  if (!store.find("students", studentId)) return res.status(404).json({ error: "Unknown studentId" });
  res.json({ ok: true, record: school.markLunchCollected(studentId) });
});

module.exports = router;
