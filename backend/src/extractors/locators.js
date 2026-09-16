/**
 * src/extractors/locators.js
 *
 * Extracts every Locator attribute Oracle returns for each subinventory.
 * Known fields use readable labels first and all remaining API attributes,
 * including locator segments and flexfield values, are retained afterward.
 */

const { getAllPages } = require("../fusionClient");
const logger = require("../logger");
const { mapAllFields } = require("./fieldMapper");

const RESOURCE = "locators";

const FIELD_MAP = {
  "Subinventory Code": "SubinventoryCode",
  "Locator Value": "LocatorName",
  "Description": "Description",
  "Locator Type": "InventoryLocationTypeMeaning",
  "Material Status": "MaterialStatusCode",
  "Picking Sequence": "PickingOrder",
  "Disable Date": "DisableDate",
};

/**
 * subinventoryCodesByOrg: { orgCode: [subinventoryCode, ...] }
 * Returns a flat array of locator rows for every (org, subinventory) pair.
 */
async function extractLocators(client, cfg, subinventoryRows) {
  const allRows = [];

  for (const subRow of subinventoryRows) {
    const restKey = subRow["_subinventoryRestKey"];
    const orgCode = subRow["Organization Code"];
    const subCode = subRow["Subinventory Code"];

    if (!restKey) {
      logger.info(`Skipping locators for ${orgCode}/${subCode} — no REST key found`);
      continue;
    }

    const path = `/fscmRestApi/resources/11.13.18.05/subinventories/${restKey}/child/locators`;
    const rawItems = await getAllPages(client, cfg, path, {}, true); // true = path is already full

    for (const raw of rawItems) {
      const row = mapAllFields(raw, FIELD_MAP, {
        "Organization Code": orgCode,
        "Subinventory Code": raw.SubinventoryCode ?? subCode,
      });
      allRows.push(row);
    }

    logger.info(`Locators for ${orgCode}/${subCode}: ${rawItems.length}`);
  }

  return allRows;
}

module.exports = { extractLocators, FIELD_MAP };
