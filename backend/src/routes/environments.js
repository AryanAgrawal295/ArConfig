const express = require("express");
const controller = require("../controllers/environmentController");

const router = express.Router();
router.get("/", controller.list);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.post("/:id/test", controller.test);
router.delete("/:id", controller.remove);

module.exports = router;
