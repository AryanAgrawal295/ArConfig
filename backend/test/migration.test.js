const assert = require("node:assert/strict");
const test = require("node:test");
const ExcelJS = require("exceljs");
const { getConfigurationItem } = require("../src/configurationRegistry");
const { parseWorkbookBuffer } = require("../src/workbookImportService");

async function workbookBuffer({ formula = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Manage Payment Terms");
  sheet.addRow(["Name", "Description", "Start Date"]);
  sheet.addRow(["Net 30", formula ? { formula: "1+1", result: "Two" } : "Thirty day terms", "2026-01-01"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("migration registry exposes safe unsupported migration metadata by default", () => {
  const item = getConfigurationItem({ name: "Manage Payment Terms" }, {}, ["Name", "Description"]);
  assert.equal(item.supportedOperations.includes("EXTRACT"), true);
  assert.equal(item.supportedOperations.includes("COMPARE"), true);
  assert.equal(item.supportedOperations.includes("MIGRATE"), false);
  assert.equal(item.migrationSupported, false);
  assert.match(item.migration.reason, /write|migration/i);
});

test("workbook import parses task sheets into normalized records", async () => {
  const parsed = await parseWorkbookBuffer(await workbookBuffer(), {
    filename: "source.xlsx",
    functionalArea: { name: "Procurement Foundation" },
    module: "Procurement Foundation",
  });
  assert.equal(parsed.filename, "source.xlsx");
  assert.equal(parsed.normalized.items.length, 1);
  assert.equal(parsed.normalized.items[0].configurationName, "Manage Payment Terms");
  assert.equal(parsed.normalized.items[0].fields.Name, "Net 30");
});

test("workbook import rejects formula cells instead of trusting spreadsheet execution", async () => {
  const buffer = await workbookBuffer({ formula: true });
  await assert.rejects(
    () => parseWorkbookBuffer(buffer, { filename: "source.xlsx" }),
    (error) => {
      assert.equal(error.code, "INVALID_WORKBOOK");
      assert.equal(error.details.some((detail) => detail.code === "SUSPICIOUS_CELL_VALUE"), true);
      return true;
    }
  );
});
