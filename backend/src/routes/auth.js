const express = require("express");
const router = express.Router();
const { login, testSession } = require("../controllers/authController");

router.post("/login", login);
router.post("/test", testSession);

module.exports = router;
