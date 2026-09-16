const { buildClient, verifyAuth } = require("../auth");
const { applyFusionCredentials, loadConfig } = require("../config");
const { getSession } = require("../sessionStore");
const {
  listAreaTasks,
  listFunctionalAreas,
  listOfferings,
  searchSetupTasks,
} = require("../setupService");
const { listRegistryArea } = require("../configurationRegistry");

function getRequestConfig(req) {
  const session = getSession(req);
  if (session) return session.cfg;
  return applyFusionCredentials(loadConfig(), req.body?.fusionCredentials || req.body);
}

async function withFusionClient(req, res, operation) {
  try {
    const cfg = getRequestConfig(req);
    if (cfg.missing.length) {
      return res.status(400).json({ error: `Missing required Fusion credentials: ${cfg.missing.join(", ")}` });
    }
    const client = buildClient(cfg);
    const authResult = await verifyAuth(client, cfg);
    if (!authResult.ok) {
      return res.status(authResult.status === 403 ? 403 : 401).json({
        error: authResult.message,
        status: authResult.status,
      });
    }
    return await operation(client, cfg);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}

async function getOfferings(req, res) {
  return withFusionClient(req, res, async (client, cfg) => {
    const offerings = await listOfferings(client, cfg);
    return res.status(200).json({ offerings });
  });
}

async function getFunctionalAreas(req, res) {
  return withFusionClient(req, res, async (client, cfg) => {
    const result = await listFunctionalAreas(client, cfg, req.body?.offering || {});
    return res.status(200).json(result);
  });
}

async function getAreaTasks(req, res) {
  return withFusionClient(req, res, async (client, cfg) => {
    const functionalArea = {
      code: req.body?.functionalAreaCode || "",
      name: req.body?.functionalAreaName || "",
    };
    const result = await listAreaTasks(client, cfg, functionalArea);
    return res.status(200).json({
      ...result,
      functionalAreaCode: functionalArea.code,
      functionalAreaName: functionalArea.name,
    });
  });
}

async function searchTasks(req, res) {
  return withFusionClient(req, res, async (client, cfg) => {
    const tasks = await searchSetupTasks(client, cfg, req.body?.search);
    return res.status(200).json({ tasks });
  });
}

async function getRegistry(req, res) {
  const functionalAreaName = String(req.body?.functionalAreaName || "").trim();
  return res.status(200).json({ items: listRegistryArea(functionalAreaName) });
}

module.exports = { getAreaTasks, getFunctionalAreas, getOfferings, getRegistry, searchTasks };
