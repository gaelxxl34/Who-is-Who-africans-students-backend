const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log(
  "📦 Installing required dependencies for Who is Who Educhain backend..."
);

// List of required packages
const requiredPackages = [
  "bcrypt",
  "jsonwebtoken",
  "express",
  "cors",
  "helmet",
  "morgan",
  "dotenv",
  "@supabase/supabase-js",
];

// Check if package.json exists
const packageJsonPath = path.join(__dirname, "..", "package.json");
if (!fs.existsSync(packageJsonPath)) {
  console.error(
    "❌ package.json not found. Please run this script from the backend directory."
  );
  process.exit(1);
}

// Read package.json to check which packages are already installed
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const installedDependencies = packageJson.dependencies || {};

// Filter packages that are not installed
const packagesToInstall = requiredPackages.filter(
  (pkg) => !installedDependencies[pkg]
);

if (packagesToInstall.length === 0) {
  console.log("✅ All required packages are already installed.");
} else {
  console.log(
    `🔍 Found ${
      packagesToInstall.length
    } missing packages: ${packagesToInstall.join(", ")}`
  );

  try {
    // Install missing packages
    console.log("📥 Installing missing packages...");
    execSync(`npm install ${packagesToInstall.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("✅ All dependencies installed successfully!");
  } catch (error) {
    console.error("❌ Failed to install dependencies:", error.message);
    process.exit(1);
  }
}

console.log(
  '🚀 Your backend should now be ready to start. Run "npm run dev" to start the server.'
);
