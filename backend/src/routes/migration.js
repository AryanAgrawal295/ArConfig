const express = require("express");
const controller = require("../controllers/migrationController");

const router = express.Router();
const workbookBody = express.raw({
  type: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  limit: "15mb",
});

router.get("/sources", controller.sources);
router.post("/validate", controller.validateExisting);
router.post("/workbook/validate", workbookBody, controller.validateWorkbook);
router.get("/plans/:id", controller.getPlan);
router.post("/plans/:id/execute", controller.execute);
router.get("/progress/:id", controller.progress);

module.exports = router;
