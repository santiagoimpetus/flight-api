const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, route: "/" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, route: "/health" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server started on port " + PORT);
});