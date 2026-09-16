const mongoose = require("mongoose");

const EnvironmentConnectionSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  environmentType: {
    type: String,
    enum: ["DEV", "SIT", "UAT", "PROD", "OTHER"],
    default: "OTHER",
  },
  baseUrl: { type: String, required: true },
  authType: { type: String, enum: ["BASIC"], default: "BASIC" },
  username: { type: String, required: true },
  encryptedCredential: { type: String, required: true, select: false },
  status: { type: String, enum: ["UNKNOWN", "HEALTHY", "UNHEALTHY"], default: "UNKNOWN" },
  lastTestedAt: { type: Date, default: null },
}, { timestamps: true });

EnvironmentConnectionSchema.index({ ownerId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("EnvironmentConnection", EnvironmentConnectionSchema);
