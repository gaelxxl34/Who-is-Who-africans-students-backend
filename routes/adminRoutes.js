const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken"); // Add this import
const { authenticateAdmin } = require("../middleware/adminAuth");
const { supabaseClient } = require("../config/supabase"); // Add this import
const { JWT_SECRET } = require("../config/constants"); // Add this import
const adminController = require("../controllers/adminController");

// Admin logout route
router.post("/logout", authenticateAdmin, adminController.adminLogout);

// Add a simple test route to debug authentication
router.get("/test", authenticateAdmin, (req, res) => {
  console.log("🧪 Test route reached successfully");
  console.log("📋 Admin object:", req.admin);
  res.json({
    success: true,
    message: "Authentication working!",
    admin: {
      userId: req.admin.userId,
      email: req.admin.email,
      role: req.admin.role,
      permissions: req.admin.permissions,
    },
  });
});

// Add a detailed debug route
router.get("/debug-auth", authenticateAdmin, (req, res) => {
  console.log("🧪 Debug auth route reached successfully");
  console.log("📋 Full admin object:", JSON.stringify(req.admin, null, 2));

  res.json({
    success: true,
    message: "Authentication working perfectly!",
    debug: {
      userId: req.admin?.userId,
      email: req.admin?.email,
      role: req.admin?.role,
      permissions: req.admin?.permissions,
      isActive: req.admin?.isActive,
      profile: req.admin?.profile,
      timestamp: new Date().toISOString(),
    },
  });
});

// Add the debug route
router.get("/debug", authenticateAdmin, adminController.debugAuth);

// Add a specific debug route for checking user/profile mismatch
router.get("/debug-user-profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "No token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("🔍 JWT decoded data:", decoded);

    // Check users table
    const { data: users, error: usersError } = await supabaseClient
      .from("users")
      .select("*")
      .eq("email", decoded.email);

    // Check admin_profiles table
    const { data: adminProfiles, error: profilesError } = await supabaseClient
      .from("admin_profiles")
      .select("*")
      .eq("user_id", decoded.userId);

    // Check if there are any admin profiles for this email
    const { data: profilesByEmail, error: emailError } = await supabaseClient
      .from("admin_profiles")
      .select(
        `
        *,
        users!admin_profiles_user_id_fkey(email)
      `
      )
      .eq("users.email", decoded.email);

    res.json({
      success: true,
      debug: {
        decodedToken: decoded,
        usersFound: users,
        usersError,
        adminProfilesForUserId: adminProfiles,
        profilesError,
        adminProfilesForEmail: profilesByEmail,
        emailError,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Protected admin routes
router.get("/dashboard", authenticateAdmin, adminController.getDashboardData);

// User management
router.get("/users", authenticateAdmin, adminController.getUsers);
router.get("/users/:userId", authenticateAdmin, adminController.getUserById);
router.put("/users/:userId", authenticateAdmin, adminController.updateUser);
router.delete("/users/:userId", authenticateAdmin, adminController.deleteUser); // NEW DELETE ROUTE

// University management
router.get("/universities", authenticateAdmin, adminController.getUniversities);
router.post(
  "/universities",
  authenticateAdmin,
  adminController.createUniversity
);
router.get(
  "/universities/:universityId",
  authenticateAdmin,
  adminController.getUniversityById
);
router.put(
  "/universities/:universityId",
  authenticateAdmin,
  adminController.updateUniversity
);
router.patch(
  "/universities/:universityId/status",
  authenticateAdmin,
  adminController.updateUniversityStatus
);
router.delete(
  "/universities/:universityId",
  authenticateAdmin,
  adminController.deleteUniversity
);

// University Admin management routes
router.get(
  "/university-admins",
  authenticateAdmin,
  adminController.getUniversityAdmins
);
router.post(
  "/university-admins",
  authenticateAdmin,
  adminController.createUniversityAdmin
);
router.get(
  "/university-admins/:adminId",
  authenticateAdmin,
  adminController.getUniversityAdminById
);
router.put(
  "/university-admins/:adminId",
  authenticateAdmin,
  adminController.updateUniversityAdmin
);
router.delete(
  "/university-admins/:adminId",
  authenticateAdmin,
  adminController.deleteUniversityAdmin
);

// University dropdown endpoint
router.get(
  "/universities-dropdown",
  authenticateAdmin,
  adminController.getUniversitiesForDropdown
);

module.exports = router;
