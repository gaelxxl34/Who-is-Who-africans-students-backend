require("dotenv").config();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";

// Validate JWT_SECRET
if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is required");
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.warn(
    "⚠️ WARNING: JWT_SECRET should be at least 32 characters long for security"
  );
}

console.log("🔑 JWT_SECRET loaded successfully, length:", JWT_SECRET.length);

module.exports = {
  JWT_SECRET,
  JWT_EXPIRY,
};
