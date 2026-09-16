/**
 * src/orgResolver.js
 *
 * Lets the person put either an Organization CODE or an Organization NAME
 * in the per-run request or FUSION_ORG_CODES (.env) — this resolves names to their real codes
 * automatically by querying the inventoryOrganizations resource, so you
 * never have to manually look up a code again.
 */

const logger = require("./logger");

async function resolveOrgCodes(client, cfg, orgEntries) {
  const resolved = [];

  for (const entry of orgEntries) {
    if (entry.toUpperCase() === "ALL") {
      resolved.push(entry);
      continue;
    }

    try {
      const escapedEntry = entry.replace(/'/g, "''");
      const resp = await client.get(
        "/fscmRestApi/resources/11.13.18.05/inventoryOrganizations",
        { params: { q: `OrganizationName='${escapedEntry}'`, limit: 1 } }
      );

      if (resp.status === 200 && resp.data.items && resp.data.items.length > 0) {
        const code = resp.data.items[0].OrganizationCode;
        if (code) {
          logger.info(`Resolved organization name "${entry}" -> code "${code}"`);
          resolved.push(code);
          continue;
        }
      }
    } catch (err) {
      logger.error(`Org name lookup failed for "${entry}": ${err.message} — using it as-is`);
    }

    resolved.push(entry);
  }

  return resolved;
}

module.exports = { resolveOrgCodes };
