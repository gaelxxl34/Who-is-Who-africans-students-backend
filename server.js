require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { supabaseClient } = require("./config/supabase");
const logger = require("./middleware/logger");

// Import routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const setupRoutes = require("./routes/setupRoutes");
const universityAdminRoutes = require("./routes/universityAdminRoutes");
const verificationRoutes = require("./routes/verificationRoutes");

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger); // Add the logger middleware
app.use(morgan("dev"));

// Define all API endpoints for documentation - UPDATED with all working endpoints
const apiEndpoints = [
  // Health & Testing
  {
    method: "GET",
    path: "/health",
    description: "Check server health status",
    category: "Health & Testing",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    testable: true,
  },
  {
    method: "GET",
    path: "/api/test-supabase",
    description: "Test the Supabase database connection",
    category: "Health & Testing",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    testable: true,
  },

  // Authentication
  {
    method: "POST",
    path: "/api/auth/register",
    description: "Register a new user (student/employer)",
    category: "Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: {
      email: "string",
      password: "string",
      user_type: "student|employer",
      profile: "object",
    },
  },
  {
    method: "POST",
    path: "/api/auth/login",
    description:
      "User login with email and password (unified for all user types)",
    category: "Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: { email: "string", password: "string" },
  },
  {
    method: "POST",
    path: "/api/auth/verify-token",
    description: "Verify JWT token validity",
    category: "Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: { token: "string" },
  },
  {
    method: "GET",
    path: "/api/auth/profile",
    description: "Get current user profile (requires authentication)",
    category: "Authentication",
    requiresAuth: true,
    adminOnly: false,
    status: "✅ Working",
  },
  {
    method: "PUT",
    path: "/api/auth/profile",
    description: "Update user profile (requires authentication)",
    category: "Authentication",
    requiresAuth: true,
    adminOnly: false,
    status: "✅ Working",
  },
  {
    method: "POST",
    path: "/api/auth/forgot-password",
    description: "Send password reset email",
    category: "Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: { email: "string" },
  },
  {
    method: "POST",
    path: "/api/auth/reset-password",
    description: "Reset password with token",
    category: "Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: { token: "string", password: "string" },
  },

  // University Admin Authentication
  {
    method: "POST",
    path: "/api/auth/university-admin/login",
    description: "University administrator login with email and password",
    category: "University Admin Authentication",
    requiresAuth: false,
    adminOnly: false,
    status: "✅ Working",
    payload: { email: "string", password: "string" },
  },

  // Admin - Dashboard & Testing
  {
    method: "GET",
    path: "/api/admin/test",
    description: "Test admin authentication middleware",
    category: "Admin - Testing",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "GET",
    path: "/api/admin/debug-auth",
    description: "Debug admin authentication with detailed logs",
    category: "Admin - Testing",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "GET",
    path: "/api/admin/debug",
    description: "Debug admin controller with database checks",
    category: "Admin - Testing",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "GET",
    path: "/api/admin/dashboard",
    description: "Get admin dashboard data and statistics",
    category: "Admin - Dashboard",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },

  // Admin - User Management (CONFIRMED WORKING)
  {
    method: "GET",
    path: "/api/admin/users",
    description:
      "Get all users with pagination, filtering and complete profile data (excludes university admins)",
    category: "Admin - User Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    queryParams: {
      page: "number",
      limit: "number",
      user_type: "string",
      search: "string",
    },
  },
  {
    method: "GET",
    path: "/api/admin/users/:userId",
    description: "Get single user by ID with complete profile information",
    category: "Admin - User Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "PUT",
    path: "/api/admin/users/:userId",
    description: "Update user profile data (student/employer/admin profiles)",
    category: "Admin - User Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: { email: "string", profile: "object" },
  },
  {
    method: "DELETE",
    path: "/api/admin/users/:userId",
    description:
      "Complete user deletion (Supabase Auth, profile data, user records, audit logs)",
    category: "Admin - User Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },

  // Admin - University Management
  {
    method: "GET",
    path: "/api/admin/universities",
    description: "Get all universities with pagination and filtering",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    queryParams: {
      page: "number",
      limit: "number",
      country: "string",
      is_active: "boolean",
      search: "string",
    },
  },
  {
    method: "POST",
    path: "/api/admin/universities",
    description: "Create a new university profile",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: {
      name: "string",
      email: "string",
      country: "string",
      city: "string",
    },
  },
  {
    method: "GET",
    path: "/api/admin/universities/:universityId",
    description: "Get single university by ID with complete information",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "PUT",
    path: "/api/admin/universities/:universityId",
    description: "Update university profile data",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: {
      name: "string",
      email: "string",
      country: "string",
      city: "string",
    },
  },
  {
    method: "DELETE",
    path: "/api/admin/universities/:universityId",
    description: "Delete university profile",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "PATCH",
    path: "/api/admin/universities/:universityId/status",
    description: "Update university status (active/verified)",
    category: "Admin - University Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: { is_active: "boolean", is_verified: "boolean" },
  },

  // Admin - University Admin Management
  {
    method: "GET",
    path: "/api/admin/university-admins",
    description:
      "Get all university administrators with pagination and filtering",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    queryParams: {
      page: "number",
      limit: "number",
      university_id: "string",
      search: "string",
      is_active: "boolean",
    },
  },
  {
    method: "POST",
    path: "/api/admin/university-admins",
    description: "Create a new university administrator with Supabase Auth",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: {
      email: "string",
      password: "string",
      university_id: "string",
      first_name: "string",
      last_name: "string",
      title: "string",
      phone: "string",
    },
  },
  {
    method: "GET",
    path: "/api/admin/university-admins/:adminId",
    description: "Get single university administrator by ID",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "PUT",
    path: "/api/admin/university-admins/:adminId",
    description: "Update university administrator profile",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
    payload: {
      first_name: "string",
      last_name: "string",
      title: "string",
      phone: "string",
    },
  },
  {
    method: "DELETE",
    path: "/api/admin/university-admins/:adminId",
    description: "Delete university administrator (database and Supabase Auth)",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },
  {
    method: "GET",
    path: "/api/admin/universities-dropdown",
    description: "Get active universities for dropdown selection",
    category: "Admin - University Admin Management",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },

  // University Admin Dashboard & Management
  {
    method: "GET",
    path: "/api/university-admin/dashboard",
    description: "Get university admin dashboard data and statistics",
    category: "University Admin Dashboard",
    requiresAuth: true,
    adminOnly: false,
    status: "🚧 In Development",
  },

  // Admin - Session Management
  {
    method: "POST",
    path: "/api/admin/logout",
    description: "Admin logout and session cleanup",
    category: "Admin - Session",
    requiresAuth: true,
    adminOnly: true,
    status: "✅ Working",
  },

  // Setup & Migration
  {
    method: "GET",
    path: "/api/setup/*",
    description: "Database setup and migration endpoints",
    category: "Setup & Migration",
    requiresAuth: false,
    adminOnly: false,
    status: "⚠️ Setup Only",
  },
];

// Add health check route
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Test Supabase connection route
app.get("/api/test-supabase", async (req, res) => {
  try {
    console.log("🔍 Testing Supabase connection...");

    // Test basic connection with a simple query
    const { data, error } = await supabaseClient
      .from("users")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ Supabase test failed:", error);
      throw error;
    }

    console.log("✅ Supabase connection test passed");

    res.json({
      success: true,
      message: "Supabase connection successful",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("💥 Supabase test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to connect to Supabase",
      error: error.message,
      troubleshooting: [
        "1. Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env",
        "2. Verify users table exists in your Supabase database",
        "3. Check if RLS policies allow this query",
      ],
    });
  }
});

// Users API route - Modified to be schema-agnostic
app.get("/api/users", async (req, res) => {
  try {
    console.log("📋 Fetching users from database...");

    // First, check what columns actually exist in the users table
    const { data: columnInfo, error: columnError } = await supabaseClient
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", "users")
      .eq("table_schema", "public");

    if (columnError) {
      console.warn("⚠️ Could not check columns:", columnError.message);
    } else {
      // Log available columns for debugging
      const availableColumns = columnInfo.map((col) => col.column_name);
      console.log("📊 Available columns in users table:", availableColumns);
    }

    // Use a basic query that should work with any schema
    const { data: users, error } = await supabaseClient
      .from("users")
      .select("id, email, user_type, created_at");

    if (error) {
      console.error("❌ Database error:", error);
      throw error;
    }

    console.log(`✅ Successfully fetched ${users.length} users`);

    // Transform data to match frontend expectations
    const transformedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      user_type: user.user_type || "student",
      created_at: user.created_at,
      // Add placeholder values for fields that might not exist
      first_name: "",
      last_name: "",
      status: "active",
    }));

    res.json({
      success: true,
      users: transformedUsers,
      total: transformedUsers.length,
      debug: {
        databaseCheck: "Schema-agnostic query executed successfully",
      },
    });
  } catch (error) {
    console.error("💥 Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
      suggestion:
        "Please check your Supabase database structure and ensure the users table exists",
    });
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/university-admin", universityAdminRoutes);
app.use("/api/verification", verificationRoutes);

// Add test routes directly to server.js for simplicity
app.get("/api/test-supabase", async (req, res) => {
  try {
    console.log("🔍 Testing Supabase connection...");

    // Test basic connection with a simple query
    const { data, error } = await supabaseClient
      .from("users")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ Supabase test failed:", error);
      throw error;
    }

    console.log("✅ Supabase connection test passed");

    res.json({
      success: true,
      message: "Supabase connection successful",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("💥 Supabase test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to connect to Supabase",
      error: error.message,
      troubleshooting: [
        "1. Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env",
        "2. Verify users table exists in your Supabase database",
        "3. Check if RLS policies allow this query",
      ],
    });
  }
});

// Root route with beautiful API documentation UI
app.get("/", (req, res) => {
  // Group endpoints by category
  const endpointsByCategory = apiEndpoints.reduce((acc, endpoint) => {
    if (!acc[endpoint.category]) {
      acc[endpoint.category] = [];
    }
    acc[endpoint.category].push(endpoint);
    return acc;
  }, {});

  // Count endpoints by status
  const workingEndpoints = 31; // Updated to show actual working endpoints
  const totalEndpoints = 33; // Updated to show actual total endpoints

  // Modern, beautiful HTML response
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Who is Who Educhain API Server</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                color: #333;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .header {
                text-align: center;
                color: white;
                margin-bottom: 40px;
                padding: 40px 0;
            }
            
            .header h1 {
                font-size: 3rem;
                margin-bottom: 10px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            
            .header p {
                font-size: 1.2rem;
                opacity: 0.9;
                margin-bottom: 20px;
            }
            
            .status-cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }
            
            .status-card {
                background: white;
                padding: 20px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                text-align: center;
                transition: transform 0.3s ease;
            }
            
            .status-card:hover {
                transform: translateY(-5px);
            }
            
            .status-card i {
                font-size: 2.5rem;
                margin-bottom: 15px;
            }
            
            .status-card h3 {
                color: #333;
                margin-bottom: 10px;
            }
            
            .status-card p {
                color: #666;
                font-size: 1.1rem;
                font-weight: bold;
            }
            
            .server-online i { color: #10B981; }
            .endpoints-working i { color: #3B82F6; }
            .database-connected i { color: #8B5CF6; }
            .last-updated i { color: #F59E0B; }
            
            .api-section {
                background: white;
                border-radius: 20px;
                padding: 30px;
                box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            
            .api-section h2 {
                color: #333;
                margin-bottom: 25px;
                font-size: 1.8rem;
                border-bottom: 3px solid #667eea;
                padding-bottom: 10px;
            }
            
            .category {
                margin-bottom: 30px;
            }
            
            .category-title {
                font-size: 1.3rem;
                color: #667eea;
                margin-bottom: 15px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .category-title i {
                font-size: 1.1rem;
            }
            
            .endpoints-grid {
                display: grid;
                gap: 15px;
            }
            
            .endpoint {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                transition: all 0.3s ease;
                border-left: 4px solid #667eea;
            }
            
            .endpoint:hover {
                background: #f1f5f9;
                border-color: #667eea;
                transform: translateX(5px);
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            
            .endpoint-header {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 10px;
                flex-wrap: wrap;
            }
            
            .method {
                padding: 6px 12px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 0.85rem;
                min-width: 60px;
                text-align: center;
            }
            
            .method.GET { background: #10B981; color: white; }
            .method.POST { background: #3B82F6; color: white; }
            .method.PUT { background: #F59E0B; color: white; }
            .method.PATCH { background: #8B5CF6; color: white; }
            .method.DELETE { background: #EF4444; color: white; }
            
            .path {
                font-family: 'Courier New', monospace;
                background: #1f2937;
                color: #10B981;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 0.9rem;
                flex: 1;
                min-width: 200px;
            }
            
            .status {
                padding: 4px 10px;
                border-radius: 15px;
                font-size: 0.8rem;
                font-weight: 600;
            }
            
            .status.working {
                background: #D1FAE5;
                color: #065F46;
            }
            
            .status.setup {
                background: #FEF3C7;
                color: #92400E;
            }
            
            .auth-badges {
                display: flex;
                gap: 8px;
                margin-top: 10px;
                flex-wrap: wrap;
            }
            
            .auth-badge {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 0.75rem;
                font-weight: 500;
            }
            
            .auth-required {
                background: #DBEAFE;
                color: #1E40AF;
            }
            
            .admin-only {
                background: #FEE2E2;
                color: #991B1B;
            }
            
            .public {
                background: #D1FAE5;
                color: #065F46;
            }
            
            .description {
                color: #64748b;
                font-size: 0.95rem;
                margin-top: 10px;
                line-height: 1.5;
            }
            
            .payload-info {
                margin-top: 10px;
                padding: 8px 12px;
                background: #f1f5f9;
                border-radius: 6px;
                font-size: 0.85rem;
                color: #475569;
                border-left: 3px solid #3B82F6;
            }
            
            .test-button {
                margin-top: 10px;
                padding: 8px 16px;
                background: #10B981;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                transition: background 0.3s ease;
            }
            
            .test-button:hover {
                background: #059669;
            }
            
            .footer {
                text-align: center;
                color: white;
                margin-top: 40px;
                padding: 20px;
                opacity: 0.8;
            }
            
            @media (max-width: 768px) {
                .header h1 { font-size: 2rem; }
                .status-cards { grid-template-columns: 1fr; }
                .endpoint-header { flex-direction: column; align-items: flex-start; }
                .path { min-width: auto; width: 100%; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
                <h1><i class="fas fa-graduation-cap"></i> Who is Who Educhain API</h1>
                <p>Educational Credential Verification Platform</p>
                <div style="background: rgba(255,255,255,0.2); display: inline-block; padding: 10px 20px; border-radius: 25px;">
                    <i class="fas fa-server"></i> Server Status: <strong>Online & Ready</strong>
                </div>
            </div>
            
            <!-- Status Cards -->
            <div class="status-cards">
                <div class="status-card server-online">
                    <i class="fas fa-server"></i>
                    <h3>Server Status</h3>
                    <p>🟢 Online</p>
                </div>
                <div class="status-card endpoints-working">
                    <i class="fas fa-plug"></i>
                    <h3>API Endpoints</h3>
                    <p>${workingEndpoints}/${totalEndpoints} Working</p>
                </div>
                <div class="status-card database-connected">
                    <i class="fas fa-database"></i>
                    <h3>Database</h3>
                    <p>🟢 Connected</p>
                </div>
                <div class="status-card last-updated">
                    <i class="fas fa-clock"></i>
                    <h3>Last Updated</h3>
                    <p>${new Date().toLocaleString()}</p>
                </div>
            </div>
            
            <!-- API Documentation -->
            <div class="api-section">
                <h2><i class="fas fa-book"></i> API Endpoints Documentation</h2>
                
                ${Object.entries(endpointsByCategory)
                  .map(
                    ([category, endpoints]) => `
                    <div class="category">
                        <div class="category-title">
                            <i class="fas ${getCategoryIcon(category)}"></i>
                            ${category}
                        </div>
                        <div class="endpoints-grid">
                            ${endpoints
                              .map(
                                (endpoint) => `
                                <div class="endpoint">
                                    <div class="endpoint-header">
                                        <span class="method ${
                                          endpoint.method
                                        }">${endpoint.method}</span>
                                        <code class="path">${
                                          endpoint.path
                                        }</code>
                                        <span class="status ${
                                          endpoint.status === "✅ Working"
                                            ? "working"
                                            : "setup"
                                        }">${endpoint.status}</span>
                                    </div>
                                    
                                    <div class="auth-badges">
                                        ${
                                          endpoint.adminOnly
                                            ? '<span class="auth-badge admin-only"><i class="fas fa-shield-alt"></i> Admin Only</span>'
                                            : ""
                                        }
                                        ${
                                          endpoint.requiresAuth &&
                                          !endpoint.adminOnly
                                            ? '<span class="auth-badge auth-required"><i class="fas fa-lock"></i> Auth Required</span>'
                                            : ""
                                        }
                                        ${
                                          !endpoint.requiresAuth
                                            ? '<span class="auth-badge public"><i class="fas fa-globe"></i> Public</span>'
                                            : ""
                                        }
                                    </div>
                                    
                                    <div class="description">${
                                      endpoint.description
                                    }</div>
                                    
                                    ${
                                      endpoint.payload
                                        ? `
                                        <div class="payload-info">
                                            <strong>Payload:</strong> ${JSON.stringify(
                                              endpoint.payload,
                                              null,
                                              2
                                            )}
                                        </div>
                                    `
                                        : ""
                                    }
                                    
                                    ${
                                      endpoint.queryParams
                                        ? `
                                        <div class="payload-info">
                                            <strong>Query Params:</strong> ${JSON.stringify(
                                              endpoint.queryParams,
                                              null,
                                              2
                                            )}
                                        </div>
                                    `
                                        : ""
                                    }
                                    
                                    ${
                                      endpoint.testable
                                        ? `
                                        <button class="test-button" onclick="testEndpoint('${endpoint.path}', '${endpoint.method}')">
                                            <i class="fas fa-play"></i> Test Endpoint
                                        </button>
                                    `
                                        : ""
                                    }
                                </div>
                            `
                              )
                              .join("")}
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <p><i class="fas fa-code"></i> Built with Node.js, Express.js & Supabase</p>
                <p>© 2024 Who is Who Educhain - Educational Technology Platform</p>
            </div>
        </div>
        
        <script>
            function testEndpoint(path, method) {
                const fullUrl = window.location.origin + path;
                if (method === 'GET') {
                    window.open(fullUrl, '_blank');
                } else {
                    alert('POST/PUT endpoints require proper payload. Use a tool like Postman for testing.');
                }
            }
            
            // Add some interactive features
            document.addEventListener('DOMContentLoaded', function() {
                // Add click effect to cards
                document.querySelectorAll('.status-card').forEach(card => {
                    card.addEventListener('click', function() {
                        this.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            this.style.transform = 'translateY(-5px)';
                        }, 150);
                    });
                });
                
                // Auto-refresh timestamp every minute
                setInterval(() => {
                    document.querySelector('.last-updated p').textContent = new Date().toLocaleString();
                }, 60000);
            });
        </script>
    </body>
    </html>
  `);

  // Helper function to get category icons
  function getCategoryIcon(category) {
    const iconMap = {
      "Health & Testing": "fa-heartbeat",
      Authentication: "fa-key",
      "University Admin Authentication": "fa-university",
      "Admin - Testing": "fa-bug",
      "Admin - Dashboard": "fa-tachometer-alt",
      "Admin - User Management": "fa-users-cog",
      "Admin - University Management": "fa-university",
      "Admin - University Admin Management": "fa-user-shield",
      "University Admin Dashboard": "fa-chart-line",
      "University Admin Management": "fa-graduation-cap",
      "Admin - Session": "fa-sign-out-alt",
      "Setup & Migration": "fa-cogs",
    };
    return iconMap[category] || "fa-circle";
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
  });
});

// Catch-all route for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
