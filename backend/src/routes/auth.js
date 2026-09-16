const express = require("express");
const router = express.Router();
const { confirmOtp, login, requestOtp, testSession } = require("../controllers/authController");

router.post("/request-otp", requestOtp);
router.post("/verify-otp", confirmOtp);
router.post("/login", login);
router.post("/test", testSession);

module.exports = router;
