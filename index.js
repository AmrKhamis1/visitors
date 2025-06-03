const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const cors = require("cors");

// Use environment variable for port (required for most hosting platforms)
const PORT = process.env.PORT || 3000;

// CORS configuration - restrict origins in production
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? ["https://yourdomain.com", "https://www.yourdomain.com"] // Replace with your actual domains
      : true, // Allow all origins in development
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

// Serve static files only if public directory exists
const publicPath = path.join(__dirname, "public");
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// Use a more persistent storage path for production
const DATA_DIR = process.env.DATA_DIR || __dirname;
const FILE_PATH = path.join(DATA_DIR, "visits.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure visits.json exists
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify([]));
}

// Enhanced IP detection for various hosting environments
function getClientIP(req) {
  // Check multiple headers that different proxies/load balancers use
  const forwarded = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const cfConnectingIP = req.headers["cf-connecting-ip"]; // Cloudflare
  const xClientIP = req.headers["x-client-ip"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  if (xClientIP) {
    return xClientIP;
  }

  return req.socket.remoteAddress || req.connection.remoteAddress || "unknown";
}

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Health check endpoint (useful for deployment monitoring)
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// POST to record a visit with better error handling
app.post("/visit", (req, res) => {
  try {
    const ip = getClientIP(req);
    const timestamp = new Date().toISOString().split("T")[0];

    // Read with error handling
    let data;
    try {
      const fileContent = fs.readFileSync(FILE_PATH, "utf-8");
      data = JSON.parse(fileContent);
    } catch (error) {
      console.error("Error reading visits file:", error);
      data = [];
    }

    const alreadyVisitedToday = data.find(
      (entry) => entry.ip === ip && entry.date === timestamp
    );

    if (!alreadyVisitedToday) {
      const newEntry = {
        ip,
        date: timestamp,
        time: new Date().toISOString(),
        userAgent: req.headers["user-agent"] || "unknown",
      };
      data.push(newEntry);

      try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error("Error writing to visits file:", error);
        return res.status(500).json({ error: "Failed to record visit" });
      }
    }

    res.json({
      count: data.length,
      visitedToday: !!alreadyVisitedToday,
    });
  } catch (error) {
    console.error("Error in /visit endpoint:", error);
    res.status(500).json({ error: "Failed to process visit" });
  }
});

// GET total count with error handling
app.get("/visit-count", (req, res) => {
  try {
    let data;
    try {
      const fileContent = fs.readFileSync(FILE_PATH, "utf-8");
      data = JSON.parse(fileContent);
    } catch (error) {
      console.error("Error reading visits file:", error);
      data = [];
    }

    res.json({ count: data.length });
  } catch (error) {
    console.error("Error in /visit-count endpoint:", error);
    res.status(500).json({ error: "Failed to get visit count" });
  }
});

// Handle 404 for unknown routes
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Visit tracker running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
