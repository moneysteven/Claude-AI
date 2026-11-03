// Small, dependency-free security helpers: CSRF tokens, constant-time
// comparison, login rate limiting, async error handling, and response headers.

const crypto = require("crypto");

const isProduction = () => process.env.NODE_ENV === "production";

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Constant-time string comparison (hashing first makes lengths equal).
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Gives every visitor a CSRF token in their session, exposes it to views as
// `csrfToken`, and rejects any state-changing request without a matching one.
function csrfProtection(req, res, next) {
  if (!req.session.csrf) req.session.csrf = randomToken(16);
  res.locals.csrfToken = req.session.csrf;

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const sent = req.body && typeof req.body._csrf === "string" ? req.body._csrf : req.get("x-csrf-token");
  if (safeEqual(sent || "", req.session.csrf)) return next();

  res.status(403).render("error", {
    title: "Session expired",
    message: "Your session expired or the form was submitted from another site. Please go back, refresh the page and try again.",
  });
}

// In-memory fixed-window limiter, keyed by client IP. Fine for a single
// server process; swap for a shared store if you ever run several.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return function limiter(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (hits.size > 10000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).render("error", {
        title: "Too many attempts",
        message: "Too many attempts. Please wait a few minutes and try again.",
      });
    }
    next();
  };
}

// Wraps an async route so a rejected promise reaches Express's error handler
// instead of becoming an unhandled rejection (which crashes Node).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self' 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'self'"
  );
  if (isProduction()) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// Coerces a query/body value to a trimmed string (arrays/objects -> "").
function str(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

module.exports = { isProduction, randomToken, safeEqual, csrfProtection, rateLimit, asyncHandler, securityHeaders, str };
