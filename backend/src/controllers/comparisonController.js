const path = require("path");
const { buildClient, verifyAuth } = require("../auth");
const { writeAudit } = require("../auditService");
const { compareConfigurations } = require("../comparisonEngine");
const { buildComparisonWorkbook } = require("../comparisonReport");
const { extractConfigurationItems, normalizeSelectedTasks } = require("../configurationExtractionService");
const { loadConfig, parseOrgCodes } = require("../config");
const { getConnectionConfig } = require("../environmentService");
const { AppError, errorResponse } = require("../errors");
const { normalizeExtraction } = require("../normalizationService");
const RunHistory = require("../models/RunHistory");
const { getSession } = require("../sessionStore");

function safeFilename(value) {
  return String(value || "Compare").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Compare";
}

async function authenticatedConnection(ownerId, id, baseCfg) {
  const stored = await getConnectionConfig(ownerId, id);
  const cfg = { ...baseCfg, ...stored.cfg, missing: [] };
  const auth = await verifyAuth(buildClient(cfg), cfg);
  if (!auth.ok) throw new AppError("AUTHENTICATION_FAILED", auth.message || `Authentication failed for ${stored.connection.name}.`, undefined, auth.status);
  return { connection: stored.connection, cfg, client: buildClient(cfg) };
}

async function compare(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Sign in again before comparing environments.", code: "AUTHENTICATION_FAILED" });
  const startedAt = new Date();
  let history;
  try {
    const tasks = normalizeSelectedTasks(req.body?.tasks);
    if (!tasks.length) throw new AppError("MISSING_PARAMETER", "Select at least one configuration item to compare.");
    if (!req.body?.sourceConnectionId || !req.body?.targetConnectionId) throw new AppError("MISSING_PARAMETER", "Select both source and target environments.");
    if (req.body.sourceConnectionId === req.body.targetConnectionId) throw new AppError("INVALID_CONNECTION", "Source and target environments must be different.");
    const context = {
      functionalArea: req.body?.functionalArea || {},
      module: String(req.body?.module || req.body?.functionalArea?.name || ""),
    };
    const baseCfg = loadConfig();
    const orgCodes = parseOrgCodes(req.body?.orgCodes);
    const [source, target] = await Promise.all([
      authenticatedConnection(session.ownerId, req.body.sourceConnectionId, baseCfg),
      authenticatedConnection(session.ownerId, req.body.targetConnectionId, baseCfg),
    ]);
    history = await RunHistory.create({
      ownerId: session.ownerId,
      operation: "COMPARE",
      lifecycleStatus: "RUNNING",
      requestedBy: session.cfg.username,
      sourceConnection: { id: source.connection.id, name: source.connection.name, environmentType: source.connection.environmentType },
      targetConnection: { id: target.connection.id, name: target.connection.name, environmentType: target.connection.environmentType },
      offeringCode: req.body?.offering?.code || "",
      offeringName: req.body?.offering?.name || "",
      functionalAreaCode: context.functionalArea.code || "",
      functionalAreaName: context.functionalArea.name || "",
      configurationItems: tasks.map((task) => task.code || task.name),
      parameters: { orgCodes },
      taskCount: tasks.length,
      status: "success",
      startedAt,
    });
    await writeAudit({ ownerId: session.ownerId, action: "COMPARISON_REQUESTED", metadata: { runId: history.id, taskCount: tasks.length } });
    const [sourceExtraction, targetExtraction] = await Promise.all([
      extractConfigurationItems({ client: source.client, cfg: source.cfg, tasks, orgCodes: orgCodes.length ? orgCodes : source.cfg.orgCodes }),
      extractConfigurationItems({ client: target.client, cfg: target.cfg, tasks, orgCodes: orgCodes.length ? orgCodes : target.cfg.orgCodes }),
    ]);
    const sourceNormalized = normalizeExtraction(sourceExtraction.taskResults, { ...context, environmentName: source.connection.name });
    const targetNormalized = normalizeExtraction(targetExtraction.taskResults, { ...context, environmentName: target.connection.name });
    const comparison = compareConfigurations(sourceNormalized.items, targetNormalized.items);
    comparison.warnings.push(...sourceNormalized.warnings.map((warning) => ({ ...warning, side: "SOURCE" })), ...targetNormalized.warnings.map((warning) => ({ ...warning, side: "TARGET" })));
    comparison.summary.warnings = comparison.warnings.length;
    const filename = `ConfigComparison_${safeFilename(source.connection.name)}_vs_${safeFilename(target.connection.name)}_${Date.now()}.xlsx`;
    const outputPath = path.join(__dirname, "..", "..", "output", filename);
    await buildComparisonWorkbook({ comparison, source: source.connection, target: target.connection, context, outputPath });
    const failedTasks = [...sourceExtraction.taskResults, ...targetExtraction.taskResults].filter((task) => task.status === "failed");
    const completedAt = new Date();
    history.lifecycleStatus = "COMPLETED";
    history.status = failedTasks.length ? "partial" : "success";
    history.recordCount = sourceNormalized.items.length + targetNormalized.items.length;
    history.resultSummary = comparison.summary;
    history.warnings = comparison.warnings.slice(0, 100);
    history.outputFile = filename;
    history.completedAt = completedAt;
    history.durationMs = completedAt - startedAt;
    history.errorMessage = failedTasks.length ? `${failedTasks.length} environment task extractions failed.` : null;
    await history.save();
    await writeAudit({ ownerId: session.ownerId, action: "COMPARISON_COMPLETED", metadata: { runId: history.id, summary: comparison.summary, outputFile: filename } });
    return res.json({
      run: history,
      summary: comparison.summary,
      byConfigurationItem: comparison.byConfigurationItem,
      warnings: comparison.warnings,
      results: comparison.results.slice(0, 5000),
      truncated: comparison.results.length > 5000,
      downloadUrl: `/api/reports/${encodeURIComponent(filename)}`,
    });
  } catch (error) {
    if (history) {
      history.lifecycleStatus = "FAILED"; history.status = "failed"; history.errorMessage = error.message;
      history.completedAt = new Date(); history.durationMs = history.completedAt - startedAt; await history.save().catch(() => {});
    }
    await writeAudit({ ownerId: session.ownerId, action: "COMPARISON_FAILED", status: "FAILED", metadata: { runId: history?.id, errorCode: error.code || "COMPARISON_FAILED", message: error.message } });
    const response = errorResponse(error);
    return res.status(response.status).json(response.body);
  }
}

module.exports = { compare };
