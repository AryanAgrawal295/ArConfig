/**
 * src/logger.js
 *
 * Tiny console logging helper so every module logs consistently.
 */

function redact(msg) {
  return String(msg)
    .replace(/(password|authorization|token|secret|credential)(["'\s:=]+)[^\s,}]+/gi, "$1$2[REDACTED]")
    .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/gi, "https://[REDACTED]@");
}

function info(msg) {
  console.log(`[INFO] ${redact(msg)}`);
}

function error(msg) {
  console.error(`[ERROR] ${redact(msg)}`);
}

module.exports = { error, info, redact };
