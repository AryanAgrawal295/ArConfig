const EXCLUDED_FIELDS = new Set(["links"]);

function normalizeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function mapAllFields(rawRecord, fieldMap = {}, leadingFields = {}, options = {}) {
  const row = {};
  const mappedApiFields = new Set();
  const unmappedPrefix = options.unmappedPrefix || "";
  const mappedValueFormatter = options.mappedValueFormatter || normalizeValue;
  const includeMissingMappedFields = options.includeMissingMappedFields === true;

  for (const [label, value] of Object.entries(leadingFields)) {
    row[label] = normalizeValue(value);
  }

  for (const [label, apiField] of Object.entries(fieldMap)) {
    if (!Object.prototype.hasOwnProperty.call(rawRecord, apiField)) {
      if (includeMissingMappedFields) row[label] = "";
      continue;
    }
    row[label] = mappedValueFormatter(rawRecord[apiField], apiField, label);
    mappedApiFields.add(apiField);
  }

  for (const [apiField, value] of Object.entries(rawRecord)) {
    if (
      EXCLUDED_FIELDS.has(apiField) ||
      apiField.startsWith("_") ||
      mappedApiFields.has(apiField)
    ) {
      continue;
    }
    row[`${unmappedPrefix}${apiField}`] = normalizeValue(value);
  }

  return row;
}

module.exports = { mapAllFields, normalizeValue };
