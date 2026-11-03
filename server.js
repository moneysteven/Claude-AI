require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");

const { csrfProtection, securityHeaders, isProduction } = require("./lib/security");
const { getProviderName } = require("./lib/providers");

const shopRoutes = require("./routes/shop");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhooks");
const adminRoutes = require("./routes/admin");

// --- Refuse to start with unsafe production configuration -----------------
const DEFAULT_SECRET = "dev-secret-change-me";
const sessionSecret = process.env.SESSION_SECRET || DEFAULT_SECRET;
const problems = [];
if (isProduction()) {
  if (sessionSecret === DEFAULT_SECRET || sessionSecret === "change-this-to-a-long-random-string" || sessionSecret.length < 32) {
    problems.push("SESSION_SECRET must be set to a long random string (32+ characters).");
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "change-me-now") {
    problems.push("ADMIN_PASSWORD must be changed from the default.");
  }
}
let providerName;
try {
  providerName = getProviderName();
} catch (err) {
  problems.push(err.message);
}
if (problems.length) {
  console.error("Refusing to start:\n - " + problems.join("\n - "));
  process.exit(1);
}

const app = express();

app.disable("x-powered-by");
if (isProduction()) app.set("trust proxy", 1); // Render/Railway/Fly terminate TLS in front of us

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(securityHeaders);
app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || "Steven Scale Solutions";
  res.locals.testMode = providerName === "test";
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Webhooks need the raw body (for signature verification) so this must be
// registered BEFORE express.urlencoded()/express.json(). They are
// authenticated by signature, not by session/CSRF.
app.use("/webhooks", express.raw({ type: "*/*", limit: "100kb" }), webhookRoutes);

app.use(express.urlencoded({ extended: false, limit: "50kb" }));

app.use(
  cookieSession({
    name: "session",
    keys: [sessionSecret],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, so a cart survives a return visit
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
  })
);

app.use(csrfProtection);

app.use("/", shopRoutes);
app.use("/", checkoutRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return;
  res.status(500).render("error", {
    title: "Something went wrong",
    message: "Sorry, something went wrong on our side. Please try again in a moment.",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${process.env.SITE_NAME || "Store"} running on http://localhost:${PORT}`);
  console.log(`Payment provider: ${providerName}${providerName === "test" ? " (TEST MODE — no real money is collected)" : ""}`);
});
