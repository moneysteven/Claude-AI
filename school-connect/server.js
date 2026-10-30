require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");

const { seedIfEmpty } = require("./lib/seed");
const { schoolName } = require("./lib/notify");
const { getProvider } = require("./lib/messaging");

seedIfEmpty();

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
// Map library served from our own server rather than a CDN, so the bus map
// still loads on school networks that block or throttle outside sites.
app.use("/vendor/leaflet", express.static(path.join(__dirname, "node_modules", "leaflet", "dist")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  cookieSession({
    name: "sc_session",
    keys: [process.env.SESSION_SECRET || "dev-secret-change-me"],
    maxAge: 12 * 60 * 60 * 1000, // one school day
  })
);

app.use((req, res, next) => {
  res.locals.schoolName = schoolName();
  res.locals.testMode = getProvider().name === "test";
  // One-time banner message after a form submit ("12 parents texted").
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  next();
});

app.use("/api", require("./routes/api"));
app.use("/driver", require("./routes/driver"));
app.use("/track", require("./routes/parent"));
app.use("/", require("./routes/staff"));

app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${schoolName()} – School Connect running on http://localhost:${PORT}`);
  console.log(`Messaging provider: ${getProvider().name}`);
});
