const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { buildComparisonWorkbook, detailRows, displayFieldName } = require("../src/comparisonReport");

test("comparison report contains summary, detail and formula-safe values", async () => {
  const outputPath = path.join(os.tmpdir(), `configsnapshot-report-${process.pid}-${Date.now()}.xlsx`);
  const comparison = {
    summary: { modified: 1, added: 0, removed: 0, unchanged: 0, warnings: 0 },
    warnings: [],
    results: [{
      configurationItem: "PAYMENT_TERMS", configurationName: "Payment Terms", dataset: "Terms",
      recordKey: "NET30", status: "MODIFIED",
      changes: [{ field: "Description", sourceValue: "=BAD()", targetValue: "Safe" }],
    }, {
      configurationItem: "PAYMENT_TERMS", configurationName: "Payment Terms", dataset: "Terms",
      recordKey: "NEW", status: "ADDED",
      source: null,
      target: { fields: { LookupCode: "NEW", Meaning: "New Value" } },
      changes: [],
    }, {
      configurationItem: "PAYMENT_TERMS", configurationName: "Payment Terms", dataset: "Terms",
      recordKey: "SAME", status: "UNCHANGED",
      source: { fields: { LookupCode: "SAME" } },
      target: { fields: { LookupCode: "SAME" } },
      changes: [],
    }],
  };
  try {
    await buildComparisonWorkbook({ comparison, source: { name: "DEV" }, target: { name: "UAT" }, context: { functionalArea: { name: "Payables" } }, outputPath });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(outputPath);
    assert.ok(workbook.getWorksheet("SUMMARY"));
    const detail = workbook.getWorksheet("Payment Terms");
    assert.equal(detail.getCell("A1").value, "Payment Terms");
    assert.equal(detail.getCell("A3").value, "Record Key");
    assert.equal(detail.getCell("E4").value, "'=BAD()");
    assert.equal(String(detail.getCell("F6").value), "New Value");
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
});

test("comparison detail rows avoid JSON blobs and use readable field labels", () => {
  const rows = detailRows([{
    recordKey: "POZ_VENDOR_TYPE | GOVERNMENT",
    dataset: "ORA_FND_APP_STANDARD_LOOKUP_CODE",
    status: "REMOVED",
    source: { fields: { LookupCode: "GOVERNMENT", StartDateActive: "2010/03/31" } },
    target: null,
  }, {
    recordKey: "POZ_VENDOR_TYPE",
    dataset: "FND_APP_STANDARD_LOOKUP",
    status: "UNCHANGED",
    source: { fields: { LookupType: "POZ_VENDOR_TYPE" } },
    target: { fields: { LookupType: "POZ_VENDOR_TYPE" } },
  }]);

  assert.deepEqual(rows[0], [
    "POZ_VENDOR_TYPE | GOVERNMENT",
    "ORA_FND_APP_STANDARD_LOOKUP_CODE",
    "REMOVED",
    "Lookup Code",
    "GOVERNMENT",
    "",
  ]);
  assert.equal(rows.some((row) => String(row[4]).startsWith("{")), false);
  assert.equal(rows.at(-1)[3], "Record matched");
  assert.equal(displayFieldName("StartDateActive"), "Start Date Active");
});
