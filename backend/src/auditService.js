const AuditLog = require("./models/AuditLog");
const logger = require("./logger");

const SENSITIVE_KEYS = /password|token|secret|authorization|credential/i;

function safeMetadata(value, depth = 0) {
  if (depth > 4 || value == null) return value == null ? value : "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeMetadata(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 500) : value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.test(key))
      .map(([key, item]) => [key, safeMetadata(item, depth + 1)])
  );
}

async function writeAudit({ ownerId = "", action, status = "SUCCESS", metadata = {} }) {
  try {
    await AuditLog.create({ ownerId, action, status, metadata: safeMetadata(metadata) });
  } catch (error) {
    logger.error(`Audit log write failed for ${action}: ${error.message}`);
  }
}

module.exports = { safeMetadata, writeAudit };
