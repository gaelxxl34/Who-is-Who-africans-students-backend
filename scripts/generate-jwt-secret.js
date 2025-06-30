const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

console.log("🔑 Generating new JWT secret...");

// Generate a random 32-byte hex string
const secret = crypto.randomBytes(32).toString("hex");

// Path to .env file
const envPath = path.join(__dirname, "..", ".env");

try {
  // Read existing .env content
  let envContent = "";
  try {
    envContent = fs.readFileSync(envPath, "utf8");
  } catch (err) {
    // File doesn't exist, that's ok
  }

  // Remove existing JWT_SECRET if present
  envContent = envContent.replace(/^JWT_SECRET=.*$/m, "");

  // Add new JWT_SECRET
  envContent += `\nJWT_SECRET=${secret}\n`;

  // Write back to .env
  fs.writeFileSync(envPath, envContent.trim() + "\n");

  console.log("✅ New JWT secret generated and saved to .env");
  console.log("🔒 Your new secret is:", secret);
  console.log(
    "\nℹ️ Make sure to restart your server for changes to take effect!"
  );
} catch (error) {
  console.error("❌ Error saving JWT secret:", error.message);
  process.exit(1);
}
