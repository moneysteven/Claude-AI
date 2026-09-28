require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${process.env.SITE_NAME || "Steven Scale Solutions"} running on http://localhost:${PORT}`);
});
