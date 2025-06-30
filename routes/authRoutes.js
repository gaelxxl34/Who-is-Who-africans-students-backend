const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth");
const { supabaseClient } = require("../config/supabase");
const jwt = require("jsonwebtoken");

// Try to load bcrypt-based auth controller first
let authController;
try {
  authController = require("../controllers/authController");
  console.log("✅ Using bcrypt-based authentication");
} catch (error) {
  // If that fails, use the fallback controller
  console.log("⚠️ Bcrypt not available, using fallback authentication");
  authController = require("../controllers/authController.fallback");
}

// Add a route to check which controller is being used
router.get("/debug-controller", (req, res) => {
  try {
    const bcryptController = require("../controllers/authController");
    res.json({
      controller: "bcrypt",
      message: "Using bcrypt-based authentication",
      hasLogin: typeof bcryptController.login === "function",
    });
  } catch (error) {
    const fallbackController = require("../controllers/authController.fallback");
    res.json({
      controller: "fallback",
      message: "Using fallback authentication",
      hasLogin: typeof fallbackController.login === "function",
      error: error.message,
    });
  }
});

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/check-user/:email", authController.checkUser);
router.get("/verify-token", authController.verifyToken);

// Add the resend confirmation route
router.post("/resend-confirmation", authController.resendConfirmation);

// Add a check-user endpoint
router.get("/check-user/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { supabaseClient, supabaseAdmin } = require("../config/supabase");

    console.log("Checking if user exists:", email);

    // Check if user exists in auth.users (if using Supabase Auth)
    let authUser = null;
    if (supabaseAdmin) {
      try {
        const { data: authData, error: authError } =
          await supabaseAdmin.auth.admin.listUsers();
        if (!authError && authData && authData.users) {
          authUser = authData.users.find(
            (u) => u.email.toLowerCase() === email.toLowerCase()
          );
        }
      } catch (authLookupError) {
        console.error("Error looking up user in auth system:", authLookupError);
      }
    }

    // Check database tables
    const { data: dbUser, error: dbError } = await supabaseClient
      .from("users")
      .select("id, email, user_type, created_at")
      .ilike("email", email)
      .maybeSingle();

    if (dbError) {
      throw dbError;
    }

    // Check if there's a profile
    let profile = null;
    if (dbUser) {
      if (dbUser.user_type === "student") {
        const { data: studentProfile } = await supabaseClient
          .from("student_profiles")
          .select("*")
          .eq("user_id", dbUser.id)
          .maybeSingle();
        profile = studentProfile;
      } else if (dbUser.user_type === "employer") {
        const { data: employerProfile } = await supabaseClient
          .from("employer_profiles")
          .select("*")
          .eq("user_id", dbUser.id)
          .maybeSingle();
        profile = employerProfile;
      }
    }

    res.json({
      exists: !!(authUser || dbUser),
      authSystem: authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            createdAt: authUser.created_at,
          }
        : null,
      database: dbUser
        ? {
            id: dbUser.id,
            email: dbUser.email,
            userType: dbUser.user_type,
            createdAt: dbUser.created_at,
          }
        : null,
      profile: profile,
      registrationComplete: !!(dbUser && profile),
    });
  } catch (error) {
    console.error("Error checking user:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user",
      error: error.message,
    });
  }
});

// Forgot password route - modified to include direct user check against Supabase Auth
router.post("/forgot-password", async (req, res) => {
  console.log("📣 POST request received for /forgot-password");
  console.log("📦 Request body:", req.body);

  try {
    const { email } = req.body;
    console.log("🔄 Password reset request received for email:", email);

    if (!email) {
      console.log("❌ No email provided in request");
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Skip database check and directly use Supabase Auth
    console.log("🔑 Checking directly with Supabase Auth...");

    // Use Supabase auth to send password reset email
    console.log("🔄 Attempting to send password reset email via Supabase...");
    console.log(
      "📧 Reset redirect URL:",
      `${process.env.FRONTEND_URL}/reset-password`
    );

    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
      }
    );

    if (error) {
      console.error("❌ Supabase password reset error:", {
        message: error.message,
        status: error.status,
        details: error,
      });

      // Check for specific error types
      if (error.message.includes("rate limit")) {
        return res.status(429).json({
          success: false,
          message:
            "You can only request a password reset once per minute. Please try again shortly.",
          error: error.message,
        });
      }

      if (error.message.includes("User not found")) {
        // Don't reveal that the user doesn't exist
        return res.json({
          success: true,
          message:
            "If an account with that email exists, a password reset link has been sent.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Failed to send password reset email",
        error: error.message,
      });
    }

    console.log("✅ Supabase password reset response:", data);
    console.log("📧 Password reset email should be sent to:", email);

    res.json({
      success: true,
      message:
        "Password reset email sent successfully. Please check your inbox and spam folder.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("💥 Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Reset password route
router.post("/reset-password", async (req, res) => {
  try {
    const { password, access_token, refresh_token } = req.body;

    if (!password || !access_token || !refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Password, access token, and refresh token are required",
      });
    }

    // Set the session with the tokens from the email link
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.setSession({
        access_token,
        refresh_token,
      });

    if (sessionError) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset tokens",
        error: sessionError.message,
      });
    }

    // Update the password
    const { data, error } = await supabaseClient.auth.updateUser({
      password: password,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to update password",
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Password updated successfully",
      user: data.user,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Protected routes
router.get("/profile", authenticateUser, authController.getProfile);
router.post("/update-profile", authenticateUser, authController.updateProfile);
router.post(
  "/change-password",
  authenticateUser,
  authController.changePassword
);
router.delete(
  "/delete-account",
  authenticateUser,
  authController.deleteAccount
);

// Register endpoint with RLS policy error handling
router.post("/register", async (req, res, next) => {
  try {
    await authController.register(req, res);
  } catch (error) {
    if (
      error.message &&
      error.message.includes("violates row-level security policy")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Registration failed due to Supabase Row Level Security policies.",
        error: error.message,
        fix: [
          "Option 1: Add your service role key to .env as SUPABASE_SERVICE_ROLE_KEY",
          "Option 2: Run 'npm run update-rls' to update RLS policies in Supabase",
          "Option 3: Update RLS policies manually in Supabase SQL Editor to allow public inserts",
        ],
      });
    }
    next(error);
  }
});

// Add this route for debugging user existence
router.get("/debug-user/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // Try multiple approaches to find the user
    console.log("🔍 Searching for user:", email);

    // Method 1: Exact match
    const { data: dbUser1, error: dbError1 } = await supabaseClient
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    // Method 2: Case insensitive search
    const { data: dbUser2, error: dbError2 } = await supabaseClient
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    // Method 3: Get all users and find manually (for debugging)
    const { data: allUsers, error: allError } = await supabaseClient
      .from("users")
      .select("id, email, user_type, created_at")
      .limit(100);

    const manualFind = allUsers
      ? allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
      : null;

    // Test Supabase Auth
    let authUserExists = false;
    let authTestResult = null;
    try {
      const { data: testAuth, error: testError } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password: "test-wrong-password-123",
        });

      authTestResult = testError ? testError.message : "unexpected success";
      authUserExists =
        testError && testError.message.includes("Invalid login credentials");
    } catch (e) {
      authTestResult = e.message;
      authUserExists = e.message.includes("Invalid login credentials");
    }

    res.json({
      email,
      searchResults: {
        exactMatch: !!dbUser1,
        caseInsensitive: !!dbUser2,
        manualFind: !!manualFind,
      },
      data: {
        exactMatchData: dbUser1,
        caseInsensitiveData: dbUser2,
        manualFindData: manualFind,
      },
      errors: {
        exactMatchError: dbError1?.message,
        caseInsensitiveError: dbError2?.message,
        allUsersError: allError?.message,
      },
      totalUsersInTable: allUsers?.length || 0,
      existsInSupabaseAuth: authUserExists,
      authTestResult,
      allUserEmails: allUsers?.map((u) => u.email) || [],
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Emergency direct login route for testing
router.post("/emergency-login", async (req, res) => {
  try {
    const { email } = req.body;
    console.log("🚨 EMERGENCY LOGIN for:", email);

    // Check if user exists
    let { data: user, error: userError } = await supabaseClient
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (!user) {
      console.log("⚠️ User not found, creating temporary record");
      // Create temporary user
      const { data: newUser, error: createError } = await supabaseClient
        .from("users")
        .insert({
          email,
          user_type: "student",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (createError) {
        throw createError;
      }

      user = newUser;
    }

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.user_type,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Emergency login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
      },
    });
  } catch (error) {
    console.error("💥 Emergency login error:", error);
    res.status(500).json({
      success: false,
      message: "Emergency login failed",
      error: error.message,
    });
  }
});

// Add a simple confirmation success page
router.get("/email-confirmed", (req, res) => {
  const { token } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Confirmed - Who Is Who Educhain</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
                margin: 0;
                padding: 20px;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 500px;
                width: 100%;
            }
            .success-icon {
                width: 64px;
                height: 64px;
                background: #10b981;
                border-radius: 50%;
                margin: 0 auto 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 32px;
            }
            h1 { color: #1a1a1a; margin-bottom: 16px; }
            p { color: #666; margin-bottom: 24px; line-height: 1.6; }
            .btn {
                background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
                color: white;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-weight: 600;
                display: inline-block;
                transition: transform 0.2s;
            }
            .btn:hover { transform: translateY(-1px); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">✓</div>
            <h1>Email Confirmed!</h1>
            <p>Your email has been successfully confirmed. You can now log in to your Who Is Who Educhain account.</p>
            <a href="${process.env.FRONTEND_URL}/login${
    token ? `?token=${token}` : ""
  }" class="btn">
                Continue to Login
            </a>
        </div>
        ${
          token
            ? `
        <script>
            // Auto-redirect after 3 seconds
            setTimeout(() => {
                window.location.href = '${process.env.FRONTEND_URL}/login?token=${token}&confirmed=true';
            }, 3000);
        </script>
        `
            : ""
        }
    </body>
    </html>
  `);
});

// Update the confirm route to redirect to the success page
router.get("/confirm", async (req, res) => {
  try {
    const { token_hash, type, access_token, refresh_token } = req.query;

    console.log("📧 Email confirmation request received");
    console.log("Query params:", {
      token_hash: !!token_hash,
      type,
      access_token: !!access_token,
    });

    // Handle the new Supabase Auth flow (with access_token and refresh_token)
    if (access_token && refresh_token) {
      try {
        // Set the session to get user data
        const { data: sessionData, error: sessionError } =
          await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
          });

        if (sessionError) {
          console.error("❌ Session error:", sessionError);
          return res.redirect(
            `${
              process.env.FRONTEND_URL
            }/login?error=session_failed&message=${encodeURIComponent(
              sessionError.message
            )}`
          );
        }

        if (sessionData.user) {
          console.log("✅ Email confirmed for user:", sessionData.user.email);

          // Update user record to mark email as verified
          await supabaseClient
            .from("users")
            .update({ is_email_verified: true })
            .eq("id", sessionData.user.id);

          // Generate JWT token for auto-login
          const token = jwt.sign(
            {
              userId: sessionData.user.id,
              email: sessionData.user.email,
              userType: sessionData.user.user_metadata?.user_type || "student",
            },
            process.env.JWT_SECRET || "your-secret-key",
            { expiresIn: "24h" }
          );

          // Clear the Supabase session after getting what we need
          await supabaseClient.auth.signOut();

          // Redirect to login page with success message and token for auto-login
          return res.redirect(
            `${
              process.env.FRONTEND_URL
            }/login?confirmed=true&token=${token}&message=${encodeURIComponent(
              "Email confirmed successfully! You can now log in."
            )}`
          );
        }
      } catch (error) {
        console.error("❌ Confirmation processing error:", error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/login?error=confirmation_failed&message=${encodeURIComponent(
            "Failed to process email confirmation"
          )}`
        );
      }
    }

    // Handle legacy OTP verification flow
    if (type === "signup" && token_hash) {
      const { data, error } = await supabaseClient.auth.verifyOtp({
        token_hash,
        type: "signup",
      });

      if (error) {
        console.error("❌ OTP verification error:", error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/login?error=otp_failed&message=${encodeURIComponent(
            "Failed to verify OTP"
          )}`
        );
      }

      // OTP verified, now log in the user
      if (data && data.user) {
        // Generate JWT token
        const token = jwt.sign(
          {
            userId: data.user.id,
            email: data.user.email,
            userType: data.user.user_metadata?.user_type || "student",
          },
          process.env.JWT_SECRET || "your-secret-key",
          { expiresIn: "24h" }
        );

        // Redirect to login page with success message and token
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/login?confirmed=true&token=${token}&message=${encodeURIComponent(
            "Email confirmed successfully! You can now log in."
          )}`
        );
      }
    }

    res
      .status(400)
      .json({ success: false, message: "Invalid confirmation request" });
  } catch (error) {
    console.error("Error in confirm route:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
