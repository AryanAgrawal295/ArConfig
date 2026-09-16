const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTaskResult } = require("../src/normalizationService");
const { inferComparisonKeys } = require("../src/configurationRegistry");

test("normalization converts CSV tables and removes audit fields", () => {
  const normalized = normalizeTaskResult({
    name: "Example Configuration",
    code: "EXAMPLE",
    files: [{ name: "Example.csv", rows: [["Code", "Value", "CreatedBy", "AccessToken"], ["A", "One", "ADMIN", "secret"]] }],
  }, { environmentName: "DEV", functionalArea: { name: "Finance" } });
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].recordKey, "A");
  assert.deepEqual(normalized.records[0].fields, { Code: "A", Value: "One" });
  assert.equal(normalized.records[0].metadata.sourceEnvironment, "DEV");
});

test("registry infers stable name/code keys", () => {
  assert.deepEqual(inferComparisonKeys(["Description", "Payment Term Name", "CreationDate"]), ["Payment Term Name"]);
  assert.deepEqual(inferComparisonKeys(["OrganizationId", "Description"]), ["OrganizationId"]);
  assert.deepEqual(inferComparisonKeys(["LookupType", "LookupCode", "Meaning"]), ["LookupType", "LookupCode"]);
  assert.deepEqual(inferComparisonKeys(["FND_APP_LOOKUP.LookupType", "LookupCode", "Meaning"]), ["FND_APP_LOOKUP.LookupType", "LookupCode"]);
});
