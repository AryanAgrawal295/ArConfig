const crypto = require("crypto");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function createSession(cfg) {
  const token = crypto.randomBytes(32).toString("base64url");
  const ownerId = crypto
    .createHash("sha256")
    .update(String(cfg.username).trim().toLowerCase())
    .digest("hex");
  sessions.set(token, {
    ownerId,
    cfg: { ...cfg, missing: [] },
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return { token, ownerId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

function getSession(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

module.exports = { createSession, getSession };
