const { resolveOrgCodes } = require("./orgResolver");
const { extractSubinventories } = require("./extractors/subinventories");
const { extractLocators } = require("./extractors/locators");
const { extractInventoryOrganizations } = require("./extractors/inventoryOrganizations");
const { supplementSupplierProfileOptions } = require("./extractors/profileOptions");
const { exportTaskCsv, isTransientNetworkError } = require("./taskExportService");
const logger = require("./logger");

function objectRowsToTable(rows) {
  if (!rows.length) return [];
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("_")))));
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))];
}

function countTaskRecords(files) {
  return (files || []).reduce((total, file) => total + Math.max(0, (file.rows?.length || 0) - 1), 0);
}

function normalizeSelectedTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((task) => ({
    code: String(task?.code || "").trim(),
    name: String(task?.name || "").trim(),
    exportSupported: task?.exportSupported !== false,
    extractor: String(task?.extractor || "").trim(),
  })).filter((task) => task.name).slice(0, 100);
}

function isTask(task, extractor, name) {
  return task.extractor === extractor || task.name.trim().toLowerCase() === name;
}

function isSubinventoryTask(task) { return isTask(task, "subinventories", "configure subinventories"); }
function isInventoryOrganizationTask(task) { return isTask(task, "inventoryOrganizations", "manage inventory organizations"); }

async function extractOneTask(client, cfg, resolvedOrgCodes, task) {
  if (isSubinventoryTask(task)) {
    const subinventoryRows = await extractSubinventories(client, cfg, resolvedOrgCodes);
    const locatorRows = await extractLocators(client, cfg, subinventoryRows);
    return {
      ...task,
      code: task.code || "CONFIGURE_SUBINVENTORIES_REST",
      files: [
        { name: "Subinventories.csv", rows: objectRowsToTable(subinventoryRows) },
        { name: "Locators.csv", rows: objectRowsToTable(locatorRows) },
      ],
      subinventoryCount: subinventoryRows.length,
      locatorCount: locatorRows.length,
    };
  }
  if (isInventoryOrganizationTask(task)) {
    const rows = await extractInventoryOrganizations(client, cfg, resolvedOrgCodes);
    return {
      ...task,
      code: task.code || "MANAGE_INVENTORY_ORGANIZATIONS_REST",
      files: [{ name: "InventoryOrganizations.csv", rows: objectRowsToTable(rows) }],
      inventoryOrganizationCount: rows.length,
    };
  }
  if (!task.code || !task.exportSupported) throw new Error("This task does not support Oracle CSV setup export in this environment.");
  let extracted = await exportTaskCsv(client, cfg, task);
  if (task.name.trim().toLowerCase() === "manage supplier profile options") {
    extracted = { ...extracted, files: await supplementSupplierProfileOptions(client, extracted.files) };
  }
  return extracted;
}

async function extractConfigurationItems({ client, cfg, tasks, orgCodes, onTaskStart, onTaskFinish }) {
  const selectedTasks = normalizeSelectedTasks(tasks);
  const needsOrganizationScope = selectedTasks.some((task) => isSubinventoryTask(task) || isInventoryOrganizationTask(task));
  const resolvedOrgCodes = needsOrganizationScope ? await resolveOrgCodes(client, cfg, orgCodes || cfg.orgCodes) : (orgCodes || cfg.orgCodes);
  const taskResults = [];
  let connectionFailure = "";
  for (const [index, task] of selectedTasks.entries()) {
    if (onTaskStart) onTaskStart(task, index);
    let result;
    if (connectionFailure) {
      result = { ...task, status: "failed", recordCount: 0, files: [], errorMessage: `Skipped because the Oracle connection was lost. ${connectionFailure}` };
    } else {
      try {
        const extracted = await extractOneTask(client, cfg, resolvedOrgCodes, task);
        result = { ...extracted, status: "success", recordCount: countTaskRecords(extracted.files), errorMessage: "" };
      } catch (error) {
        logger.error(`Task extraction failed for ${task.name}: ${error.message}`);
        if (isTransientNetworkError(error)) connectionFailure = error.message;
        result = { ...task, status: "failed", recordCount: 0, files: [], errorMessage: error.message };
      }
    }
    taskResults.push(result);
    if (onTaskFinish) onTaskFinish(task, index, result);
  }
  return { resolvedOrgCodes, selectedTasks, taskResults };
}

module.exports = { countTaskRecords, extractConfigurationItems, normalizeSelectedTasks, objectRowsToTable };
