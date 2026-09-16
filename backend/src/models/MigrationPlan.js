const mongoose = require("mongoose");

const MigrationPlanSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true, select: false },
  status: {
    type: String,
    enum: ["VALIDATING", "READY", "BLOCKED", "RUNNING", "VERIFYING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
    default: "VALIDATING",
    index: true,
  },
  source: { type: mongoose.Schema.Types.Mixed, default: {} },
  destination: { type: mongoose.Schema.Types.Mixed, default: {} },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedItems: { type: [String], default: [] },
  planHash: { type: String, required: true },
  sourceHash: { type: String, default: "" },
  preMigrationSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  blockingErrors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  executionResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
  verification: { type: mongoose.Schema.Types.Mixed, default: {} },
  reportFile: { type: String, default: "" },
  historyRunId: { type: String, default: "" },
  expiresAt: { type: Date, required: true, index: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  toJSON: {
    transform: (_doc, value) => {
      delete value.ownerId;
      return value;
    },
  },
});

MigrationPlanSchema.pre("save", function setUpdatedAt(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("MigrationPlan", MigrationPlanSchema);
