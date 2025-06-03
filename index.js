const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;
const cors = require("cors");
app.use(cors());
const FILE_PATH = path.join(__dirname, "visits.json");

app.use(express.json());
app.use(express.static("public")); // serve your frontend

// Ensure visits.json exists
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify([]));
}

// Get client IP helper
function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

// POST to record a visit
app.post("/visit", (req, res) => {
  const ip = getClientIP(req);
  const timestamp = new Date().toISOString().split("T")[0]; // "2025-06-03"

  const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));

  const alreadyVisitedToday = data.find(
    (entry) => entry.ip === ip && entry.date === timestamp
  );

  if (!alreadyVisitedToday) {
    data.push({ ip, date: timestamp, time: new Date().toISOString() });
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  }

  res.json({ count: data.length });
});

// GET total count
app.get("/visit-count", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
  res.json({ count: data.length });
});

app.listen(PORT, () => {
  console.log(`Visit tracker running at http://localhost:${PORT}`);
});
