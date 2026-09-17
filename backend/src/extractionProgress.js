const PROGRESS_TTL_MS = 60 * 60 * 1000;
const progressRuns = new Map();

function normalizeProgressId(value) {
  const progressId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,100}$/.test(progressId) ? progressId : "";
}

function calculatePercent(progress) {
  if (!progress.totalTasks) return progress.phase === "completed" ? 100 : 0;
  if (progress.phase === "building") return 98;
  if (progress.phase === "completed") return 100;
  return Math.min(97, Math.round((progress.completedCount / progress.totalTasks) * 100));
}

function saveProgress(progressId, progress) {
  if (!progressId) return null;
  const nextProgress = {
    ...progress,
    percent: calculatePercent(progress),
    updatedAt: new Date().toISOString(),
  };
  progressRuns.set(progressId, nextProgress);
  return nextProgress;
}

function startProgress(progressIdValue, details = {}) {
  const progressId = normalizeProgressId(progressIdValue);
  if (!progressId) return "";
  saveProgress(progressId, {
    id: progressId,
    phase: "starting",
    functionalAreaName: details.functionalAreaName || "",
    totalTasks: details.totalTasks || 0,
    completedCount: 0,
    successCount: 0,
    failedCount: 0,
    currentTask: null,
    completedTasks: [],
    message: "Preparing Oracle extraction...",
    startedAt: new Date().toISOString(),
  });
  return progressId;
}

function updateProgress(progressIdValue, changes = {}) {
  const progressId = normalizeProgressId(progressIdValue);
  const current = progressRuns.get(progressId);
  if (!current) return null;
  return saveProgress(progressId, { ...current, ...changes });
}

function beginTask(progressId, task, index) {
  return updateProgress(progressId, {
    phase: "extracting",
    currentTask: {
      index: index + 1,
      name: task.name,
      code: task.code || "",
    },
    message: `Fetching task ${index + 1}: ${task.name}`,
  });
}

function finishTask(progressIdValue, task, index, result) {
  const progressId = normalizeProgressId(progressIdValue);
  const current = progressRuns.get(progressId);
  if (!current) return null;
  const completedTask = {
    index: index + 1,
    name: task.name,
    code: task.code || "",
    status: result.status,
    recordCount: result.recordCount || 0,
    errorMessage: result.errorMessage || "",
  };
  const completedTasks = [...current.completedTasks, completedTask].slice(-10);
  return saveProgress(progressId, {
    ...current,
    phase: "extracting",
    completedCount: current.completedCount + 1,
    successCount: current.successCount + (result.status === "success" ? 1 : 0),
    failedCount: current.failedCount + (result.status === "failed" ? 1 : 0),
    currentTask: null,
    completedTasks,
    message:
      result.status === "success"
        ? `Completed task ${index + 1}: ${task.name}`
        : `Task ${index + 1} failed: ${task.name}`,
  });
}

function completeProgress(progressId, status, message) {
  return updateProgress(progressId, {
    phase: "completed",
    currentTask: null,
    runStatus: status,
    message,
  });
}

function cancelProgress(progressId, message = "Cancellation requested. Stopping after the current task...") {
  return updateProgress(progressId, {
    phase: "cancelling",
    cancellationRequested: true,
    message,
  });
}

function markProgressCancelled(progressId, message = "Task cancelled by user.") {
  return updateProgress(progressId, {
    phase: "cancelled",
    currentTask: null,
    cancellationRequested: true,
    message,
  });
}

function failProgress(progressId, message) {
  return updateProgress(progressId, {
    phase: "failed",
    currentTask: null,
    message,
  });
}

function getProgress(progressIdValue) {
  const progressId = normalizeProgressId(progressIdValue);
  const progress = progressRuns.get(progressId);
  if (!progress) return null;
  if (Date.now() - new Date(progress.updatedAt).getTime() > PROGRESS_TTL_MS) {
    progressRuns.delete(progressId);
    return null;
  }
  return progress;
}

function isProgressCancelled(progressIdValue) {
  return Boolean(getProgress(progressIdValue)?.cancellationRequested);
}

module.exports = {
  beginTask,
  cancelProgress,
  completeProgress,
  failProgress,
  finishTask,
  getProgress,
  isProgressCancelled,
  markProgressCancelled,
  startProgress,
  updateProgress,
};
