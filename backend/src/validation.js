const { AppError } = require("./errors");

function text(value, name, options = {}) {
  const normalized = String(value ?? "").trim();
  const max = options.max || 200;
  if (options.required && !normalized) {
    throw new AppError("MISSING_PARAMETER", `${name} is required.`, { field: name });
  }
  if (normalized.length > max) {
    throw new AppError("MISSING_PARAMETER", `${name} must be at most ${max} characters.`, {
      field: name,
    });
  }
  return normalized;
}

function httpUrl(value, name = "baseUrl") {
  const normalized = text(value, name, { required: true, max: 500 });
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AppError("INVALID_CONNECTION", `${name} must be a valid HTTPS URL.`);
  }
  const allowHttp = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !allowHttp) {
    throw new AppError("INVALID_CONNECTION", `${name} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new AppError("INVALID_CONNECTION", `${name} must not contain credentials.`);
  }
  return parsed.origin;
}

function enumValue(value, name, allowed, fallback) {
  const normalized = String(value || fallback || "").toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new AppError("MISSING_PARAMETER", `${name} must be one of: ${allowed.join(", ")}.`);
  }
  return normalized;
}

module.exports = { enumValue, httpUrl, text };
