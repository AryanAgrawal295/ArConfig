/**
 * src/config.js
 *
 * Loads and validates run configuration from environment variables.
 * No credentials are ever hardcoded here.
 */

require("dotenv").config();

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function parseOrgCodes(value) {
  if (Array.isArray(value)) {
    return value.map((c) => String(c).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function getMissingConfig(cfg) {
  const missing = [];
  if (!cfg.baseUrl) missing.push("FUSION_BASE_URL");
  if (!cfg.username) missing.push("FUSION_USERNAME");
  if (!cfg.password) missing.push("FUSION_PASSWORD");
  return missing;
}

function applyFusionCredentials(cfg, credentials = {}) {
  const nextCfg = {
    ...cfg,
    baseUrl: normalizeBaseUrl(credentials.baseUrl || cfg.baseUrl),
    username: String(credentials.username || cfg.username || "").trim(),
    password: String(credentials.password || cfg.password || "").trim(),
  };

  return {
    ...nextCfg,
    missing: getMissingConfig(nextCfg),
  };
}

function loadConfig() {
  const baseUrl = normalizeBaseUrl(process.env.FUSION_BASE_URL);
  const username = (process.env.FUSION_USERNAME || "").trim();
  const password = (process.env.FUSION_PASSWORD || "").trim();
  const orgCodesRaw = (process.env.FUSION_ORG_CODES || "ALL").trim();
  const pageSize = Math.max(1, Math.min(1000, parseInt(process.env.PAGE_SIZE || "500", 10) || 500));
  const mongoUri = (process.env.MONGODB_URI || "mongodb://localhost:27017/configsnapshot").trim();
  const port = parseInt(process.env.PORT || "5000", 10);
  const taskExportPollMs = parseInt(process.env.TASK_EXPORT_POLL_MS || "5000", 10);
  const taskExportTimeoutMs = parseInt(process.env.TASK_EXPORT_TIMEOUT_MS || "600000", 10);
  const maxPages = Math.max(1, parseInt(process.env.MAX_PAGES || "10000", 10) || 10000);

  const orgCodes = parseOrgCodes(orgCodesRaw);
  const cfg = {
    baseUrl,
    username,
    password,
    orgCodes: orgCodes.length ? orgCodes : ["ALL"],
    pageSize,
    mongoUri,
    port,
    taskExportPollMs,
    taskExportTimeoutMs,
    maxPages,
  };

  return {
    ...cfg,
    missing: getMissingConfig(cfg), // caller decides whether/when to enforce this
  };
}

module.exports = { applyFusionCredentials, loadConfig, parseOrgCodes };
