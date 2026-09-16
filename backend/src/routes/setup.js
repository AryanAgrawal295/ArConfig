const express = require("express");
const {
  getAreaTasks,
  getFunctionalAreas,
  getOfferings,
  getRegistry,
  searchTasks,
} = require("../controllers/setupController");

const router = express.Router();

router.post("/offerings", getOfferings);
router.post("/functional-areas", getFunctionalAreas);
router.post("/area-tasks", getAreaTasks);
router.post("/task-search", searchTasks);
router.post("/registry", getRegistry);

module.exports = router;
