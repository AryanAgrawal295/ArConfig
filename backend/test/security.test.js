const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCellValue, safeSheetName } = require("../src/excelWriter");
const { safeMetadata } = require("../src/auditService");
const { redact } = require("../src/logger");

test("Excel formulas are neutralized and sheet names are safe", () => {
  assert.equal(normalizeCellValue("=HYPERLINK(\"bad\")"), "'=HYPERLINK(\"bad\")");
  assert.equal(normalizeCellValue("+1+1"), "'+1+1");
  assert.equal(safeSheetName("Bad/Sheet:*?[]").includes("/"), false);
  assert.ok(safeSheetName("x".repeat(100)).length <= 31);
});

test("audit metadata and logs redact secrets", () => {
  const safe = safeMetadata({ username: "u", password: "secret", nested: { accessToken: "abc", count: 2 } });
  assert.deepEqual(safe, { username: "u", nested: { count: 2 } });
  assert.equal(redact("password=secret token:abc"), "password=[REDACTED] token:[REDACTED]");
});
