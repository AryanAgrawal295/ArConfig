const { getCatalogTasks } = require("./setupTaskCatalog");

const KNOWN_ITEMS = {
  "configure subinventories": {
    id: "CONFIGURE_SUBINVENTORIES",
    module: "Inventory Management",
    functionalArea: "Supply Chain",
    comparisonKeys: ["Organization Code", "Subinventory Code"],
    migration: {
      supported: false,
      supportedOperations: [],
      reason: "Extraction is available, but no approved Oracle write handler is configured for subinventory migration.",
      dependencyOrder: 20,
    },
  },
  "manage inventory organizations": {
    id: "MANAGE_INVENTORY_ORGANIZATIONS",
    module: "Facilities",
    functionalArea: "Supply Chain",
    comparisonKeys: ["Organization"],
    migration: {
      supported: false,
      supportedOperations: [],
      reason: "Inventory organization creation/update is not exposed through a safe item-specific migration handler in this project.",
      dependencyOrder: 10,
    },
  },
  "manage payment terms": {
    id: "MANAGE_PAYMENT_TERMS",
    module: "Procurement Foundation",
    functionalArea: "Procurement",
    comparisonKeys: ["PaymentTermName", "Name"],
    migration: {
      supported: false,
      supportedOperations: [],
      reason: "Payment terms can be extracted and compared, but migration requires an Oracle write/import handler that is not configured yet.",
      dependencyOrder: 30,
    },
  },
};

const KEY_PRIORITIES = [
  /(^|\s|_)?(code|name|number)$/i,
  /(^|\s|_)?(key|identifier)$/i,
  /(^|\s|_)?id$/i,
];

const COMPOSITE_KEY_CANDIDATES = [
  ["LookupType", "LookupCode"],
  ["LookupType", "Meaning"],
  ["ProfileOptionName", "ApplicationId", "LevelName", "LevelValue"],
  ["ValueSetCode", "Value"],
  ["ValueSetCode", "ValueSetValue"],
  ["FlexfieldCode", "ContextCode", "SegmentCode"],
  ["CategorySetCode", "CategoryCode"],
  ["CategoryName", "ChildCategoryName"],
  ["ParentCategoryName", "ChildCategoryName"],
  ["BusinessUnitName", "DocumentStyle"],
  ["BusinessUnitName", "ProcurementBU"],
  ["Business Unit", "Name"],
  ["Organization Code", "Subinventory Code"],
  ["Organization", "Subinventory Code"],
];

function normalizeCode(value) {
  return String(value || "CONFIGURATION_ITEM")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function inferComparisonKeys(headers = []) {
  const safeHeaders = headers.filter((header) => !/created|updated|date|description|meaning|status/i.test(header));
  for (const candidate of COMPOSITE_KEY_CANDIDATES) {
    const resolved = candidate
      .map((header) => resolveHeader(headers, header))
      .filter(Boolean);
    if (resolved.length >= 2) return resolved;
  }
  for (const pattern of KEY_PRIORITIES) {
    const matches = safeHeaders.filter((header) => pattern.test(header));
    if (matches.length) return matches.slice(0, 3);
  }
  return safeHeaders.slice(0, 1);
}

function normalizeHeaderForMatch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveHeader(headers, expected) {
  const normalizedExpected = normalizeHeaderForMatch(expected);
  return headers.find((header) => {
    const normalizedHeader = normalizeHeaderForMatch(header);
    return normalizedHeader === normalizedExpected || normalizedHeader.endsWith(normalizedExpected);
  });
}

function getConfigurationItem(task, context = {}, headers = []) {
  const known = KNOWN_ITEMS[String(task?.name || "").trim().toLowerCase()] || {};
  const id = normalizeCode(task?.code || known.id || task?.name);
  const definedKeys = (known.comparisonKeys || []).filter((key) => headers.includes(key));
  const migration = {
    supported: false,
    supportedOperations: [],
    reason: "No item-specific Oracle migration handler is configured for this setup task.",
    writableFields: [],
    readOnlyFields: ["createdby", "creationdate", "lastupdatedby", "lastupdatedate", "lastupdatelogin"],
    dependencyOrder: 100,
    ...(known.migration || {}),
  };
  return {
    id,
    code: task?.code || id,
    displayName: task?.name || id,
    functionalArea: context.functionalArea?.name || known.functionalArea || "Unclassified",
    module: context.module || context.functionalArea?.name || known.module || "Unclassified",
    aliases: [],
    requiredParameters: task?.extractor === "subinventories" || task?.extractor === "inventoryOrganizations" ? ["orgCodes"] : [],
    supportedOperations: migration.supported ? ["EXTRACT", "COMPARE", "MIGRATE"] : ["EXTRACT", "COMPARE"],
    sensitiveFields: [],
    comparisonKeys: definedKeys.length ? definedKeys : inferComparisonKeys(headers),
    comparisonRules: {
      default: { trimWhitespace: true },
      fields: {},
    },
    migration,
    migrationSupported: migration.supported,
  };
}

function listRegistryArea(functionalAreaName) {
  return getCatalogTasks(functionalAreaName).map((task) => getConfigurationItem(task, {
    functionalArea: { name: functionalAreaName },
  }));
}

module.exports = { getConfigurationItem, inferComparisonKeys, listRegistryArea, normalizeCode };
