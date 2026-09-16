const express = require("express");
const { download } = require("../controllers/reportController");
const router = express.Router();
router.get("/:filename", download);
module.exports = router;
