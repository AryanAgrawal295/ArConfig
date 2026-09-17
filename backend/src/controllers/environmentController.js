const { buildClient, verifyAuth } = require("../auth");
const { writeAudit } = require("../auditService");
const { errorResponse } = require("../errors");
const { getSession } = require("../sessionStore");
const {
  createConnection,
  getConnectionConfig,
  listConnections,
  publicConnection,
  removeConnection,
  updateConnection,
} = require("../environmentService");

function sessionOrReject(req, res) {
  const session = getSession(req);
  if (!session) res.status(401).json({ error: "Sign in again to manage environments.", code: "AUTHENTICATION_FAILED" });
  return session;
}

async function list(req, res) {
  const session = sessionOrReject(req, res); if (!session) return;
  try { return res.json({ connections: await listConnections(session.ownerId) }); }
  catch (error) { const response = errorResponse(error); return res.status(response.status).json(response.body); }
}

async function create(req, res) {
  const session = sessionOrReject(req, res); if (!session) return;
  try {
    const connection = await createConnection(session.ownerId, req.body || {});
    await writeAudit({ ownerId: session.ownerId, action: "CONNECTION_CREATED", metadata: { connectionId: connection._id, name: connection.name } });
    return res.status(201).json({ connection });
  } catch (error) { const response = errorResponse(error); return res.status(response.status).json(response.body); }
}

async function test(req, res) {
  const session = sessionOrReject(req, res); if (!session) return;
  try {
    const { connection, cfg } = await getConnectionConfig(session.ownerId, req.params.id);
    const auth = await verifyAuth(buildClient({ ...session.cfg, ...cfg }), cfg);
    connection.status = auth.ok ? "HEALTHY" : "UNHEALTHY";
    connection.lastTestedAt = new Date();
    await connection.save();
    await writeAudit({ ownerId: session.ownerId, action: "CONNECTION_TESTED", status: auth.ok ? "SUCCESS" : "FAILED", metadata: { connectionId: connection.id, httpStatus: auth.status } });
    return res.status(auth.ok ? 200 : auth.status || 502).json({ connection: publicConnection(connection), ok: auth.ok, error: auth.message });
  } catch (error) { const response = errorResponse(error); return res.status(response.status).json(response.body); }
}

async function remove(req, res) {
  const session = sessionOrReject(req, res); if (!session) return;
  try {
    await removeConnection(session.ownerId, req.params.id);
    await writeAudit({ ownerId: session.ownerId, action: "CONNECTION_DELETED", metadata: { connectionId: req.params.id } });
    return res.status(204).end();
  } catch (error) { const response = errorResponse(error); return res.status(response.status).json(response.body); }
}

async function update(req, res) {
  const session = sessionOrReject(req, res); if (!session) return;
  try {
    const connection = await updateConnection(session.ownerId, req.params.id, req.body || {});
    await writeAudit({ ownerId: session.ownerId, action: "CONNECTION_UPDATED", metadata: { connectionId: connection._id, name: connection.name } });
    return res.json({ connection });
  } catch (error) { const response = errorResponse(error); return res.status(response.status).json(response.body); }
}

module.exports = { create, list, remove, test, update };
