const jwt = require("jsonwebtoken");
const { supabaseClient } = require("../config/supabase");
const { JWT_SECRET } = require("../config/constants");

// Admin authentication middleware
exports.authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No valid authorization header found");
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log(
      "🎫 Token found, first 20 chars:",
      token.substring(0, 20) + "..."
    );

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("✅ JWT verification successful");

    // Test simple database connection first
    console.log("🔍 Testing simple database connection...");

    try {
      // Use a very simple query to test connection
      const { data: connectionTest, error: connectionError } =
        await supabaseClient.from("users").select("id").limit(1);

      if (connectionError) {
        console.error("❌ Database connection error:", connectionError);
        return res.status(500).json({
          success: false,
          message: "Database connection failed",
          code: "DATABASE_CONNECTION_ERROR",
        });
      }

      console.log("✅ Database connection test successful");
    } catch (dbError) {
      console.error("❌ Database connection exception:", dbError);
      return res.status(500).json({
        success: false,
        message: "Database service unavailable",
        code: "DATABASE_SERVICE_ERROR",
      });
    }

    // Try simple user query
    console.log("🔍 Looking for user ID:", decoded.userId);
    const { data: simpleUser, error: simpleError } = await supabaseClient
      .from("users")
      .select("id, email, user_type")
      .eq("id", decoded.userId)
      .single();

    if (simpleError) {
      console.error("❌ Database query error:", simpleError);
      return res.status(500).json({
        success: false,
        message: "Database query failed",
        code: "DATABASE_QUERY_ERROR",
      });
    }

    if (!simpleUser) {
      console.log("❌ User not found in simple query");
      return res.status(401).json({
        success: false,
        message: "User not found or invalid token",
        code: "USER_NOT_FOUND",
      });
    }

    // Verify user type
    if (simpleUser.user_type !== "admin") {
      console.log(`❌ User is not admin, found type: ${simpleUser.user_type}`);
      return res.status(403).json({
        success: false,
        message: "Admin access required",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    console.log("✅ User found and is admin, fetching admin profile...");

    // Get admin profile
    const { data: adminProfile, error: profileError } = await supabaseClient
      .from("admin_profiles")
      .select("*")
      .eq("user_id", decoded.userId)
      .single();

    if (profileError) {
      console.error("❌ Admin profile query error:", profileError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch admin profile",
        code: "ADMIN_PROFILE_ERROR",
      });
    }

    if (!adminProfile) {
      console.log("❌ Admin profile not found");
      return res.status(403).json({
        success: false,
        message: "Admin profile not found",
        code: "ADMIN_PROFILE_NOT_FOUND",
      });
    }

    // Check if admin is active
    if (!adminProfile.is_active) {
      console.log("❌ Admin account is inactive");
      return res.status(403).json({
        success: false,
        message: "Admin account is inactive",
        code: "ADMIN_INACTIVE",
      });
    }

    console.log("✅ Admin authentication successful");

    // Add admin data to request object
    req.admin = {
      userId: simpleUser.id,
      email: simpleUser.email,
      userType: simpleUser.user_type,
      role: adminProfile.role,
      permissions: adminProfile.permissions || [],
      isActive: adminProfile.is_active,
      profile: adminProfile,
    };

    next();
  } catch (error) {
    console.error("💥 Admin authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication service error",
      code: "AUTH_SERVICE_ERROR",
    });
  }
};

// Permission-based authorization middleware
exports.requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      console.log("❌ No admin object found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
      });
    }

    console.log(`🔐 Checking permission: ${permission}`);
    console.log(`👤 Admin role: ${req.admin.role}`);
    console.log(`🔑 Admin permissions:`, req.admin.permissions);

    // Super admin has all permissions
    if (req.admin.role === "super_admin" || req.admin.role === "admin") {
      console.log(`✅ Super admin access granted`);
      return next();
    }

    // Check if admin has the specific permission
    if (req.admin.permissions && req.admin.permissions.includes(permission)) {
      console.log(`✅ Permission granted: ${permission}`);
      return next();
    }

    console.log(`❌ Permission denied: ${permission}`);
    return res.status(403).json({
      success: false,
      message: `Permission required: ${permission}`,
      code: "INSUFFICIENT_PERMISSIONS",
    });
  };
};

// Role-based authorization middleware
exports.requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.admin) {
      console.log("❌ No admin object found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
      });
    }

    console.log(`🔐 Checking role access`);
    console.log(`👤 Admin role: ${req.admin.role}`);
    console.log(`🎯 Required roles:`, allowedRoles);

    if (!allowedRoles.includes(req.admin.role)) {
      console.log(`❌ Role access denied`);
      return res.status(403).json({
        success: false,
        message: `Role required: ${allowedRoles.join(" or ")}`,
        code: "INSUFFICIENT_ROLE",
      });
    }

    console.log(`✅ Role access granted`);
    next();
  };
};
