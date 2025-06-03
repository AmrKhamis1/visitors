const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const cors = require("cors");

// Use environment variable for port (Render provides this automatically)
const PORT = process.env.PORT || 3000;

// CORS configuration for Render
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? [
          "http://localhost:5173",
          "https://amrkhamis1.github.io",
          "https://yourdomain.com",
          "https://www.yourdomain.com",
        ] // Replace with your actual domains
      : true, // Allow all origins in development
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

// For Render, use /opt/render/project/src as base path for persistent storage
const DATA_DIR = process.env.RENDER_SERVICE_ID
  ? "/opt/render/project/src"
  : __dirname;
const FILE_PATH = path.join(DATA_DIR, "visits.json");

// Serve static files if public directory exists
const publicPath = path.join(__dirname, "public");
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// Ensure visits.json exists
function initializeVisitsFile() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, JSON.stringify([]));
      console.log("Created visits.json file");
    }
  } catch (error) {
    console.warn("Could not create visits.json, using memory storage");
  }
}

initializeVisitsFile();

// In-memory fallback for cases where file system isn't writable
let memoryVisits = [];

// Enhanced IP detection for Render
function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const renderIP = req.headers["x-render-forwarded-for"];

  if (renderIP) {
    return renderIP.split(",")[0].trim();
  }
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }

  return (
    req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown"
  );
}

// Helper functions for data persistence
function readVisitsData() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const fileContent = fs.readFileSync(FILE_PATH, "utf-8");
      return JSON.parse(fileContent);
    }
  } catch (error) {
    console.warn(
      "Error reading from file, using memory storage:",
      error.message
    );
  }
  return memoryVisits;
}

function writeVisitsData(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.warn("Error writing to file, using memory storage:", error.message);
    memoryVisits = data;
    return false;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    render_service: !!process.env.RENDER_SERVICE_ID,
  });
});

// POST to record a visit
app.post("/visit", (req, res) => {
  try {
    const ip = getClientIP(req);
    const timestamp = new Date().toISOString().split("T")[0];

    const data = readVisitsData();

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
      writeVisitsData(data);
    }

    res.json({
      count: data.length,
      visitedToday: !!alreadyVisitedToday,
      success: true,
    });
  } catch (error) {
    console.error("Error in /visit endpoint:", error);
    res.status(500).json({
      error: "Failed to process visit",
      success: false,
    });
  }
});

// GET total count
app.get("/visit-count", (req, res) => {
  try {
    const data = readVisitsData();
    res.json({
      count: data.length,
      success: true,
    });
  } catch (error) {
    console.error("Error in /visit-count endpoint:", error);
    res.status(500).json({
      error: "Failed to get visit count",
      success: false,
    });
  }
});

// Handle 404 for unknown routes
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server - Render requires binding to 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Visit tracker running on port ${PORT}`);
  console.log(`📁 Data file: ${FILE_PATH}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `🚀 Render Service: ${process.env.RENDER_SERVICE_ID ? "Yes" : "No"}`
  );
});
