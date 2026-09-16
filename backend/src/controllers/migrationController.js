const { getSession } = require("../sessionStore");
const { errorResponse, AppError } = require("../errors");
const { writeAudit } = require("../auditService");
const { getMigrationProgress } = require("../migrationProgress");
const MigrationPlan = require("../models/MigrationPlan");
const {
  createMigrationPlan,
  executeMigrationPlan,
  listMigrationSources,
} = require("../migrationService");

async function sources(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before migration.", code: "AUTHENTICATION_FAILED" });
  try {
    const items = await listMigrationSources(session.ownerId);
    return res.json({ sources: items });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

async function validateExisting(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before migration.", code: "AUTHENTICATION_FAILED" });
  try {
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_VALIDATED", metadata: { sourceType: "EXTRACTION", destinationConnectionId: req.body?.destinationConnectionId } });
    const plan = await createMigrationPlan({
      ownerId: session.ownerId,
      requestedBy: session.cfg.username,
      body: req.body,
    });
    return res.status(201).json({ plan, downloadUrl: plan.reportFile ? `/api/reports/${encodeURIComponent(plan.reportFile)}` : "" });
  } catch (error) {
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_FAILED", status: "FAILED", metadata: { errorCode: error.code || "MIGRATION_VALIDATION_FAILED", message: error.message } });
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

async function validateWorkbook(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before migration.", code: "AUTHENTICATION_FAILED" });
  try {
    const sourceBuffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!sourceBuffer?.length) throw new AppError("INVALID_WORKBOOK", "Upload a .xlsx workbook to validate.");
    const sourceFilename = req.get("x-file-name") || "uploaded.xlsx";
    const body = JSON.parse(req.get("x-migration-options") || "{}");
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_VALIDATED", metadata: { sourceType: "WORKBOOK", filename: sourceFilename, destinationConnectionId: body.destinationConnectionId } });
    const plan = await createMigrationPlan({
      ownerId: session.ownerId,
      requestedBy: session.cfg.username,
      body,
      sourceBuffer,
      sourceFilename,
    });
    return res.status(201).json({ plan, downloadUrl: plan.reportFile ? `/api/reports/${encodeURIComponent(plan.reportFile)}` : "" });
  } catch (error) {
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_FAILED", status: "FAILED", metadata: { errorCode: error.code || "MIGRATION_VALIDATION_FAILED", message: error.message } });
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

async function getPlan(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before migration.", code: "AUTHENTICATION_FAILED" });
  try {
    const plan = await MigrationPlan.findOne({ _id: req.params.id, ownerId: session.ownerId });
    if (!plan) return res.status(404).json({ error: "Migration plan not found.", code: "INVALID_MIGRATION_SOURCE" });
    return res.json({ plan, downloadUrl: plan.reportFile ? `/api/reports/${encodeURIComponent(plan.reportFile)}` : "" });
  } catch (error) {
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

async function execute(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before migration.", code: "AUTHENTICATION_FAILED" });
  try {
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_STARTED", metadata: { migrationId: req.params.id } });
    const plan = await executeMigrationPlan({
      ownerId: session.ownerId,
      planId: req.params.id,
      confirmationText: req.body?.confirmationText || "",
    });
    return res.json({ plan, downloadUrl: plan.reportFile ? `/api/reports/${encodeURIComponent(plan.reportFile)}` : "" });
  } catch (error) {
    await writeAudit({ ownerId: session.ownerId, action: "MIGRATION_FAILED", status: "FAILED", metadata: { migrationId: req.params.id, errorCode: error.code || "MIGRATION_EXECUTION_FAILED", message: error.message } });
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

function progress(req, res) {
  const value = getMigrationProgress(req.params.id);
  if (!value) return res.status(404).json({ error: "Migration progress not found.", code: "INVALID_MIGRATION_SOURCE" });
  return res.json(value);
}

module.exports = { execute, getPlan, progress, sources, validateExisting, validateWorkbook };
