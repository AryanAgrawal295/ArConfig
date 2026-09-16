/**
 * src/excelWriter.js
 *
 * Builds the final .xlsx workbook using exceljs (Node equivalent of
 * openpyxl):
 *   - Overview        : run metadata + record counts
 *   - Subinventories  : one row per subinventory
 *   - Locators        : one row per locator
 *
 * Bold + colored header row, frozen header row — same visual pattern as
 * the Python version and the original sample workbook.
 */

const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const logger = require("./logger");
const { buildTaskCustomerView, readableHeaderLabel } = require("./taskCustomerViews");

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8CBAD" },
};

const TITLE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E78" },
};

const SECTION_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF5B9BD5" },
};

const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFD9E2EC" } },
  left: { style: "thin", color: { argb: "FFD9E2EC" } },
  bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
  right: { style: "thin", color: { argb: "FFD9E2EC" } },
};

const AUDIT_COLUMN_NAMES = new Set([
  "createdby",
  "creationdate",
  "lastupdatedby",
  "lastupdatedate",
  "lastupdatelogin",
]);

function writeTable(worksheet, rows) {
  if (!rows || rows.length === 0) return;

  const headers = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("_"))))
  );
  const headerRow = worksheet.addRow(headers);
  styleOracleHeaderRow(headerRow);

  for (const row of rows) {
    styleDataRow(worksheet.addRow(headers.map((h) => normalizeCellValue(row[h]))));
  }

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: Math.max(headers.length, 1) },
  };

  headers.forEach((header, idx) => {
    const col = worksheet.getColumn(idx + 1);
    col.width = Math.max(12, Math.min(40, String(header).length + 4));
  });
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function uniqueDataFiles(files) {
  const signatures = new Set();
  return (files || []).filter((file) => {
    const signature = JSON.stringify(file.rows || []);
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

function safeSheetName(value) {
  const cleaned = String(value || "Task")
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Task").slice(0, 31);
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

function styleHeaderRow(row) {
  styleOracleHeaderRow(row);
}

function styleOracleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF17324D" } };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  row.height = 20;
}

function styleSectionRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = SECTION_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

function styleDataRow(row) {
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "top", wrapText: false };
  });
}

function estimateMaxColumns(files = []) {
  return Math.max(
    2,
    ...files.flatMap((file) => (file.rows || []).slice(0, 1).map((row) => row.length || 1))
  );
}

function addTitleBand(worksheet, title, maxColumns) {
  const row = worksheet.addRow([title]);
  worksheet.mergeCells(row.number, 1, row.number, Math.max(1, maxColumns));
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = TITLE_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  return row;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headers, names) {
  const normalizedNames = new Set(names.map(normalizeHeader));
  return headers.findIndex((header) => normalizedNames.has(normalizeHeader(header)));
}

function buildCategoryDescriptions(files) {
  const descriptions = new Map();

  for (const file of files) {
    const rows = file.rows || [];
    if (rows.length < 2) continue;
    const headers = rows[0];
    const nameIndex = findHeaderIndex(headers, ["CategoryName"]);
    const descriptionIndex = findHeaderIndex(headers, ["CategoryDescription", "Description"]);
    if (nameIndex < 0 || descriptionIndex < 0) continue;

    const languageIndex = findHeaderIndex(headers, ["Language"]);
    const sourceLanguageIndex = findHeaderIndex(headers, ["SourceLang", "SourceLanguage"]);
    for (const values of rows.slice(1)) {
      const name = String(values[nameIndex] || "").trim();
      const description = String(values[descriptionIndex] || "").trim();
      if (!name || !description) continue;
      const language = languageIndex >= 0 ? String(values[languageIndex] || "").trim() : "";
      const sourceLanguage =
        sourceLanguageIndex >= 0 ? String(values[sourceLanguageIndex] || "").trim() : "";
      const preferred = !language || language === sourceLanguage || language === "US";
      if (!descriptions.has(name) || preferred) descriptions.set(name, description);
    }
  }

  return descriptions;
}

function displayRootName(value) {
  return /(^|_)category_hierarchy_root$/i.test(String(value || ""))
    ? "Root Category"
    : String(value || "Root Category");
}

function buildHierarchyCustomerView(files) {
  for (const file of files) {
    const rows = file.rows || [];
    if (rows.length < 2) continue;
    const headers = rows[0];
    const parentIndex = findHeaderIndex(headers, ["ParentCategoryName", "ParentName"]);
    const childIndex = findHeaderIndex(headers, ["ChildCategoryName", "ChildName"]);
    if (parentIndex < 0 || childIndex < 0) continue;

    const codeIndex = findHeaderIndex(headers, ["CategoryCode", "ChildCategoryCode"]);
    const metadataColumns = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header, index }) =>
        index !== parentIndex &&
        index !== childIndex &&
        index !== codeIndex &&
        !AUDIT_COLUMN_NAMES.has(normalizeHeader(header))
      );
    const childrenByParent = new Map();
    const childNames = new Set();
    const allEdges = [];
    for (const [rowIndex, values] of rows.slice(1).entries()) {
      const parent = String(values[parentIndex] || "").trim();
      const child = String(values[childIndex] || "").trim();
      if (!parent || !child) continue;
      const edge = {
        id: rowIndex,
        parent,
        child,
        code: codeIndex >= 0 ? String(values[codeIndex] || "").trim() : "",
        metadata: metadataColumns.map(({ index }) => values[index] ?? ""),
      };
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(edge);
      childNames.add(child);
      allEdges.push(edge);
    }

    const roots = Array.from(childrenByParent.keys()).filter((name) => !childNames.has(name));
    if (!roots.length) continue;

    const paths = [];
    const visitedEdges = new Set();
    function visit(node, root, levels, visited) {
      if (visited.has(node)) return;
      const children = childrenByParent.get(node) || [];
      const nextVisited = new Set(visited);
      nextVisited.add(node);
      for (const edge of children) {
        const nextLevels = [...levels, edge.child];
        paths.push({
          root,
          levels: nextLevels,
          code: edge.code,
          metadata: edge.metadata,
        });
        visitedEdges.add(edge.id);
        visit(edge.child, root, nextLevels, nextVisited);
      }
    }

    for (const root of roots) {
      visit(root, root, [], new Set());
    }
    for (const edge of allEdges.filter((item) => !visitedEdges.has(item.id))) {
      paths.push({
        root: edge.parent,
        levels: [edge.child],
        code: edge.code,
        metadata: edge.metadata,
      });
    }
    if (!paths.length) continue;

    const descriptions = buildCategoryDescriptions(files);
    const maxDepth = Math.max(...paths.map((path) => path.levels.length));
    const pathRows = paths.map((path) => {
      const leafName = path.levels[path.levels.length - 1] || displayRootName(path.root);
      return [
        displayRootName(path.root),
        ...path.levels,
        ...Array(Math.max(0, maxDepth - path.levels.length)).fill(""),
        descriptions.get(leafName) || leafName,
        path.code,
        ...path.metadata,
      ];
    });
    const sections = [{
      title: "Hierarchy Paths",
      headers: [
        "Root Category",
        ...Array.from({ length: maxDepth }, (_, index) => `Level ${index + 1} Category`),
        "Leaf Description",
        "Category Code",
        ...metadataColumns.map(({ header }) => header),
      ],
      rows: pathRows,
    }];

    for (const metadataFile of files.filter((item) => item !== file)) {
      const metadataRows = metadataFile.rows || [];
      if (!metadataRows.length) continue;
      const selectedColumns = metadataRows[0]
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => !AUDIT_COLUMN_NAMES.has(normalizeHeader(header)));
      sections.push({
        title: /TRANSLATION/i.test(metadataFile.name)
          ? "Category Translations"
          : "Category Definitions",
        headers: selectedColumns.map(({ header }) => header),
        rows: metadataRows.slice(1).map((row) =>
          selectedColumns.map(({ index }) => row[index] ?? "")
        ),
      });
    }

    return {
      sourceFile: file.name,
      maxDepth,
      rows: pathRows,
      sections,
    };
  }

  return null;
}

function writeHierarchyCustomerView(worksheet, files) {
  const hierarchy = buildHierarchyCustomerView(files);
  if (!hierarchy) return null;
  return writeStructuredCustomerView(worksheet, {
    title: "Category Hierarchy",
    sections: hierarchy.sections,
  });
}

function writeStructuredCustomerView(worksheet, view) {
  if (!view?.sections?.length) return null;

  const maxColumns = Math.max(2, ...view.sections.map((section) => section.headers.length));
  const titleRow = addTitleBand(worksheet, view.title, maxColumns);
  worksheet.addRow([]);

  let firstHeaderRow = null;
  for (const section of view.sections) {
    const sectionTitleRow = worksheet.addRow([`${section.title} (${section.rows.length} records)`]);
    if (section.headers.length > 2) {
      worksheet.mergeCells(sectionTitleRow.number, 1, sectionTitleRow.number, section.headers.length);
    }
    styleSectionRow(sectionTitleRow);
    const headerRow = worksheet.addRow(section.headers);
    styleHeaderRow(headerRow);
    if (!firstHeaderRow) {
      firstHeaderRow = headerRow;
      worksheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: {
          row: headerRow.number + section.rows.length,
          column: Math.max(section.headers.length, 1),
        },
      };
    }
    for (const values of section.rows) {
      const row = worksheet.addRow(values.map(normalizeCellValue));
      styleDataRow(row);
    }
    worksheet.addRow([]);
  }
  return firstHeaderRow;
}

function finalizeTaskSheet(worksheet, frozenRow) {
  worksheet.views = [{
    state: "frozen",
    ySplit: frozenRow,
  }];
  const maxColumn = Math.max(worksheet.columnCount, 1);
  for (let columnIndex = 1; columnIndex <= maxColumn; columnIndex += 1) {
    const column = worksheet.getColumn(columnIndex);
    let width = 11;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const value = typeof cell.value === "object" && cell.value?.text ? cell.value.text : cell.value;
      width = Math.max(width, Math.min(52, String(value ?? "").length + 2));
    });
    column.width = width;
  }
}

function writeTaskSections(worksheet, taskResult) {
  const files = uniqueDataFiles(taskResult.files);
  const maxColumns = estimateMaxColumns(files);
  addTitleBand(worksheet, taskResult.name, maxColumns);
  worksheet.addRow(["Task", taskResult.name]);
  worksheet.addRow(["Task Code", taskResult.code || "Custom REST extractor"]);
  worksheet.addRow(["Status", taskResult.status]);
  if (taskResult.errorMessage) worksheet.addRow(["Error", taskResult.errorMessage]);
  worksheet.addRow([]);

  const formattedTaskResult = { ...taskResult, files };
  const customerHeaderRow =
    writeHierarchyCustomerView(worksheet, files) ||
    writeStructuredCustomerView(worksheet, buildTaskCustomerView(formattedTaskResult));
  if (customerHeaderRow) {
    finalizeTaskSheet(worksheet, customerHeaderRow.number);
    return;
  }

  const sectionHeaderRow = worksheet.addRow(["Data Sections", "Records"]);
  styleHeaderRow(sectionHeaderRow);
  const sectionIndex = files.map((file) => ({
    file,
    row: worksheet.addRow([
      file.name.replace(/\.csv$/i, ""),
      Math.max(0, (file.rows?.length || 0) - 1),
    ]),
  }));
  worksheet.addRow([]);

  if (!files.length) {
    worksheet.addRow(["No setup data was returned for this task."]);
  }

  const escapedSheetName = worksheet.name.replace(/'/g, "''");
  for (const section of sectionIndex) {
    const { file } = section;
    const sourceRow = worksheet.addRow([file.name.replace(/\.csv$/i, "")]);
    if ((file.rows?.[0]?.length || 0) > 2) {
      worksheet.mergeCells(sourceRow.number, 1, sourceRow.number, file.rows[0].length);
    }
    styleSectionRow(sourceRow);
    section.row.getCell(1).value = {
      text: file.name.replace(/\.csv$/i, ""),
      hyperlink: `#'${escapedSheetName}'!A${sourceRow.number}`,
    };
    section.row.getCell(1).font = {
      color: { argb: "FF245B89" },
      underline: true,
    };

    const rows = file.rows || [];
    if (!rows.length) {
      worksheet.addRow(["No rows returned"]);
      worksheet.addRow([]);
      continue;
    }

    rows.forEach((values, index) => {
      const displayValues = index === 0 ? values.map(readableHeaderLabel) : values;
      const row = worksheet.addRow(displayValues.map(normalizeCellValue));
      if (index === 0) styleHeaderRow(row);
      else styleDataRow(row);
    });
    const backLinkRow = worksheet.addRow([]);
    backLinkRow.getCell(1).value = {
      text: "Back to Data Sections",
      hyperlink: `#'${escapedSheetName}'!A${sectionHeaderRow.number}`,
    };
    backLinkRow.getCell(1).font = {
      color: { argb: "FF245B89" },
      underline: true,
    };
    worksheet.addRow([]);
  }

  finalizeTaskSheet(
    worksheet,
    Math.min(sectionHeaderRow.number + sectionIndex.length, 10)
  );
}

/**
 * Builds the workbook and saves it to outputPath. Returns the path.
 */
async function buildWorkbook({ cfg, orgCodes, subinventoryRows, locatorRows, outputPath }) {
  const workbook = new ExcelJS.Workbook();

  // --- Overview sheet ---
  const overviewSheet = workbook.addWorksheet("Overview");
  const overviewHeader = overviewSheet.addRow(["Field", "Value"]);
  styleHeaderRow(overviewHeader);
  overviewSheet.addRow(["Environment", cfg.baseUrl]);
  overviewSheet.addRow(["Organizations Included", orgCodes.join(", ")]);
  overviewSheet.addRow(["Extraction Date/Time", new Date().toISOString()]);
  overviewSheet.addRow(["Subinventory Records", subinventoryRows.length]);
  overviewSheet.addRow(["Locator Records", locatorRows.length]);
  overviewSheet.getColumn(1).width = 26;
  overviewSheet.getColumn(2).width = 60;
  overviewSheet.views = [{ state: "frozen", ySplit: 1 }];

  // --- Subinventories sheet ---
  const subSheet = workbook.addWorksheet("Subinventories");
  writeTable(subSheet, subinventoryRows);
  if (!subinventoryRows.length) {
    subSheet.addRow(["No subinventory records returned for the selected organization(s)"]);
  }

  // --- Locators sheet ---
  const locSheet = workbook.addWorksheet("Locators");
  writeTable(locSheet, locatorRows);
  if (!locatorRows.length) {
    locSheet.addRow(["No locator records returned (organizations may use Locator Control = None)"]);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  logger.info(`Workbook written to: ${outputPath}`);

  return outputPath;
}

async function buildTaskWorkbook({
  cfg,
  offering,
  functionalArea,
  taskMode,
  orgCodes,
  taskResults,
  outputPath,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConfigSnapshot";
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet("Overview");
  styleHeaderRow(overviewSheet.addRow(["Field", "Value"]));
  overviewSheet.addRow(["Environment", cfg.baseUrl]);
  overviewSheet.addRow(["Setup / Offering", offering?.name || "Not supplied"]);
  overviewSheet.addRow(["Setup / Offering Code", offering?.code || ""]);
  overviewSheet.addRow(["Functional Area", functionalArea?.name || "Selected tasks"]);
  overviewSheet.addRow(["Functional Area Code", functionalArea?.code || ""]);
  overviewSheet.addRow(["Task Selection", taskMode]);
  overviewSheet.addRow(["Organizations / Scope", orgCodes.join(", ") || "Not supplied"]);
  overviewSheet.addRow(["Extraction Date/Time", new Date().toISOString()]);
  overviewSheet.addRow(["Tasks Requested", taskResults.length]);
  overviewSheet.addRow(["Tasks Succeeded", taskResults.filter((task) => task.status === "success").length]);
  overviewSheet.addRow(["Tasks Failed", taskResults.filter((task) => task.status === "failed").length]);
  overviewSheet.addRow([
    "Data Records",
    taskResults.reduce((total, task) => total + (task.recordCount || 0), 0),
  ]);
  overviewSheet.getColumn(1).width = 26;
  overviewSheet.getColumn(2).width = 70;
  overviewSheet.views = [{ state: "frozen", ySplit: 1 }];

  const summarySheet = workbook.addWorksheet("Task Summary");
  writeTable(
    summarySheet,
    taskResults.map((task) => ({
      "Task Name": task.name,
      "Task Code": task.code || "Custom REST extractor",
      Status: task.status,
      Records: task.recordCount || 0,
      "Source Files": task.files?.length || 0,
      Error: task.errorMessage || "",
    }))
  );

  for (const taskResult of taskResults) {
    const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, taskResult.name));
    writeTaskSections(worksheet, taskResult);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  logger.info(`Task workbook written to: ${outputPath}`);
  return outputPath;
}

module.exports = { buildTaskWorkbook, buildWorkbook, normalizeCellValue, safeSheetName };
