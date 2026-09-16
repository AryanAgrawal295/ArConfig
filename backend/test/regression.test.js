const test = require("node:test");
const assert = require("node:assert/strict");
const { taskMatchesArea } = require("../src/setupService");
const { normalizeSelectedTasks } = require("../src/configurationExtractionService");
const { getCatalogTasks, usesExactTaskCatalog } = require("../src/setupTaskCatalog");

test("existing exact task catalogs remain available", () => {
  assert.equal(getCatalogTasks("Approval Management").length, 14);
  assert.equal(getCatalogTasks("Procurement Foundation").length, 15);
  assert.equal(usesExactTaskCatalog("Approval Management"), true);
});

test("existing automatic functional-area matching remains available", () => {
  assert.equal(taskMatchesArea({ TaskName: "Manage Supplier Profile Options", TaskCode: "POZ_PROFILE" }, { name: "Suppliers", code: "SUP" }), true);
  assert.equal(taskMatchesArea({ TaskName: "Manage Receivables Activities", TaskCode: "AR_ACT" }, { name: "Suppliers", code: "SUP" }), false);
});

test("task request validation trims and bounds the existing task selection", () => {
  const tasks = normalizeSelectedTasks([{ code: " CODE ", name: " Task ", exportSupported: true }]);
  assert.deepEqual(tasks, [{ code: "CODE", name: "Task", exportSupported: true, extractor: "" }]);
  assert.equal(normalizeSelectedTasks(Array.from({ length: 120 }, (_, index) => ({ name: `Task ${index}` }))).length, 100);
});
