const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const { normalizeCellValue, safeSheetName } = require("./excelWriter");
const { readableHeaderLabel } = require("./taskCustomerViews");

const COLORS = {
  title: "FF1F4E78",
  header: "FFF8CBAD",
  modified: "FFFFF2CC",
  added: "FFE2F0D9",
  removed: "FFFCE4D6",
  unchanged: "FFEAF4EA",
  border: "FFD9E2EC",
  text: "FF17324D",
  white: "FFFFFFFF",
};

const BORDER = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

const STATUS_FILL = {
  MODIFIED: COLORS.modified,
  ADDED: COLORS.added,
  REMOVED: COLORS.removed,
  UNCHANGED: COLORS.unchanged,
};

function fill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeader(row) {
  row.height = 21;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.text } };
    cell.fill = fill(COLORS.header);
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

function styleData(row, statusColumn = 3) {
  row.eachCell((cell, columnNumber) => {
    cell.border = BORDER;
    cell.alignment = { vertical: "top", wrapText: true };
    if (columnNumber === statusColumn && STATUS_FILL[cell.value]) {
      cell.font = { bold: true, color: { argb: COLORS.text } };
      cell.fill = fill(STATUS_FILL[cell.value]);
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  });
}

function addTitle(sheet, title, columnCount) {
  const row = sheet.addRow([title]);
  sheet.mergeCells(row.number, 1, row.number, Math.max(1, columnCount));
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 13 };
    cell.fill = fill(COLORS.title);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function addTable(sheet, headers, rows, options = {}) {
  if (options.title) {
    addTitle(sheet, options.title, headers.length);
    sheet.addRow([]);
  }

  const headerRow = sheet.addRow(headers);
  styleHeader(headerRow);
  for (const values of rows) {
    styleData(sheet.addRow(values.map(normalizeCellValue)), options.statusColumn || 3);
  }

  if (rows.length) {
    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number, column: headers.length },
    };
  }
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  if (options.widths) setWidths(sheet, options.widths);
  else autoFit(sheet);
}

function autoFit(sheet) {
  for (let index = 1; index <= Math.max(sheet.columnCount, 1); index += 1) {
    const column = sheet.getColumn(index);
    let width = 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const value = typeof cell.value === "object" && cell.value?.text ? cell.value.text : cell.value;
      width = Math.max(width, Math.min(55, String(value ?? "").length + 2));
    });
    column.width = width;
  }
}

function displayFieldName(field) {
  return readableHeaderLabel(field);
}

function nonEmptyFieldEntries(record) {
  return Object.entries(record?.fields || {})
    .filter(([, value]) => value !== "" && value != null)
    .sort(([left], [right]) => displayFieldName(left).localeCompare(displayFieldName(right)));
}

function detailRows(results) {
  const rows = [];
  for (const result of results) {
    if (result.status === "MODIFIED") {
      result.changes.forEach((change) => rows.push([
        result.recordKey,
        result.dataset,
        result.status,
        displayFieldName(change.field),
        change.sourceValue,
        change.targetValue,
      ]));
      continue;
    }

    if (result.status === "ADDED" || result.status === "REMOVED") {
      const record = result.status === "ADDED" ? result.target : result.source;
      const entries = nonEmptyFieldEntries(record);
      if (!entries.length) {
        rows.push([
          result.recordKey,
          result.dataset,
          result.status,
          "Record",
          result.status === "REMOVED" ? "Present" : "",
          result.status === "ADDED" ? "Present" : "",
        ]);
      }
      for (const [field, value] of entries) {
        rows.push([
          result.recordKey,
          result.dataset,
          result.status,
          displayFieldName(field),
          result.status === "REMOVED" ? value : "",
          result.status === "ADDED" ? value : "",
        ]);
      }
      continue;
    }

    rows.push([result.recordKey, result.dataset, result.status, "Record matched", "", ""]);
  }
  return rows;
}

function addSummarySheet(workbook, { comparison, source, target, context }) {
  const sheet = workbook.addWorksheet("SUMMARY");
  addTable(sheet, ["Field", "Value"], [
    ["Source Environment", source.name],
    ["Target Environment", target.name],
    ["Functional Area", context.functionalArea?.name || ""],
    ["Module", context.module || ""],
    ["Generated At", new Date().toISOString()],
    ["Total Source Records", comparison.summary.totalSourceRecords],
    ["Total Target Records", comparison.summary.totalTargetRecords],
    ["Modified", comparison.summary.modified],
    ["Added", comparison.summary.added],
    ["Removed", comparison.summary.removed],
    ["Unchanged", comparison.summary.unchanged],
    ["Warnings", comparison.summary.warnings],
  ], {
    title: "Configuration Comparison Summary",
    widths: [28, 52],
    statusColumn: 0,
  });

  sheet.addRow([]);
  const perItemRows = Object.entries(comparison.byConfigurationItem || {}).map(([code, item]) => [
    item.name || code,
    item.modified || 0,
    item.added || 0,
    item.removed || 0,
    item.unchanged || 0,
  ]);
  if (perItemRows.length) {
    addTable(sheet, ["Configuration Item", "Modified", "Added", "Removed", "Unchanged"], perItemRows, {
      widths: [42, 14, 14, 14, 14],
      statusColumn: 0,
    });
  }
}

function uniqueSheetName(workbook, preferredName) {
  const base = safeSheetName(preferredName);
  let candidate = base;
  let suffix = 2;
  while (workbook.getWorksheet(candidate)) {
    const marker = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  return candidate;
}

async function buildComparisonWorkbook({ comparison, source, target, context, outputPath }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConfigSnapshot";
  workbook.created = new Date();

  addSummarySheet(workbook, { comparison, source, target, context });

  const grouped = new Map();
  for (const result of comparison.results) {
    const list = grouped.get(result.configurationItem) || [];
    list.push(result);
    grouped.set(result.configurationItem, list);
  }

  for (const [configurationItem, results] of grouped) {
    addTable(
      workbook.addWorksheet(uniqueSheetName(workbook, results[0]?.configurationName || configurationItem)),
      ["Record Key", "Dataset", "Status", "Field", `${source.name} Value`, `${target.name} Value`],
      detailRows(results),
      {
        title: results[0]?.configurationName || configurationItem,
        widths: [34, 32, 16, 30, 44, 44],
      }
    );
  }

  if (comparison.warnings.length) {
    addTable(
      workbook.addWorksheet("Warnings"),
      ["Code", "Side", "Key", "Message"],
      comparison.warnings.map((warning) => [
        warning.code,
        warning.side || "",
        warning.key || "",
        warning.message || "",
      ]),
      {
        title: "Comparison Warnings",
        widths: [30, 16, 48, 70],
        statusColumn: 0,
      }
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = { buildComparisonWorkbook, detailRows, displayFieldName };
