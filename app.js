const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const xss = require("xss-clean");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const path = require("path");

// Import routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const universityAdminRoutes = require("./routes/universityAdminRoutes"); // Add this line

const app = express();

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(xss());
app.use(hpp());

// Rate limiting - 100 requests per 15 minutes
const limiter = rateLimit({
  max: 100,
  windowMs: 15 * 60 * 1000,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend/public")));

// API routes registration with debug logs
console.log("📋 Registering API routes...");
app.use("/api/auth", authRoutes);
console.log("✅ /api/auth routes mounted");
app.use("/api/admin", adminRoutes);
console.log("✅ /api/admin routes mounted");
app.use("/api/university-admin", universityAdminRoutes); // Add this line
console.log("✅ /api/university-admin routes mounted");

// Health check route
app.get("/health", (req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

// Move the catch-all API route to the very end!
app.use("/api/*", (req, res) => {
  console.log(`❌ Unknown API route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Global error handler:", err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

module.exports = app;
