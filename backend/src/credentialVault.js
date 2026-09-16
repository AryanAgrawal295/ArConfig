const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { AppError } = require("./errors");

function encryptionKey() {
  let secret = String(process.env.CREDENTIAL_ENCRYPTION_KEY || "");
  if (!secret && process.env.NODE_ENV !== "production") {
    const keyPath = path.join(__dirname, "..", ".credential-key");
    if (!fs.existsSync(keyPath)) {
      fs.writeFileSync(keyPath, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
    }
    secret = fs.readFileSync(keyPath, "utf8").trim();
  }
  if (secret.length < 32) {
    throw new AppError(
      "INVALID_CONNECTION",
      "Set CREDENTIAL_ENCRYPTION_KEY to at least 32 characters before saving environments."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptSecret(payload) {
  const [ivValue, tagValue, encryptedValue] = String(payload || "").split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new AppError("INVALID_CONNECTION", "Stored credential is invalid.");
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError("INVALID_CONNECTION", "Stored credential could not be decrypted.");
  }
}

module.exports = { decryptSecret, encryptSecret };
