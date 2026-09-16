/**
 * src/extractors/subinventories.js
 *
 * Extracts Subinventory setup data for one or more Inventory
 * Organizations. Known attributes use readable workbook labels first,
 * followed by every additional attribute returned by Oracle.
 */

const { getAllPages } = require("../fusionClient");
const logger = require("../logger");
const { mapAllFields } = require("./fieldMapper");

const RESOURCE = "subinventories";

const FIELD_MAP = {
  "Organization Code": "OrganizationCode",
  "Subinventory Code": "SecondaryInventoryName",
  "Description": "Description",
  "Locator Control Type": "LocatorControlMeaning",
  "Asset Subinventory": "AssetSubinventory",
  "Depreciable": "Depreciable",
  "Material Status": "MaterialStatusCode",
  "Trackable as LPN (LPN Control)": "LPNControl",
  "Disable Date": "DisableDate",
};

/**
 * Returns every direct attribute Oracle supplies. FIELD_MAP controls the
 * readable leading columns; unmapped API attributes retain their exact
 * Oracle attribute names so no setup data is silently discarded.
 */
async function extractSubinventories(client, cfg, orgCodes) {
  const allRows = [];

  for (const orgCode of orgCodes) {
    const queryParams = orgCode.toUpperCase() === "ALL" ? {} : { q: `OrganizationCode='${orgCode}'` };

    const rawItems = await getAllPages(client, cfg, RESOURCE, queryParams);

    for (const raw of rawItems) {
      const row = mapAllFields(raw, FIELD_MAP);
      const selfLink = (raw.links || []).find((l) => l.rel === "canonical" || l.rel === "self");
      Object.defineProperty(row, "_subinventoryRestKey", {
        value: selfLink ? selfLink.href.split("/").pop() : null,
        enumerable: false,
      });
      allRows.push(row);
    }

    logger.info(`Subinventories extracted for ${orgCode}: ${rawItems.length}`);
  }

  return allRows;
}

module.exports = { extractSubinventories, FIELD_MAP };
