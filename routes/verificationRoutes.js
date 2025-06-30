const express = require("express");
const router = express.Router();
const verificationController = require("../controllers/verificationController");
// const { authenticateUser } = require("../middleware/authUser"); // Uncomment if you want to require auth

// Public routes (no authentication required for verification)
router.get("/universities", verificationController.getUniversities);
router.get(
  "/universities/:universityId/programs",
  verificationController.getUniversityPrograms
);
router.get(
  "/universities/:universityId/years",
  verificationController.getGraduationYears
);
router.post("/verify", verificationController.verifyCredentials);

router.post("/preview-url", verificationController.getFilePreviewUrl);
router.get("/preview-url", verificationController.getFilePreviewUrl);

module.exports = router;
