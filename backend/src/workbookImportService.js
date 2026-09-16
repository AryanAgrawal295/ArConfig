const crypto = require("crypto");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { AppError } = require("./errors");
const { normalizeExtraction } = require("./normalizationService");
const { normalizeCode } = require("./configurationRegistry");

const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024;
const MAX_WORKSHEETS = 150;
const MAX_ROWS_PER_SHEET = 20000;
const MAX_CELLS = 600000;
const RESERVED_SHEETS = new Set(["overview", "task summary", "summary", "warnings", "validation"]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeFilename(value) {
  return String(value || "uploaded.xlsx").replace(/[/\\]/g, "").slice(0, 160);
}

function validationError(code, message, details = {}) {
  return { code, message, ...details };
}

async function assertNoMacros(buffer, filename) {
  if (/\.xlsm$/i.test(filename)) throw new AppError("INVALID_WORKBOOK", "Macro-enabled workbooks are not accepted.");
  const zip = await JSZip.loadAsync(buffer);
  const hasMacro = Object.keys(zip.files).some((name) => /vbaproject\.bin$/i.test(name));
  if (hasMacro) throw new AppError("INVALID_WORKBOOK", "Workbook contains macros and cannot be used as migration input.");
}

function cellValue(cell, location, errors) {
  const value = cell.value;
  if (value && typeof value === "object") {
    if (value.formula || value.sharedFormula) {
      errors.push(validationError("SUSPICIOUS_CELL_VALUE", "Formula cells are not allowed in migration workbooks.", { location }));
      return "";
    }
    if (value.richText) return value.richText.map((part) => part.text || "").join("");
    if (value.text) return value.text;
    if (value.result !== undefined) return value.result;
    if (value.hyperlink) return value.text || value.hyperlink;
  }
  return value == null ? "" : value;
}

function rowValues(row, errors) {
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    values[colNumber - 1] = cellValue(cell, `${row.worksheet.name}!${cell.address}`, errors);
  });
  return values.map((value) => typeof value === "string" ? value.trim() : value);
}

function isHeaderRow(values) {
  const populated = values.filter((value) => String(value ?? "").trim()).length;
  if (populated < 2) return false;
  const text = values.map((value) => String(value || "").toLowerCase());
  if (text.some((value) => /record key|dataset|status|field|source|target/.test(value))) return false;
  return text.some((value) => /name|code|type|value|description|organization|business|sequence|date|enabled|lookup|meaning/.test(value));
}

function normalizeHeaders(values) {
  const seen = new Map();
  return values.map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim();
    const count = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

function extractTablesFromSheet(sheet, errors) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => rows.push({ number: row.number, values: rowValues(row, errors) }));
  const files = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (!isHeaderRow(row.values)) {
      index += 1;
      continue;
    }
    const headers = normalizeHeaders(row.values);
    const dataRows = [];
    index += 1;
    while (index < rows.length) {
      const current = rows[index].values;
      const populated = current.filter((value) => String(value ?? "").trim()).length;
      if (!populated) break;
      if (dataRows.length && isHeaderRow(current)) break;
      dataRows.push(headers.map((_header, colIndex) => current[colIndex] ?? ""));
      index += 1;
    }
    if (dataRows.length) files.push({ name: `${sheet.name}${files.length ? ` ${files.length + 1}` : ""}.csv`, rows: [headers, ...dataRows] });
  }
  return files;
}

async function parseWorkbookBuffer(buffer, options = {}) {
  const filename = safeFilename(options.filename);
  if (!buffer || !Buffer.isBuffer(buffer)) throw new AppError("INVALID_WORKBOOK", "Upload a valid .xlsx workbook.");
  if (buffer.length > MAX_WORKBOOK_BYTES) throw new AppError("INVALID_WORKBOOK", "Workbook is too large for safe migration validation.");
  await assertNoMacros(buffer, filename);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (!workbook.worksheets.length) throw new AppError("INVALID_WORKBOOK", "Workbook has no worksheets.");
  if (workbook.worksheets.length > MAX_WORKSHEETS) throw new AppError("INVALID_WORKBOOK", "Workbook has too many worksheets.");

  const errors = [];
  const taskResults = [];
  let totalCells = 0;
  for (const sheet of workbook.worksheets) {
    totalCells += sheet.rowCount * Math.max(1, sheet.columnCount);
    if (totalCells > MAX_CELLS) errors.push(validationError("WORKBOOK_TOO_LARGE", "Workbook contains too many populated cells."));
    if (sheet.rowCount > MAX_ROWS_PER_SHEET) errors.push(validationError("WORKBOOK_TOO_LARGE", `${sheet.name} has too many rows.`, { sheet: sheet.name }));
    if (RESERVED_SHEETS.has(String(sheet.name || "").trim().toLowerCase())) continue;
    const files = extractTablesFromSheet(sheet, errors);
    if (files.length) {
      taskResults.push({
        name: sheet.name,
        code: normalizeCode(sheet.name),
        status: "success",
        files,
      });
    }
  }

  if (!taskResults.length) {
    errors.push(validationError("INVALID_WORKBOOK_STRUCTURE", "No data tables were found in workbook task sheets."));
  }
  if (errors.length) throw new AppError("INVALID_WORKBOOK", "Workbook failed migration validation.", errors, 422);

  const context = {
    functionalArea: { name: options.functionalArea?.name || options.functionalAreaName || "Workbook Import" },
    module: options.module || options.functionalArea?.name || "Workbook Import",
    environmentName: options.environmentName || "Workbook",
  };
  const normalized = normalizeExtraction(taskResults, context);
  return {
    sourceHash: sha256(buffer),
    filename,
    taskResults,
    normalized,
    metadata: {
      worksheetCount: workbook.worksheets.length,
      recordCount: normalized.items.length,
      warnings: normalized.warnings,
    },
  };
}

module.exports = { parseWorkbookBuffer, sha256 };
