const jwt = require("jsonwebtoken");
const { supabaseClient } = require("../config/supabase");
const { JWT_SECRET } = require("../config/constants");

exports.authenticateUniversityAdmin = async (req, res, next) => {
  try {
    console.log("🎓 Authenticating university admin...");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No Bearer token provided");
      return res.status(401).json({
        success: false,
        message: "Access token required",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.substring(7);
    console.log("🎫 Token received:", token.substring(0, 20) + "...");

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log("✅ JWT verified successfully");
      console.log("🔍 Decoded token:", {
        userId: decoded.userId,
        email: decoded.email,
        userType: decoded.userType,
      });
    } catch (jwtError) {
      console.error("❌ JWT verification failed:", jwtError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        code: "INVALID_TOKEN",
      });
    }

    // Check if user type is university_admin
    if (decoded.userType !== "university_admin") {
      console.log("❌ User is not a university admin:", decoded.userType);
      return res.status(403).json({
        success: false,
        message: "University admin access required",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    // Get university admin profile from database
    const { data: adminProfile, error: profileError } = await supabaseClient
      .from("university_admin_profiles")
      .select(
        `
        *,
        university_profiles(*)
      `
      )
      .eq("user_id", decoded.userId)
      .eq("is_active", true)
      .single();

    if (profileError || !adminProfile) {
      console.error("❌ University admin profile not found:", profileError);
      return res.status(404).json({
        success: false,
        message: "University admin profile not found or inactive",
        code: "ADMIN_PROFILE_NOT_FOUND",
      });
    }

    console.log(
      "✅ University admin authenticated:",
      adminProfile.first_name,
      adminProfile.last_name
    );
    console.log("🏛️ University:", adminProfile.university_profiles?.name);

    // Attach admin info to request
    req.admin = {
      userId: decoded.userId,
      email: decoded.email,
      userType: decoded.userType,
      profile: adminProfile,
      universityId: adminProfile.university_id,
      permissions: adminProfile.permissions || [],
      isActive: adminProfile.is_active,
    };

    // Update last login
    try {
      await supabaseClient
        .from("university_admin_profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", decoded.userId);
    } catch (updateError) {
      console.warn("⚠️ Failed to update last login:", updateError.message);
      // Don't fail the request if we can't update last login
    }

    next();
  } catch (error) {
    console.error("💥 University admin authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication server error",
      code: "AUTH_SERVER_ERROR",
    });
  }
};
