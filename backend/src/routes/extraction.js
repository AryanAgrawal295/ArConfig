/**
 * src/routes/extraction.js
 *
 * POST /api/extraction/run      -> triggers a full extraction run
 * GET  /api/extraction/history  -> returns past run history
 */

const express = require("express");
const router = express.Router();
const {
  runExtraction,
  getHistory,
  getExtractionProgress,
} = require("../controllers/extractionController");

router.post("/run", runExtraction);
router.get("/history", getHistory);
router.get("/progress/:progressId", getExtractionProgress);

module.exports = router;
