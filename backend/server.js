/**
 * server.js
 *
 * Express app entry point. Connects to MongoDB, mounts API routes,
 * serves generated Excel files statically from /output, and starts
 * listening.
 *
 * Run with: npm run dev
 */

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const { loadConfig } = require("./src/config");
const authRoutes = require("./src/routes/auth");
const extractionRoutes = require("./src/routes/extraction");
const setupRoutes = require("./src/routes/setup");
const comparisonRoutes = require("./src/routes/comparison");
const migrationRoutes = require("./src/routes/migration");
const environmentRoutes = require("./src/routes/environments");
const reportRoutes = require("./src/routes/reports");
const logger = require("./src/logger");

const cfg = loadConfig();
const app = express();

const allowedOrigins = String(process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/extraction", extractionRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/comparison", comparisonRoutes);
app.use("/api/migration", migrationRoutes);
app.use("/api/environments", environmentRoutes);
app.use("/api/reports", reportRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const frontendBuildPath = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendBuildPath, "index.html"));
  });
}

async function start() {
  try {
    await mongoose.connect(cfg.mongoUri);
    logger.info("Connected to MongoDB");
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    logger.error("Check MONGODB_URI in .env — is MongoDB running?");
    process.exit(1);
  }

  app.listen(cfg.port, () => {
    logger.info(`Server listening on port ${cfg.port}`);
    if (cfg.missing.length > 0) {
      logger.error(
        `Note: missing Fusion config (${cfg.missing.join(", ")}) — ` +
          `enter these values on the website login page before running extraction.`
      );
    }
  });
}

if (require.main === module) start();

module.exports = { app, start };
