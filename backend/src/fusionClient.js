/**
 * src/fusionClient.js
 *
 * Generic, reusable client for calling Oracle Fusion Cloud REST resources
 * and transparently paging through results. Object-specific logic stays
 * out of this file so it can be reused when ConfigSnapshot is extended
 * to other configuration objects later.
 */

const logger = require("./logger");

const REST_VERSION = "11.13.18.05"; // adjust if your instance is on a different Fusion release

function resourcePath(resource) {
  return `/fscmRestApi/resources/${REST_VERSION}/${resource}`;
}

/**
 * Fetch every record from a Fusion REST resource, paging through results
 * using offset/limit and the "hasMore" flag Fusion returns in the
 * response envelope. Returns an array of all records.
 */
async function getAllPages(client, cfg, resource, queryParams = {}, isFullPath = false) {
  const path = isFullPath ? resource : resourcePath(resource);
  const allItems = [];
  let offset = 0;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    if (pageCount > (cfg.maxPages || 10000)) throw new Error(`Fusion pagination limit exceeded for ${resource}.`);
    const params = { ...queryParams, limit: cfg.pageSize, offset };
    let resp;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        resp = await client.get(path, { params });
      } catch (error) {
        if (attempt === 3) throw error;
      }
      if (resp && resp.status !== 429 && resp.status < 500) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }

    if (resp.status !== 200) {
      logger.error(
        `GET ${resource} failed (offset=${offset}): HTTP ${resp.status}`
      );
      const err = new Error(`Fusion API request failed: ${resp.status}`);
      err.status = resp.status;
      throw err;
    }

    const items = resp.data?.items || [];
    allItems.push(...items);

    const hasMore = resp.data.hasMore || false;
    if (!hasMore || items.length === 0) break;

    offset += items.length;
  }

  return allItems;
}

module.exports = { getAllPages, resourcePath };
