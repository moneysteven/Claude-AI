require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");

const shopRoutes = require("./routes/shop");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhooks");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Webhooks need the raw body (for signature verification) so this must be
// registered BEFORE express.urlencoded()/express.json().
app.use("/webhooks", express.raw({ type: "*/*" }), webhookRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "dev-secret-change-me"],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, so a cart survives a return visit
  })
);

app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || "Steven Scale Solutions";
  next();
});

app.use("/", shopRoutes);
app.use("/", checkoutRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${process.env.SITE_NAME || "Store"} running on http://localhost:${PORT}`);
  console.log(`Payment provider: ${process.env.PAYMENT_PROVIDER || "test"}`);
});
