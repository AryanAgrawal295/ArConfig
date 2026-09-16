const { getAllPages } = require("./fusionClient");
const { getCatalogTasks, usesExactTaskCatalog } = require("./setupTaskCatalog");
const { getOfferingFunctionalAreaNames } = require("./setupOfferingCatalog");

const TASK_CACHE_TTL_MS = 5 * 60 * 1000;
const taskCache = new Map();
const GENERIC_AREA_WORDS = new Set([
  "and",
  "for",
  "management",
  "manage",
  "setup",
  "configuration",
  "foundation",
  "advanced",
]);

function escapeQueryValue(value) {
  return String(value || "").replace(/'/g, "''");
}

function mapTask(raw, additions = {}) {
  return {
    code: raw.TaskCode,
    name: raw.TaskName,
    available: raw.AvailableFlag === "Y",
    exportSupported: raw.CSVExportImportSupportedFlag === "Y",
    ...additions,
  };
}

function wordForms(value) {
  const word = String(value || "").toLowerCase();
  const forms = new Set([word]);
  if (word.endsWith("ies") && word.length > 4) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("s") && !word.endsWith("ss") && word !== "status" && word.length > 4) {
    forms.add(word.slice(0, -1));
  }
  return forms;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function getAreaTerms(functionalArea = {}) {
  const nameWords = tokenize(functionalArea.name).filter(
    (word) => word.length > 2 && !GENERIC_AREA_WORDS.has(word)
  );
  return nameWords.map((word) => wordForms(word));
}

function getAreaCodeAliases(functionalArea, areaTerms) {
  const expandedTerms = areaTerms.flatMap((forms) => Array.from(forms));
  return tokenize(functionalArea.code).filter(
    (codeWord) =>
      codeWord.length >= 3 &&
      codeWord !== "ora" &&
      expandedTerms.some((term) => term.startsWith(codeWord))
  );
}

function taskMatchesArea(task, functionalArea) {
  const areaTerms = getAreaTerms(functionalArea);
  if (!areaTerms.length) return false;

  const taskNameWords = tokenize(task.TaskName);
  const taskCodeWords = tokenize(task.TaskCode);
  const taskWords = new Set([...taskNameWords, ...taskCodeWords]);
  const codeAliases = getAreaCodeAliases(functionalArea, areaTerms);
  if (codeAliases.some((alias) => taskCodeWords.includes(alias))) return true;

  const matchedTerms = areaTerms.filter((forms) =>
    Array.from(forms).some((form) => taskWords.has(form))
  ).length;
  const minimumMatches = areaTerms.length >= 3 ? 2 : 1;
  return matchedTerms >= minimumMatches;
}

function taskCacheKey(cfg) {
  return `${cfg.baseUrl}|${cfg.username}`;
}

async function listLiveSetupTasks(client, cfg) {
  const cacheKey = taskCacheKey(cfg);
  const cached = taskCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < TASK_CACHE_TTL_MS) return cached.tasks;

  const tasks = await getAllPages(client, cfg, "setupTasks", {
    fields: "TaskCode,TaskName,AvailableFlag,ExportImportSupportedFlag,CSVExportImportSupportedFlag",
    orderBy: "TaskName:asc",
  });
  taskCache.set(cacheKey, { createdAt: Date.now(), tasks });
  return tasks;
}

async function listOfferings(client, cfg) {
  const items = await getAllPages(client, cfg, "features", {
    q: "FeatureType='OFFERING'",
    fields: "FeatureCode,FeatureName,FeatureType,EnabledFlag",
    orderBy: "FeatureName:asc",
  });

  return items
    .filter(
      (item) => item.FeatureCode && item.FeatureName && item.EnabledFlag !== "N"
    )
    .map((item) => ({
      code: item.FeatureCode,
      name: item.FeatureName,
      enabled: true,
    }));
}

async function listFunctionalAreas(client, cfg, offering = {}) {
  const items = await getAllPages(client, cfg, "features", {
    q: "FeatureType='FUNCTIONAL_AREA'",
    fields: "FeatureCode,FeatureName,FeatureType,EnabledFlag",
    orderBy: "FeatureName:asc",
  });

  const functionalAreas = items
    .filter((item) => item.FeatureCode && item.FeatureName)
    .map((item) => ({
      code: item.FeatureCode,
      name: item.FeatureName,
      enabled: item.EnabledFlag !== "N",
    }));

  if (!offering.code || offering.code === "ALL") {
    return {
      functionalAreas,
      filtered: false,
      note: "Showing functional areas from all Oracle setups.",
    };
  }

  const catalogNames = getOfferingFunctionalAreaNames(offering.name);
  if (!catalogNames.length) {
    return {
      functionalAreas,
      filtered: false,
      note:
        "Oracle's public REST API does not expose offering-to-functional-area membership for this setup, so all functional areas are shown.",
    };
  }

  const allowedNames = new Set(catalogNames.map((name) => name.toLowerCase()));
  return {
    functionalAreas: functionalAreas.filter(
      (area) => area.enabled && allowedNames.has(area.name.toLowerCase())
    ),
    filtered: true,
    note: `Showing functional areas cataloged for ${offering.name}.`,
  };
}

async function listAreaTasks(client, cfg, functionalArea = {}) {
  const definitions = getCatalogTasks(functionalArea.name);
  const exactCatalog = usesExactTaskCatalog(functionalArea.name);
  const liveTasks = await listLiveSetupTasks(client, cfg);
  const liveByName = new Map(
    liveTasks
      .filter((task) => task.TaskName)
      .map((task) => [task.TaskName.trim().toLowerCase(), task])
  );
  const selectedNames = new Set();
  const tasks = [];

  for (const definition of definitions) {
    const normalizedName = definition.name.trim().toLowerCase();
    const raw = liveByName.get(normalizedName);
    const customExtractor = definition.extractor && definition.extractor !== "fsmCsv";
    selectedNames.add(normalizedName);

    if (raw) {
      tasks.push(mapTask(raw, {
        available: customExtractor || raw.AvailableFlag === "Y",
        exportSupported: customExtractor || raw.CSVExportImportSupportedFlag === "Y",
        required: definition.required,
        extractor: definition.extractor || "fsmCsv",
      }));
    } else if (customExtractor) {
      tasks.push({
        code: null,
        name: definition.name,
        available: true,
        exportSupported: true,
        required: definition.required,
        extractor: definition.extractor,
      });
    } else if (exactCatalog) {
      tasks.push({
        code: null,
        name: definition.name,
        available: false,
        exportSupported: false,
        required: definition.required,
        extractor: "fsmCsv",
        resolutionError: "Oracle REST did not return this task code for the signed-in user.",
      });
    }
  }

  for (const raw of exactCatalog ? [] : liveTasks) {
    const normalizedName = String(raw.TaskName || "").trim().toLowerCase();
    if (
      !normalizedName ||
      selectedNames.has(normalizedName) ||
      raw.AvailableFlag === "N" ||
      !taskMatchesArea(raw, functionalArea)
    ) {
      continue;
    }
    selectedNames.add(normalizedName);
    tasks.push(mapTask(raw, { required: null, extractor: "fsmCsv" }));
  }

  return {
    cataloged: definitions.length > 0,
    tasks,
    automatic: true,
    note: tasks.length
      ? exactCatalog
        ? `Loaded ${tasks.length} Oracle-verified setup tasks for ${functionalArea.name}.`
        : `Loaded ${tasks.length} setup tasks automatically for ${functionalArea.name}.`
      : `Oracle returned no matching setup tasks for ${functionalArea.name}.`,
  };
}

async function searchSetupTasks(client, cfg, search) {
  const term = String(search || "").trim();
  if (term.length < 2) return [];

  const items = await getAllPages(client, cfg, "setupTasks", {
    q: `TaskName LIKE '%${escapeQueryValue(term)}%'`,
    fields: "TaskCode,TaskName,AvailableFlag,ExportImportSupportedFlag,CSVExportImportSupportedFlag",
    orderBy: "TaskName:asc",
  });

  return items
    .filter((item) => item.TaskCode && item.TaskName)
    .map((item) => mapTask(item, { required: false, extractor: "fsmCsv" }))
    .slice(0, 100);
}

module.exports = {
  listAreaTasks,
  listFunctionalAreas,
  listOfferings,
  searchSetupTasks,
  taskMatchesArea,
};
