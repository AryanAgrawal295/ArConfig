const { AppError } = require("./errors");

const handlers = new Map();

function handlerFor(operation) {
  return handlers.get(String(operation?.configurationItem || "").toUpperCase());
}

async function validateMigration(operation) {
  const handler = handlerFor(operation);
  if (!handler) {
    return {
      ok: false,
      code: "MIGRATION_NOT_SUPPORTED",
      message: `No approved Oracle migration handler is configured for ${operation.configurationName || operation.configurationItem}.`,
    };
  }
  if (handler.validate) return handler.validate(operation);
  return { ok: true };
}

async function migrateConfiguration({ operation, client, cfg, idempotencyKey }) {
  const handler = handlerFor(operation);
  if (!handler?.migrate) {
    throw new AppError(
      "MIGRATION_NOT_SUPPORTED",
      `Migration is not supported for ${operation.configurationName || operation.configurationItem}.`
    );
  }
  return handler.migrate({ operation, client, cfg, idempotencyKey });
}

async function verifyMigration(operation) {
  const handler = handlerFor(operation);
  if (!handler?.verify) return { status: "NOT_VERIFIED", message: "No item-specific verification handler is configured." };
  return handler.verify(operation);
}

module.exports = { migrateConfiguration, validateMigration, verifyMigration };
