const express = require("express");
const { compare } = require("../controllers/comparisonController");

const router = express.Router();
router.post("/run", compare);
module.exports = router;
