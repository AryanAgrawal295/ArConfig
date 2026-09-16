const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { AppError } = require("./errors");
const logger = require("./logger");

const ARCTURUS_DOMAIN = "@gmail.com";
const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 30 * 60 * 1000;

const otpRequests = new Map();
const verifiedTokens = new Map();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertArcturusEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("INVALID_EMAIL", "Enter a valid Gmail address.");
  }
  if (!normalized.endsWith(ARCTURUS_DOMAIN)) {
    throw new AppError("INVALID_EMAIL_DOMAIN", `Only test email IDs ending with ${ARCTURUS_DOMAIN} are allowed.`);
  }
  return normalized;
}

function otpHash(email, otp) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.OTP_SECRET || process.env.CREDENTIAL_ENCRYPTION_KEY || "local-otp-secret"}`)
    .digest("hex");
}

function mailTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) {
    throw new AppError(
      "OTP_EMAIL_NOT_CONFIGURED",
      "OTP email is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL in Render."
    );
  }
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user, pass },
    family: Number(process.env.SMTP_FAMILY || 4),
    connectionTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
  };
}

async function sendWithResend({ email, otp, from }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your ArConfig verification OTP",
      text: `Your ArConfig OTP is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your ArConfig OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API returned ${response.status}: ${body}`);
  }
  return true;
}

async function sendOtp(emailInput) {
  const email = assertArcturusEmail(emailInput);
  const otp = String(crypto.randomInt(100000, 1000000));
  otpRequests.set(email, {
    hash: otpHash(email, otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  const from = String(process.env.OTP_FROM_EMAIL || process.env.SMTP_USER || "onboarding@resend.dev").trim();
  try {
    const sentWithResend = await sendWithResend({ email, otp, from });
    if (!sentWithResend) {
      const transporter = nodemailer.createTransport(mailTransportConfig());
      await transporter.sendMail({
        from,
        to: email,
        subject: "Your ArConfig verification OTP",
        text: `Your ArConfig OTP is ${otp}. It expires in 10 minutes.`,
        html: `<p>Your ArConfig OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
      });
    }
  } catch (error) {
    logger.error(`OTP email send failed for ${email}: ${error.message}`);
    throw new AppError(
      "OTP_EMAIL_SEND_FAILED",
      "Could not send OTP email. Check Resend/SMTP env values and Render logs."
    );
  }
  logger.info(`Sent Arcturus OTP to ${email}`);
  return { email, expiresInMinutes: 10 };
}

function verifyOtp(emailInput, otpInput) {
  const email = assertArcturusEmail(emailInput);
  const otp = String(otpInput || "").trim();
  const request = otpRequests.get(email);
  if (!request || request.expiresAt <= Date.now()) {
    otpRequests.delete(email);
    throw new AppError("OTP_EXPIRED", "OTP expired. Please request a new OTP.");
  }
  if (!/^\d{6}$/.test(otp)) {
    throw new AppError("INVALID_OTP", "Enter the 6-digit OTP sent to your email.");
  }
  request.attempts += 1;
  if (request.attempts > 5) {
    otpRequests.delete(email);
    throw new AppError("OTP_TOO_MANY_ATTEMPTS", "Too many wrong OTP attempts. Please request a new OTP.");
  }
  if (request.hash !== otpHash(email, otp)) {
    throw new AppError("INVALID_OTP", "Incorrect OTP. Please check your email and try again.");
  }

  otpRequests.delete(email);
  const token = crypto.randomBytes(32).toString("base64url");
  verifiedTokens.set(token, { email, expiresAt: Date.now() + VERIFIED_TTL_MS });
  return { email, verificationToken: token, expiresInMinutes: 30 };
}

function consumeVerificationToken(tokenInput) {
  const token = String(tokenInput || "").trim();
  const verified = token ? verifiedTokens.get(token) : null;
  if (!verified || verified.expiresAt <= Date.now()) {
    if (token) verifiedTokens.delete(token);
    throw new AppError("ARCTURUS_EMAIL_NOT_VERIFIED", `Verify your ${ARCTURUS_DOMAIN} email with OTP before entering Oracle credentials.`);
  }
  return verified.email;
}

module.exports = {
  ARCTURUS_DOMAIN,
  assertArcturusEmail,
  consumeVerificationToken,
  sendOtp,
  verifyOtp,
};
