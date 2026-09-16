const { buildClient, verifyAuth } = require("../auth");
const { applyFusionCredentials, loadConfig } = require("../config");
const { createSession, getSession } = require("../sessionStore");
const { writeAudit } = require("../auditService");
const { httpUrl } = require("../validation");

async function login(req, res) {
  let cfg;
  try {
    cfg = applyFusionCredentials(loadConfig(), req.body);
    cfg.baseUrl = httpUrl(cfg.baseUrl, "Oracle Fusion URL");
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message, code: error.code || "INVALID_CONNECTION" });
  }

  if (cfg.missing.length > 0) {
    return res.status(400).json({
      error: `Missing required Fusion credentials: ${cfg.missing.join(", ")}`,
    });
  }

  try {
    const client = buildClient(cfg);
    const authResult = await verifyAuth(client, cfg);

    if (!authResult.ok) {
      await writeAudit({ action: "CONNECTION_LOGIN", status: "FAILED", metadata: { baseUrl: cfg.baseUrl, username: cfg.username, httpStatus: authResult.status } });
      return res.status(authResult.status === 403 ? 403 : 401).json({
        error: authResult.message || "Authentication with Oracle Fusion failed. Check credentials.",
        status: authResult.status,
      });
    }

    const session = createSession(cfg);
    await writeAudit({ ownerId: session.ownerId, action: "CONNECTION_LOGIN", metadata: { baseUrl: cfg.baseUrl, username: cfg.username } });
    return res.status(200).json({
      message: "Login successful",
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      fusion: {
        baseUrl: cfg.baseUrl,
        username: cfg.username,
      },
    });
  } catch (err) {
    await writeAudit({ action: "CONNECTION_LOGIN", status: "FAILED", metadata: { baseUrl: cfg.baseUrl, username: cfg.username, message: err.message } });
    return res.status(500).json({ error: err.message });
  }
}

async function testSession(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again to test this connection.", code: "AUTHENTICATION_FAILED" });
  try {
    const authResult = await verifyAuth(buildClient(session.cfg), session.cfg);
    return res.status(authResult.ok ? 200 : authResult.status || 502).json({ ok: authResult.ok, error: authResult.message });
  } catch (error) {
    return res.status(502).json({ error: error.message, code: "CONNECTION_FAILED" });
  }
}

module.exports = { login, testSession };
