/**
 * src/auth.js
 *
 * Builds an authenticated axios instance for the Oracle Fusion Cloud
 * REST API. Standard Fusion REST APIs accept HTTP Basic Auth over TLS
 * for integration users. If your instance requires OAuth2 instead, swap
 * the `auth` option below for an Authorization: Bearer header (see
 * comment).
 */

const axios = require("axios");
const logger = require("./logger");

function buildClient(cfg) {
  const client = axios.create({
    baseURL: cfg.baseUrl,
    auth: {
      username: cfg.username,
      password: cfg.password,
    },
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "REST-Framework-Version": "4",
    },
    timeout: 60000,
    validateStatus: () => true, // we handle status codes ourselves, not via throw
  });

  // --- OAuth2 alternative (uncomment and adapt if Basic Auth is disabled) ---
  // const token = await fetchOAuthToken(cfg);
  // delete client.defaults.auth;
  // client.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  return client;
}

async function verifyAuth(client, cfg) {
  const endpoint = "/fscmRestApi/resources/11.13.18.05/setupTasks";
  const resp = await client.get(endpoint, {
    params: { limit: 1 },
  });

  if (resp.status === 200) {
    logger.info(`Authenticated against ${cfg.baseUrl}`);
    return { ok: true, status: resp.status };
  }

  if (resp.status === 401 || resp.status === 403) {
    const message =
      resp.status === 401
        ? "Fusion returned 401 Unauthorized. Check the username/password, password expiry, and whether this account can use REST Basic Auth."
        : "Fusion returned 403 Forbidden. The credentials may be valid, but the user needs access to Functional Setup Manager REST APIs.";
    logger.error(
      `${message} Endpoint: ${endpoint}`
    );
    return { ok: false, status: resp.status, message };
  }

  const message = `Fusion auth check returned HTTP ${resp.status} from ${endpoint}.`;
  logger.error(message);
  return { ok: false, status: resp.status, message };
}

module.exports = { buildClient, verifyAuth };
