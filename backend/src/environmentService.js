const EnvironmentConnection = require("./models/EnvironmentConnection");
const { decryptSecret, encryptSecret } = require("./credentialVault");
const { AppError } = require("./errors");
const { enumValue, httpUrl, text } = require("./validation");

const ENVIRONMENT_TYPES = ["DEV", "SIT", "UAT", "PROD", "OTHER"];

function publicConnection(connection) {
  const value = connection.toObject ? connection.toObject() : connection;
  const { encryptedCredential, ownerId, ...safe } = value;
  return { ...safe, hasCredential: true };
}

async function listConnections(ownerId) {
  const connections = await EnvironmentConnection.find({ ownerId }).sort({ name: 1 });
  return connections.map(publicConnection);
}

async function createConnection(ownerId, input) {
  const connection = await EnvironmentConnection.create({
    ownerId,
    name: text(input.name, "name", { required: true, max: 80 }),
    environmentType: enumValue(input.environmentType, "environmentType", ENVIRONMENT_TYPES, "OTHER"),
    baseUrl: httpUrl(input.baseUrl),
    authType: "BASIC",
    username: text(input.username, "username", { required: true, max: 200 }),
    encryptedCredential: encryptSecret(text(input.password, "password", { required: true, max: 500 })),
  });
  return publicConnection(connection);
}

async function getConnectionConfig(ownerId, id) {
  if (!String(id || "").match(/^[a-f\d]{24}$/i)) throw new AppError("INVALID_CONNECTION", "Invalid environment connection id.");
  const connection = await EnvironmentConnection.findOne({ _id: id, ownerId }).select("+encryptedCredential");
  if (!connection) throw new AppError("UNAUTHORIZED_CONNECTION", "Environment connection was not found or is not owned by this user.");
  return {
    connection,
    cfg: {
      baseUrl: connection.baseUrl,
      username: connection.username,
      password: decryptSecret(connection.encryptedCredential),
      missing: [],
    },
  };
}

async function removeConnection(ownerId, id) {
  if (!String(id || "").match(/^[a-f\d]{24}$/i)) throw new AppError("INVALID_CONNECTION", "Invalid environment connection id.");
  const result = await EnvironmentConnection.deleteOne({ _id: id, ownerId });
  if (!result.deletedCount) throw new AppError("UNAUTHORIZED_CONNECTION", "Environment connection was not found or is not owned by this user.");
}

async function updateConnection(ownerId, id, input) {
  const { connection } = await getConnectionConfig(ownerId, id);
  if (input.name !== undefined) connection.name = text(input.name, "name", { required: true, max: 80 });
  if (input.environmentType !== undefined) connection.environmentType = enumValue(input.environmentType, "environmentType", ENVIRONMENT_TYPES);
  if (input.baseUrl !== undefined) connection.baseUrl = httpUrl(input.baseUrl);
  if (input.username !== undefined) connection.username = text(input.username, "username", { required: true, max: 200 });
  if (input.password) connection.encryptedCredential = encryptSecret(text(input.password, "password", { required: true, max: 500 }));
  connection.status = "UNKNOWN";
  await connection.save();
  return publicConnection(connection);
}

module.exports = { createConnection, getConnectionConfig, listConnections, publicConnection, removeConnection, updateConnection };
