const test = require("node:test");
const assert = require("node:assert/strict");
const { compareConfigurations, normalizeComparable } = require("../src/comparisonEngine");

function record(recordKey, fields, options = {}) {
  return {
    configurationItem: options.item || "PAYMENT_TERMS",
    configurationName: options.name || "Payment Terms",
    dataset: options.dataset || "Terms",
    recordKey,
    fields,
    comparisonRules: options.rules || { default: { trimWhitespace: true }, fields: {} },
  };
}

test("comparison is deterministic and independent of array order", () => {
  const source = [record("A", { Name: "A", Days: 10 }), record("B", { Name: "B", Days: 20 })];
  const target = [record("B", { Name: "B", Days: 20 }), record("A", { Name: "A", Days: 10 })];
  const result = compareConfigurations(source, target);
  assert.equal(result.summary.unchanged, 2);
  assert.equal(result.summary.modified, 0);
});

test("comparison returns added, removed, modified and exact field changes", () => {
  const result = compareConfigurations(
    [record("removed", { Name: "removed" }), record("changed", { Name: "changed", Days: 10 }), record("same", { Name: "same" })],
    [record("added", { Name: "added" }), record("changed", { Name: "changed", Days: 30 }), record("same", { Name: "same" })]
  );
  assert.deepEqual({ added: result.summary.added, removed: result.summary.removed, modified: result.summary.modified, unchanged: result.summary.unchanged }, { added: 1, removed: 1, modified: 1, unchanged: 1 });
  const modified = result.results.find((item) => item.status === "MODIFIED");
  assert.deepEqual(modified.changes, [{ field: "Days", sourceValue: 10, targetValue: 30 }]);
});

test("field rules normalize null, booleans, numerics, whitespace, case and dates", () => {
  assert.equal(normalizeComparable(null), "");
  assert.equal(normalizeComparable(" yes ", { booleanComparison: true }), true);
  assert.equal(normalizeComparable("100", { numericComparison: true }), 100);
  assert.equal(normalizeComparable(" AbC ", { caseSensitive: false }), "abc");
  assert.equal(normalizeComparable("2025-01-01", { dateNormalization: true }), new Date("2025-01-01").toISOString());
});

test("duplicate comparison keys are detected instead of silently overwritten", () => {
  const result = compareConfigurations([record("A", { Value: 1 }), record("A", { Value: 2 })], []);
  assert.equal(result.summary.removed, 2);
  assert.equal(result.warnings[0].code, "DUPLICATE_COMPARISON_KEY");
  assert.equal(result.warnings[0].count, 2);
});

test("empty source and target edge cases are summarized", () => {
  assert.equal(compareConfigurations([], [record("A", {})]).summary.added, 1);
  assert.equal(compareConfigurations([record("A", {})], []).summary.removed, 1);
  assert.equal(compareConfigurations([], []).results.length, 0);
});
