const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  authenticateUniversityAdmin,
} = require("../middleware/universityAdminAuth");
const universityAdminController = require("../controllers/universityAdminController");

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
});

// Console log to verify routes are loaded
console.log("🔍 LOADING UNIVERSITY ADMIN ROUTES");
console.log(
  "🔍 Available controller functions:",
  Object.keys(universityAdminController)
);

// Dashboard route
router.get(
  "/dashboard",
  authenticateUniversityAdmin,
  universityAdminController.getDashboardData
);

// University settings routes
router.get(
  "/settings",
  authenticateUniversityAdmin,
  universityAdminController.getUniversitySettings
);
router.put(
  "/settings",
  authenticateUniversityAdmin,
  universityAdminController.updateUniversitySettings
);

// Academic programs routes
router.get(
  "/academic-programs",
  authenticateUniversityAdmin,
  universityAdminController.getAcademicPrograms
);
router.post(
  "/academic-programs",
  authenticateUniversityAdmin,
  universityAdminController.addAcademicProgram
);
router.put(
  "/academic-programs/:programId",
  authenticateUniversityAdmin,
  universityAdminController.updateAcademicProgram
);
router.delete(
  "/academic-programs/:programId",
  authenticateUniversityAdmin,
  universityAdminController.deleteAcademicProgram
);
router.post(
  "/academic-programs/bulk",
  authenticateUniversityAdmin,
  universityAdminController.bulkUploadPrograms
);

// Programs dropdown endpoint for forms
router.get(
  "/programs-dropdown",
  authenticateUniversityAdmin,
  universityAdminController.getProgramsDropdown
);

// Academic records routes
router.get(
  "/academic-records",
  authenticateUniversityAdmin,
  universityAdminController.getGraduateRecords
);

router.post(
  "/academic-records",
  upload.fields([
    { name: "certificate", maxCount: 1 },
    { name: "transcript", maxCount: 1 },
  ]),
  authenticateUniversityAdmin,
  universityAdminController.createGraduateRecord
);

// Add preview URL route
router.post(
  "/academic-records/preview-url",
  authenticateUniversityAdmin,
  universityAdminController.getPreviewUrl
);

// Download and delete routes
router.get(
  "/academic-records/:recordId/download",
  authenticateUniversityAdmin,
  universityAdminController.downloadRecordFiles
);

router.delete(
  "/academic-records/:recordId",
  authenticateUniversityAdmin,
  universityAdminController.deleteGraduateRecord
);

// Debug route to check all available functions
router.get("/debug", authenticateUniversityAdmin, (req, res) => {
  res.json({
    success: true,
    message: "University admin debug route",
    userId: req.admin?.userId,
    universityId: req.admin?.universityId,
    controllerFunctions: Object.keys(universityAdminController),
  });
});

module.exports = router;
