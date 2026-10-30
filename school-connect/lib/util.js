const crypto = require("crypto");

// Jamaica is UTC-5 all year (no daylight saving), but we still go through
// Intl so dates are right no matter what timezone the server runs in.
const TZ = "America/Jamaica";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("en-JM", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-JM", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T12:00:00-05:00`));
}

// The Jamaica calendar date (YYYY-MM-DD) of a timestamp.
function dateOf(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function daysUntil(isoDate) {
  const ms = new Date(`${isoDate}T00:00:00-05:00`) - new Date(`${today()}T00:00:00-05:00`);
  return Math.round(ms / 86400000);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

// Long, unguessable tokens for the parent tracking and driver links.
function newToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function firstName(fullName) {
  return String(fullName).split(" ")[0];
}

module.exports = { today, dateOf, formatTime, formatDate, daysUntil, newId, newToken, firstName, TZ };
