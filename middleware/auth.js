const jwt = require("jsonwebtoken");
const { supabaseClient } = require("../config/supabase");

// Use the environment variable or a fallback secret
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    console.log("🔍 Verifying token...");
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // IMPORTANT: Verify user still exists
    const { data: user, error } = await supabaseClient
      .from("users")
      .select("id, email, user_type")
      .eq("id", decoded.userId)
      .single();

    if (error || !user) {
      console.log("❌ User not found for token:", decoded.userId);
      return res.status(401).json({
        success: false,
        message: "Invalid token. User not found.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }
};

exports.authenticateUser = authenticateUser;

exports.authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }
    next();
  };
};
