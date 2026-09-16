const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { buildClient, verifyAuth } = require("./auth");
const { writeAudit } = require("./auditService");
const { compareConfigurations } = require("./comparisonEngine");
const { extractConfigurationItems, normalizeSelectedTasks } = require("./configurationExtractionService");
const { loadConfig, parseOrgCodes } = require("./config");
const { getConnectionConfig } = require("./environmentService");
const { AppError } = require("./errors");
const { normalizeExtraction } = require("./normalizationService");
const { getConfigurationItem } = require("./configurationRegistry");
const { buildMigrationWorkbook } = require("./migrationReport");
const { migrateConfiguration, validateMigration } = require("./oracleMigrationAdapter");
const { parseWorkbookBuffer, sha256 } = require("./workbookImportService");
const MigrationPlan = require("./models/MigrationPlan");
const RunHistory = require("./models/RunHistory");
const { startMigrationProgress, updateMigrationProgress } = require("./migrationProgress");

function safeFilename(value) {
  return String(value || "Migration").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "Migration";
}

function stableJson(value) {
  return JSON.stringify(value, (key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((acc, currentKey) => {
      acc[currentKey] = item[currentKey];
      return acc;
    }, {});
  });
}

function makeHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

async function authenticatedConnection(ownerId, id, baseCfg) {
  const stored = await getConnectionConfig(ownerId, id);
  const cfg = { ...baseCfg, ...stored.cfg, missing: [] };
  const client = buildClient(cfg);
  const auth = await verifyAuth(client, cfg);
  if (!auth.ok) throw new AppError("DESTINATION_CONNECTION_FAILED", auth.message || `Authentication failed for ${stored.connection.name}.`, undefined, auth.status);
  return { connection: stored.connection, cfg, client };
}

async function listMigrationSources(ownerId) {
  const runs = await RunHistory.find({
    $or: [{ ownerId }, { ownerId: "" }],
    operation: "EXTRACT",
    outputFile: { $ne: "" },
    status: { $in: ["success", "partial"] },
  }).sort({ createdAt: -1 }).limit(100);
  return runs.map((run) => ({
    id: run.id,
    label: `${run.offeringName || "Snapshot"} · ${run.functionalAreaName || "Selected Tasks"} · ${new Date(run.createdAt).toLocaleString()}`,
    outputFile: run.outputFile,
    offering: { code: run.offeringCode, name: run.offeringName },
    functionalArea: { code: run.functionalAreaCode, name: run.functionalAreaName },
    taskCount: run.taskCount,
    recordCount: run.recordCount,
    createdAt: run.createdAt,
  }));
}

function outputPathFor(filename) {
  const base = path.join(__dirname, "..", "output");
  const cleaned = path.basename(String(filename || ""));
  return path.join(base, cleaned);
}

async function loadExistingExtraction(ownerId, sourceRunId, context) {
  const run = await RunHistory.findOne({
    _id: sourceRunId,
    $or: [{ ownerId }, { ownerId: "" }],
    operation: "EXTRACT",
    outputFile: { $ne: "" },
  });
  if (!run) throw new AppError("INVALID_MIGRATION_SOURCE", "Select a valid extraction run owned by this user.");
  const filePath = outputPathFor(run.outputFile);
  const buffer = await fs.readFile(filePath).catch(() => null);
  if (!buffer) throw new AppError("INVALID_MIGRATION_SOURCE", "The selected extraction workbook is no longer available on disk.");
  const imported = await parseWorkbookBuffer(buffer, {
    filename: run.outputFile,
    functionalArea: context.functionalArea || { name: run.functionalAreaName },
    module: context.module || run.functionalAreaName,
    environmentName: run.sourceConnection?.name || "Existing Extraction",
  });
  return {
    type: "EXTRACTION",
    id: run.id,
    label: run.outputFile,
    sourceHash: imported.sourceHash,
    normalized: imported.normalized,
    metadata: imported.metadata,
  };
}

async function loadUploadedWorkbook(buffer, options, context) {
  const imported = await parseWorkbookBuffer(buffer, {
    filename: options.filename,
    functionalArea: context.functionalArea,
    module: context.module,
    environmentName: "Uploaded Workbook",
  });
  return {
    type: "WORKBOOK",
    label: imported.filename,
    sourceHash: imported.sourceHash,
    normalized: imported.normalized,
    metadata: imported.metadata,
  };
}

function selectedItemIds(tasks) {
  const selected = normalizeSelectedTasks(tasks);
  return new Set(selected.flatMap((task) => {
    const registry = getConfigurationItem(task);
    return [
      registry.id,
      task.code,
      task.name,
      String(task.name || "").toLowerCase(),
      String(task.code || "").toLowerCase(),
    ].filter(Boolean);
  }));
}

function filterRecords(records, selectedIds) {
  if (!selectedIds.size) return records;
  return records.filter((record) =>
    selectedIds.has(record.configurationItem) ||
    selectedIds.has(record.configurationName) ||
    selectedIds.has(String(record.configurationName || "").toLowerCase()) ||
    selectedIds.has(String(record.configurationItem || "").toLowerCase())
  );
}

function operationFromComparison(result) {
  if (result.status === "REMOVED") return "CREATE";
  if (result.status === "MODIFIED") return "UPDATE";
  if (result.status === "UNCHANGED") return "NO_CHANGE";
  if (result.status === "ADDED") return "SKIP_DESTINATION_ONLY";
  return "UNSUPPORTED";
}

async function buildOperations(comparison) {
  const operations = [];
  const blockingErrors = [];
  for (const [index, result] of comparison.results.entries()) {
    const desired = operationFromComparison(result);
    const registry = getConfigurationItem({ name: result.configurationName, code: result.configurationItem }, {
      functionalArea: { name: result.source?.metadata?.functionalArea || result.target?.metadata?.functionalArea },
      module: result.source?.metadata?.module || result.target?.metadata?.module,
    }, Object.keys(result.source?.fields || result.target?.fields || {}));
    const operation = {
      id: `${result.configurationItem}-${index}`,
      operation: desired,
      configurationItem: result.configurationItem,
      configurationName: result.configurationName,
      dataset: result.dataset,
      recordKey: result.recordKey,
      source: result.source,
      target: result.target,
      changes: result.changes || [],
      dependencyOrder: registry.migration?.dependencyOrder || 100,
      reason: desired === "SKIP_DESTINATION_ONLY" ? "Destination-only record; deletes are disabled by default." : "",
      migrationSupported: registry.migrationSupported === true,
    };
    const validation = await validateMigration(operation);
    if (["CREATE", "UPDATE"].includes(desired) && !validation.ok) {
      operation.operation = "UNSUPPORTED";
      operation.reason = validation.message;
      operation.migrationSupported = false;
      blockingErrors.push({
        code: validation.code || "MIGRATION_NOT_SUPPORTED",
        configurationItem: result.configurationItem,
        configurationName: result.configurationName,
        recordKey: result.recordKey,
        message: validation.message,
      });
    }
    operations.push(operation);
  }
  operations.sort((left, right) => (left.dependencyOrder - right.dependencyOrder)
    || String(left.configurationName).localeCompare(String(right.configurationName))
    || String(left.recordKey).localeCompare(String(right.recordKey)));
  return { operations, blockingErrors };
}

function summarizeOperations(operations, extra = {}) {
  const count = (operation) => operations.filter((item) => item.operation === operation).length;
  return {
    requested: operations.length,
    create: count("CREATE"),
    update: count("UPDATE"),
    noChange: count("NO_CHANGE"),
    skip: count("SKIP_DESTINATION_ONLY"),
    unsupported: count("UNSUPPORTED"),
    failed: extra.failed || 0,
    verified: extra.verified || 0,
    verificationFailed: extra.verificationFailed || 0,
  };
}

async function writePlanReport(plan) {
  const filename = `ConfigMigration_${safeFilename(plan.destination?.name)}_${Date.now()}.xlsx`;
  const outputPath = path.join(__dirname, "..", "output", filename);
  await buildMigrationWorkbook({ plan, outputPath });
  plan.reportFile = filename;
  await plan.save();
  return filename;
}

async function createMigrationPlan({ ownerId, requestedBy, body, sourceBuffer, sourceFilename }) {
  const startedAt = new Date();
  const baseCfg = loadConfig();
  const tasks = normalizeSelectedTasks(body.tasks);
  if (!tasks.length) throw new AppError("MIGRATION_PARAMETER_MISSING", "Select at least one configuration item for migration validation.");
  if (!body.destinationConnectionId) throw new AppError("MIGRATION_PARAMETER_MISSING", "Select a destination environment.");
  const context = {
    offering: body.offering || {},
    functionalArea: body.functionalArea || {},
    module: String(body.module || body.functionalArea?.name || ""),
    orgCodes: parseOrgCodes(body.orgCodes),
    allowDelete: false,
  };
  const destination = await authenticatedConnection(ownerId, body.destinationConnectionId, baseCfg);
  const isProd = String(destination.connection.environmentType || "").toUpperCase() === "PROD";
  const warnings = [];
  const blockingErrors = [];
  if (isProd) {
    blockingErrors.push({
      code: "PRODUCTION_MIGRATION_UNAUTHORIZED",
      message: "Production migration is blocked in this phase. Validate in DEV/SIT/UAT first and add explicit production approval controls before enabling execution.",
    });
  }

  const source = sourceBuffer
    ? await loadUploadedWorkbook(sourceBuffer, { filename: sourceFilename }, context)
    : await loadExistingExtraction(ownerId, body.sourceRunId, context);

  const selectedIds = selectedItemIds(tasks);
  const sourceItems = filterRecords(source.normalized.items, selectedIds);
  if (!sourceItems.length) throw new AppError("INVALID_MIGRATION_SOURCE", "The source does not contain records for the selected configuration items.");

  const destinationExtraction = await extractConfigurationItems({
    client: destination.client,
    cfg: destination.cfg,
    tasks,
    orgCodes: context.orgCodes.length ? context.orgCodes : destination.cfg.orgCodes,
  });
  const targetNormalized = normalizeExtraction(destinationExtraction.taskResults, {
    functionalArea: context.functionalArea,
    module: context.module,
    environmentName: destination.connection.name,
  });
  const targetItems = filterRecords(targetNormalized.items, selectedIds);
  const comparison = compareConfigurations(sourceItems, targetItems);
  warnings.push(
    ...source.normalized.warnings.map((warning) => ({ ...warning, side: "SOURCE" })),
    ...targetNormalized.warnings.map((warning) => ({ ...warning, side: "DESTINATION" })),
    ...comparison.warnings
  );
  const planned = await buildOperations(comparison);
  blockingErrors.push(...planned.blockingErrors);
  const planHash = makeHash({
    sourceHash: source.sourceHash,
    destinationId: destination.connection.id,
    context,
    tasks: tasks.map((task) => task.code || task.name),
    operations: planned.operations.map((operation) => ({
      operation: operation.operation,
      configurationItem: operation.configurationItem,
      dataset: operation.dataset,
      recordKey: operation.recordKey,
      changes: operation.changes,
    })),
  });
  const plan = await MigrationPlan.create({
    ownerId,
    status: blockingErrors.length ? "BLOCKED" : "READY",
    source: { type: source.type, id: source.id || "", label: source.label, metadata: source.metadata },
    destination: {
      id: destination.connection.id,
      name: destination.connection.name,
      environmentType: destination.connection.environmentType,
      baseUrl: destination.connection.baseUrl,
    },
    context,
    requestedItems: tasks.map((task) => task.code || task.name),
    sourceHash: source.sourceHash,
    planHash,
    preMigrationSnapshot: {
      capturedAt: new Date().toISOString(),
      destinationConnectionId: destination.connection.id,
      recordCount: targetItems.length,
      extractionTaskCount: destinationExtraction.taskResults.length,
      extractionFailures: destinationExtraction.taskResults.filter((task) => task.status === "failed").map((task) => ({ code: task.code, name: task.name, errorMessage: task.errorMessage })),
    },
    summary: summarizeOperations(planned.operations),
    operations: planned.operations,
    warnings,
    blockingErrors,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  await writePlanReport(plan);
  const history = await RunHistory.create({
    ownerId,
    operation: "MIGRATION",
    lifecycleStatus: plan.status,
    requestedBy,
    targetConnection: plan.destination,
    offeringCode: context.offering.code || "",
    offeringName: context.offering.name || "",
    functionalAreaCode: context.functionalArea.code || "",
    functionalAreaName: context.functionalArea.name || "",
    configurationItems: plan.requestedItems,
    parameters: { orgCodes: context.orgCodes, source: plan.source, planId: plan.id },
    resultSummary: plan.summary,
    warnings: warnings.slice(0, 100),
    startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    taskCount: tasks.length,
    recordCount: sourceItems.length,
    outputFile: plan.reportFile,
    status: plan.status === "READY" ? "success" : "failed",
    errorMessage: blockingErrors.length ? `${blockingErrors.length} blocking migration validation errors.` : null,
  });
  plan.historyRunId = history.id;
  await plan.save();
  await writeAudit({ ownerId, action: "MIGRATION_PREVIEWED", metadata: { migrationId: plan.id, status: plan.status, summary: plan.summary, outputFile: plan.reportFile } });
  return plan;
}

async function executeMigrationPlan({ ownerId, planId, confirmationText }) {
  const plan = await MigrationPlan.findOne({ _id: planId, ownerId }).select("+ownerId");
  if (!plan) throw new AppError("INVALID_MIGRATION_SOURCE", "Migration plan was not found for this user.");
  if (plan.expiresAt < new Date()) throw new AppError("MIGRATION_PLAN_EXPIRED", "Migration plan expired. Validate again before executing.");
  if (!["READY", "PARTIALLY_COMPLETED", "FAILED"].includes(plan.status)) {
    throw new AppError("MIGRATION_VALIDATION_FAILED", "This migration plan is not ready for execution.");
  }
  const expectedText = `MIGRATE TO ${plan.destination.name}`;
  if (confirmationText !== expectedText) {
    throw new AppError("MIGRATION_VALIDATION_FAILED", `Type exactly "${expectedText}" to execute this migration.`);
  }
  const executable = plan.operations.filter((operation) => ["CREATE", "UPDATE"].includes(operation.operation));
  if (!executable.length) throw new AppError("MIGRATION_NOT_SUPPORTED", "This plan has no executable migration operations. Add item-specific Oracle migration handlers first.");
  plan.status = "RUNNING";
  plan.startedAt = new Date();
  await plan.save();
  startMigrationProgress(plan.id, { phase: "running", totalItems: executable.length, message: "Executing migration operations..." });
  const baseCfg = loadConfig();
  const destination = await authenticatedConnection(ownerId, plan.destination.id, baseCfg);
  const executionResults = [];
  for (const [index, operation] of executable.entries()) {
    try {
      const idempotencyKey = sha256(Buffer.from(`${plan.planHash}:${operation.configurationItem}:${operation.dataset}:${operation.recordKey}`));
      const result = await migrateConfiguration({ operation, client: destination.client, cfg: destination.cfg, idempotencyKey });
      executionResults.push({ ...operation, status: "SUCCESS", result });
    } catch (error) {
      executionResults.push({ ...operation, status: "FAILED", errorCode: error.code || "MIGRATION_EXECUTION_FAILED", errorMessage: error.message });
    }
    updateMigrationProgress(plan.id, {
      completedItems: index + 1,
      successfulItems: executionResults.filter((item) => item.status === "SUCCESS").length,
      failedItems: executionResults.filter((item) => item.status === "FAILED").length,
    });
  }
  const failed = executionResults.filter((item) => item.status === "FAILED").length;
  plan.executionResults = executionResults;
  plan.summary = summarizeOperations(plan.operations, { failed });
  plan.status = failed ? "PARTIALLY_COMPLETED" : "COMPLETED";
  plan.completedAt = new Date();
  await writePlanReport(plan);
  await plan.save();
  await RunHistory.updateOne({ _id: plan.historyRunId, ownerId }, {
    lifecycleStatus: plan.status,
    status: failed ? "partial" : "success",
    resultSummary: plan.summary,
    outputFile: plan.reportFile,
    completedAt: plan.completedAt,
    errorMessage: failed ? `${failed} migration operations failed.` : null,
  }).catch(() => {});
  await writeAudit({ ownerId, action: failed ? "MIGRATION_PARTIAL" : "MIGRATION_COMPLETED", metadata: { migrationId: plan.id, summary: plan.summary, outputFile: plan.reportFile } });
  updateMigrationProgress(plan.id, { phase: plan.status.toLowerCase(), message: failed ? "Migration completed with failures." : "Migration completed." });
  return plan;
}

module.exports = { createMigrationPlan, executeMigrationPlan, listMigrationSources };
