function normalizeComparable(value, rules = {}) {
  if (value == null) return "";
  let normalized = value;
  if (rules.trimWhitespace !== false && typeof normalized === "string") normalized = normalized.trim();
  if (rules.booleanComparison) {
    const lowered = String(normalized).toLowerCase();
    if (["true", "y", "yes", "1"].includes(lowered)) return true;
    if (["false", "n", "no", "0"].includes(lowered)) return false;
  }
  if (rules.numericComparison && normalized !== "" && Number.isFinite(Number(normalized))) return Number(normalized);
  if (rules.dateNormalization && normalized !== "" && !Number.isNaN(Date.parse(normalized))) return new Date(normalized).toISOString();
  if (rules.caseSensitive === false && typeof normalized === "string") return normalized.toLowerCase();
  if (typeof normalized === "object") return JSON.stringify(normalized, Object.keys(normalized).sort());
  return normalized;
}

function compositeKey(record) {
  return `${record.configurationItem}::${record.dataset}::${record.recordKey}`;
}

function buildRecordMap(records, side, warnings) {
  const grouped = new Map();
  for (const record of records) {
    const key = compositeKey(record);
    const group = grouped.get(key) || [];
    group.push(record);
    grouped.set(key, group);
  }
  const map = new Map();
  for (const [key, group] of grouped) {
    if (group.length > 1) {
      warnings.push({
        code: "DUPLICATE_COMPARISON_KEY",
        side,
        key,
        count: group.length,
        message: `${side} contains ${group.length} records for comparison key ${key}.`,
      });
    }
    const ordered = [...group].sort((left, right) => {
      const canonical = (record) => JSON.stringify(Object.keys(record.fields || {}).sort().map((field) => [field, record.fields[field]]));
      return canonical(left).localeCompare(canonical(right));
    });
    ordered.forEach((record, index) => map.set(ordered.length === 1 ? key : `${key}::DUPLICATE_${index + 1}`, record));
  }
  return map;
}

function compareFields(source, target) {
  const names = new Set([...Object.keys(source.fields || {}), ...Object.keys(target.fields || {})]);
  const changes = [];
  for (const field of names) {
    const rules = {
      ...(source.comparisonRules?.default || {}),
      ...(source.comparisonRules?.fields?.[field] || {}),
      ...(target.comparisonRules?.fields?.[field] || {}),
    };
    const sourceValue = source.fields?.[field] ?? "";
    const targetValue = target.fields?.[field] ?? "";
    if (normalizeComparable(sourceValue, rules) !== normalizeComparable(targetValue, rules)) {
      changes.push({ field, sourceValue, targetValue });
    }
  }
  return changes;
}

function compareConfigurations(sourceRecords = [], targetRecords = []) {
  const warnings = [];
  const sourceMap = buildRecordMap(sourceRecords, "SOURCE", warnings);
  const targetMap = buildRecordMap(targetRecords, "TARGET", warnings);
  const results = [];
  let matched = 0;

  for (const [key, source] of sourceMap) {
    const target = targetMap.get(key);
    if (!target) {
      results.push({ configurationItem: source.configurationItem, configurationName: source.configurationName, dataset: source.dataset, recordKey: source.recordKey, status: "REMOVED", source, target: null, changes: [] });
      continue;
    }
    matched += 1;
    const changes = compareFields(source, target);
    results.push({ configurationItem: source.configurationItem, configurationName: source.configurationName, dataset: source.dataset, recordKey: source.recordKey, status: changes.length ? "MODIFIED" : "UNCHANGED", source, target, changes });
  }
  for (const [key, target] of targetMap) {
    if (!sourceMap.has(key)) results.push({ configurationItem: target.configurationItem, configurationName: target.configurationName, dataset: target.dataset, recordKey: target.recordKey, status: "ADDED", source: null, target, changes: [] });
  }

  const count = (status) => results.filter((item) => item.status === status).length;
  const byConfigurationItem = {};
  for (const result of results) {
    const summary = byConfigurationItem[result.configurationItem] || { name: result.configurationName, modified: 0, added: 0, removed: 0, unchanged: 0 };
    summary[result.status.toLowerCase()] += 1;
    byConfigurationItem[result.configurationItem] = summary;
  }
  return {
    summary: {
      totalSourceRecords: sourceRecords.length,
      totalTargetRecords: targetRecords.length,
      matched,
      modified: count("MODIFIED"),
      added: count("ADDED"),
      removed: count("REMOVED"),
      unchanged: count("UNCHANGED"),
      warnings: warnings.length,
    },
    byConfigurationItem,
    results,
    warnings,
  };
}

module.exports = { compareConfigurations, compareFields, normalizeComparable };
