const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { supabaseClient } = require("../config/supabase");
const { JWT_SECRET, JWT_EXPIRY } = require("../config/constants");

// Register a new user - PROPER FLOW
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      user_type,
      firstName,
      lastName,
      phoneNumber,
      company_name,
      industry,
      country,
      city,
    } = req.body;

    console.log("📝 Registration attempt for:", email, "as", user_type);

    if (!email || !password || !user_type) {
      return res.status(400).json({
        success: false,
        message: "Email, password and user type are required",
      });
    }

    // Step 1: Create Supabase Auth user with proper redirect
    console.log("🔐 Creating Supabase Auth user...");
    const { data: authData, error: authError } =
      await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.BACKEND_URL}/api/auth/confirm`,
          data: {
            user_type: user_type,
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

    if (authError) {
      console.error("❌ Supabase Auth registration failed:", authError);
      return res.status(400).json({
        success: false,
        message: authError.message || "Registration failed",
        error: authError.code,
      });
    }

    if (!authData.user) {
      return res.status(400).json({
        success: false,
        message: "User creation failed - no user data returned",
      });
    }

    console.log("✅ Supabase Auth user created:", authData.user.id);

    // Step 2: Set session for authenticated operations
    if (authData.session) {
      await supabaseClient.auth.setSession(authData.session);
      console.log("🔐 Session set for authenticated requests");
    }

    // Step 3: Create custom user record (NO password_hash needed)
    console.log("👤 Creating custom user record...");
    const { data: newUser, error: userError } = await supabaseClient
      .from("users")
      .insert({
        id: authData.user.id,
        email: authData.user.email,
        user_type,
        is_email_verified: authData.user.email_confirmed_at ? true : false,
        auth_managed: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (userError) {
      console.error("❌ Error creating custom user record:", userError);

      // Clean up: Delete the auth user if custom user creation fails
      try {
        const { supabaseAdmin } = require("../config/supabase");
        if (supabaseAdmin) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
          console.log(
            "🧹 Cleaned up Supabase Auth user after custom user creation failed"
          );
        }
      } catch (cleanupError) {
        console.error(
          "⚠️ Failed to clean up Supabase Auth user:",
          cleanupError
        );
      }

      throw userError;
    }

    console.log("✅ Custom user record created successfully");

    // Step 4: Create profile
    console.log("📋 Creating profile...");
    const profileData =
      user_type === "student"
        ? {
            user_id: authData.user.id,
            first_name: firstName || "",
            last_name: lastName || "",
            phone: phoneNumber || "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            user_id: authData.user.id,
            company_name: company_name || "",
            industry: industry || "",
            phone: phoneNumber || "",
            country: country || "Unknown",
            city: city || "Unknown",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

    const profileTable =
      user_type === "student" ? "student_profiles" : "employer_profiles";
    const { error: profileError } = await supabaseClient
      .from(profileTable)
      .insert(profileData);

    if (profileError) {
      console.error(`❌ Error creating ${user_type} profile:`, profileError);

      // Clean up everything if profile creation fails
      try {
        await supabaseClient.from("users").delete().eq("id", authData.user.id);
        const { supabaseAdmin } = require("../config/supabase");
        if (supabaseAdmin) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        }
        console.log(
          "🧹 Cleaned up all user data after profile creation failed"
        );
      } catch (cleanupError) {
        console.error("⚠️ Failed to clean up user data:", cleanupError);
      }

      throw profileError;
    }

    console.log("✅ Profile created successfully");

    // Step 5: Generate JWT token
    const token = jwt.sign(
      {
        userId: authData.user.id,
        email: authData.user.email,
        userType: user_type,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Clear the session after successful registration
    await supabaseClient.auth.signOut();

    console.log("🎉 Registration completed successfully for:", email);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        userType: user_type,
        emailConfirmed: !!authData.user.email_confirmed_at,
      },
    });
  } catch (error) {
    console.error("💥 Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Enhanced login function to handle university admins
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Get user from database
    const { data: user, error } = await supabaseClient
      .from("users")
      .select(
        `
        *,
        admin_profiles(*),
        student_profiles(*),
        employer_profiles(*),
        university_admin_profiles(*)
      `
      )
      .eq("email", email.toLowerCase())
      .single();

    if (error || !user) {
      console.log(`❌ User not found: ${email}`);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log(`👤 User found: ${user.email} (${user.user_type})`);

    let storedPasswordHash = null;
    let userProfile = null;

    // Get the appropriate profile and password hash based on user type
    switch (user.user_type) {
      case "admin":
        console.log(`🔐 Using Supabase Auth for admin: ${email}`);

        // Try Supabase Auth login for admin users
        const { data: adminAuthData, error: adminAuthError } =
          await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
          });

        if (adminAuthError) {
          console.log(
            `❌ Supabase Auth failed for admin ${email}:`,
            adminAuthError.message
          );

          // Check if this is an auth setup issue
          if (adminAuthError.message.includes("Invalid login credentials")) {
            return res.status(401).json({
              success: false,
              message:
                "Admin account authentication failed. Please contact support to reset your password.",
              code: "ADMIN_AUTH_REQUIRED",
            });
          }

          return res.status(401).json({
            success: false,
            message: "Invalid email or password",
          });
        }

        console.log(`✅ Supabase Auth successful for admin: ${email}`);
        authenticationResult = adminAuthData;

        // FIX: Handle both object and array formats for admin_profiles
        console.log(`🔍 DEBUGGING ADMIN PROFILE LOOKUP:`);
        console.log(`🔍 User admin_profiles value:`, user.admin_profiles);
        console.log(`🔍 Type of admin_profiles:`, typeof user.admin_profiles);
        console.log(
          `🔍 Is admin_profiles an array?:`,
          Array.isArray(user.admin_profiles)
        );

        // Handle different response formats from Supabase join
        if (user.admin_profiles) {
          if (
            Array.isArray(user.admin_profiles) &&
            user.admin_profiles.length > 0
          ) {
            userProfile = user.admin_profiles[0];
            console.log(
              `✅ Admin profile found from join query (array format):`,
              userProfile
            );
          } else if (!Array.isArray(user.admin_profiles)) {
            userProfile = user.admin_profiles;
            console.log(
              `✅ Admin profile found from join query (object format):`,
              userProfile
            );
          }
        }

        // If join didn't work, try direct query
        if (!userProfile) {
          console.log(
            `🔍 Attempting direct admin_profiles query for user_id: ${user.id}`
          );
          try {
            const { data: directAdminQuery, error: directError } =
              await supabaseClient
                .from("admin_profiles")
                .select("*")
                .eq("user_id", user.id);

            console.log(
              `🔍 Direct admin_profiles query result:`,
              directAdminQuery
            );
            console.log(`🔍 Direct admin_profiles query error:`, directError);

            if (directAdminQuery && directAdminQuery.length > 0) {
              console.log(`✅ FOUND admin profile via direct query!`);
              userProfile = directAdminQuery[0];
            }
          } catch (debugError) {
            console.error(`❌ Debug query failed:`, debugError);
          }
        }

        if (!userProfile) {
          console.log(`❌ No admin profile found for: ${email}`);
          console.log(`❌ User ID: ${user.id}`);

          return res.status(401).json({
            success: false,
            message: "Admin profile not found. Please contact support.",
          });
        }

        console.log(`✅ Admin profile located:`, userProfile);

        // IMPORTANT: Skip password hash check for admin users since they use Supabase Auth
        // No password verification needed - Supabase Auth already handled it above

        // Sign out from Supabase Auth session (we use JWT instead)
        await supabaseClient.auth.signOut();
        break;

      case "university_admin":
        console.log(`🔐 Using Supabase Auth for university admin: ${email}`);

        // Try Supabase Auth login for university admin users
        const { data: universityAdminAuthData, error: universityAdminAuthError } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (universityAdminAuthError) {
          console.log(`❌ Supabase Auth failed for university admin ${email}:`, universityAdminAuthError.message);

          // Check if this is an auth setup issue
          if (universityAdminAuthError.message.includes('Invalid login credentials')) {
            return res.status(401).json({
              success: false,
              message: "University admin account authentication failed. Please contact support to reset your password.",
              code: "UNIVERSITY_ADMIN_AUTH_REQUIRED"
            });
          }

          return res.status(401).json({
            success: false,
            message: "Invalid email or password",
          });
        }

        console.log(`✅ Supabase Auth successful for university admin: ${email}`);
        authenticationResult = universityAdminAuthData;

        // Handle both object and array formats for university_admin_profiles
        console.log(`🔍 Looking for university admin profile. Available profiles:`, user.university_admin_profiles);
        
        if (user.university_admin_profiles) {
          if (Array.isArray(user.university_admin_profiles) && user.university_admin_profiles.length > 0) {
            userProfile = user.university_admin_profiles[0];
            console.log(`✅ University admin profile found from join query (array format):`, userProfile);
          } else if (!Array.isArray(user.university_admin_profiles)) {
            userProfile = user.university_admin_profiles;
            console.log(`✅ University admin profile found from join query (object format):`, userProfile);
          }
        }

        // If join didn't work, try direct query
        if (!userProfile) {
          console.log(`🔍 Attempting direct university_admin_profiles query for user_id: ${user.id}`);
          try {
            const { data: directUniversityAdminQuery, error: directError } = await supabaseClient
              .from("university_admin_profiles")
              .select("*")
              .eq("user_id", user.id);
              
            console.log(`🔍 Direct university_admin_profiles query result:`, directUniversityAdminQuery);
            
            if (directUniversityAdminQuery && directUniversityAdminQuery.length > 0) {
              console.log(`✅ FOUND university admin profile via direct query!`);
              userProfile = directUniversityAdminQuery[0];
            }
          } catch (debugError) {
            console.error(`❌ Debug query failed:`, debugError);
          }
        }

        if (!userProfile) {
          console.log(`❌ No university admin profile found for: ${email}`);
          console.log(`❌ User ID: ${user.id}`);
          
          return res.status(401).json({
            success: false,
            message: "University administrator profile not found. Please contact your system administrator.",
            code: "UNIVERSITY_ADMIN_PROFILE_NOT_FOUND",
          });
        }

        console.log(`✅ University admin profile located:`, userProfile);

        // IMPORTANT: Skip password hash check for university admin users since they use Supabase Auth
        // No password verification needed - Supabase Auth already handled it above

        // Sign out from Supabase Auth session (we use JWT instead)
        await supabaseClient.auth.signOut();
        break;
      case "student":
        if (user.student_profiles?.[0]) {
          userProfile = user.student_profiles[0];
          // Students might not have password_hash yet
        }
        break;
      case "employer":
        if (user.employer_profiles?.[0]) {
          userProfile = user.employer_profiles[0];
          // Employers might not have password_hash yet
        }
        break;
      default:
        console.log(`❌ Unknown user type: ${user.user_type}`);
        return res.status(401).json({
          success: false,
          message: "Invalid user type",
        });
    }

    console.log(`✅ Authentication successful for: ${email}`);

    // Update last login
    if (userProfile) {
      const profileTable =
        user.user_type === "admin"
          ? "admin_profiles"
          : user.user_type === "university_admin"
          ? "university_admin_profiles"
          : user.user_type === "student"
          ? "student_profiles"
          : "employer_profiles";

      await supabaseClient
        .from(profileTable)
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // Generate JWT token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      profileId: userProfile?.id,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    // Prepare user data for response - FIX property names for frontend compatibility
    const userData = {
      id: user.id,
      email: user.email,
      userType: user.user_type, // Frontend expects 'userType', not 'user_type'
      user_type: user.user_type, // Keep both for backward compatibility
      isEmailVerified: user.is_email_verified,
      profile: userProfile
        ? {
            id: userProfile.id,
            firstName: userProfile.first_name,
            lastName: userProfile.last_name,
            phone: userProfile.phone,
            role: userProfile.role,
            permissions: userProfile.permissions,
            isActive: userProfile.is_active,
            // Add university-specific data for university admins
            ...(user.user_type === "university_admin" && {
              universityId: userProfile.university_id,
              title: userProfile.title,
            }),
            // Add company data for employers
            ...(user.user_type === "employer" && {
              companyName: userProfile.company_name,
              industry: userProfile.industry,
              country: userProfile.country,
              city: userProfile.city,
            }),
          }
        : null,
      // Add redirect information
      redirectPath: user.user_type === "admin" 
        ? "/admin/dashboard"
        : user.user_type === "university_admin"
        ? "/university-admin/dashboard"
        : "/dashboard" // Both students and employers go to general dashboard
    };

    console.log(`🎯 Login successful - redirecting ${user.user_type} user to ${userData.redirectPath}`);
    console.log(`📋 User data being sent to frontend:`, userData);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("💥 Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// Verify token - update to handle longer sessions and refresh tokens
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log("Token verified for user:", decoded.userId);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);

      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired",
          code: "TOKEN_EXPIRED",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "TOKEN_INVALID",
      });
    }

    // Check if user still exists
    const { data: user, error: userError } = await supabaseClient
      .from("users")
      .select("id, email, user_type")
      .eq("id", decoded.userId)
      .maybeSingle();

    if (userError || !user) {
      console.error(
        "User fetch error during verification:",
        userError || "User not found"
      );
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if token is close to expiry (within 30 minutes)
    const tokenExp = decoded.exp;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToExpiry = tokenExp - currentTime;

    let refreshedToken = null;

    // If token will expire in less than 30 minutes, issue a new token
    if (timeToExpiry < 1800) {
      console.log("Token refresh triggered for user:", user.email);

      refreshedToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          userType: user.user_type,
          iat: Math.floor(Date.now() / 1000),
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );
    }

    console.log("Token verification successful for:", user.email);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
      },
      // Include token refresh if needed
      ...(refreshedToken && { token: refreshedToken }),
      // Include expiration info for client reference
      tokenExpires: refreshedToken
        ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
        : decoded.exp,
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during verification",
      error: error.message,
    });
  }
};

// Confirm email - called from Supabase Auth webhook
exports.confirmEmail = async (req, res) => {
  try {
    const { email, user_id } = req.body;

    console.log("Email confirmation received for:", email);

    // Update user record in database
    const { data, error } = await supabaseClient
      .from("users")
      .update({
        is_email_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating user record:", error);
      return res.status(500).json({
        success: false,
        message: "Error confirming email",
        error: error.message,
      });
    }

    console.log("Email confirmed successfully for user ID:", user_id);

    res.json({
      success: true,
      message: "Email confirmed successfully",
      user: {
        id: data.id,
        email: data.email,
        userType: data.user_type,
        emailConfirmed: data.is_email_verified,
      },
    });
  } catch (error) {
    console.error("Email confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming email",
      error: error.message,
    });
  }
};

// Check if user exists and registration is complete
exports.checkUser = async (req, res) => {
  try {
    const { email } = req.params;

    console.log("Checking if user exists:", email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const { supabaseClient, supabaseAdmin } = require("../config/supabase");
    const client = supabaseAdmin || supabaseClient;

    // Check if user exists in database
    const { data: user, error: userError } = await client
      .from("users")
      .select("id, email, user_type")
      .ilike("email", email)
      .maybeSingle();

    if (userError) {
      console.error("Error checking user:", userError);
      return res.status(500).json({
        success: false,
        message: "Error checking user",
        error: userError.message,
      });
    }

    if (!user) {
      console.log("User not found:", email);
      return res.json({
        exists: false,
        registrationComplete: false,
        message: "User not found",
      });
    }

    // Check if user has a profile (registration is complete)
    let hasProfile = false;

    if (user.user_type === "student") {
      const { data: profile, error: profileError } = await client
        .from("student_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      hasProfile = !profileError && !!profile;
    } else if (user.user_type === "employer") {
      const { data: profile, error: profileError } = await client
        .from("employer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      hasProfile = !profileError && !!profile;
    }

    console.log(`User ${email} exists: true, has profile: ${hasProfile}`);

    res.json({
      exists: true,
      registrationComplete: hasProfile,
      userType: user.user_type,
      message: hasProfile
        ? "User found and registration complete"
        : "User found but registration incomplete",
    });
  } catch (error) {
    console.error("Check user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during user check",
      error: error.message,
    });
  }
};

// Add a resend confirmation email endpoint
exports.resendConfirmation = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    console.log("📧 Resending confirmation email for:", email);

    const { error } = await supabaseClient.auth.resend({
      type: "signup",
      email: email,
      options: {
        emailRedirectTo: `${process.env.BACKEND_URL}/api/auth/confirm`,
      },
    });

    if (error) {
      console.error("❌ Resend confirmation error:", error);

      if (error.message.includes("rate limit")) {
        return res.status(429).json({
          success: false,
          message:
            "You can only request a confirmation email once per minute. Please wait before trying again.",
          code: "RATE_LIMITED",
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to resend confirmation email",
      });
    }

    console.log("✅ Confirmation email resent successfully");

    res.json({
      success: true,
      message:
        "Confirmation email sent successfully. Please check your inbox and spam folder.",
    });
  } catch (error) {
    console.error("💥 Resend confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend confirmation email",
      error: error.message,
    });
  }
};

// Webhook to handle Supabase Auth events
exports.authWebhook = async (req, res) => {
  try {
    const { event, session, user } = req.body;

    console.log("Auth webhook event received:", event);

    // Handle different events
    switch (event) {
      case "INSERT":
        // Send welcome email or perform other actions
        console.log("New user registered:", user.id);
        break;
      case "UPDATE":
        // Handle profile updates, etc.
        console.log("User updated:", user.id);
        break;
      case "DELETE":
        // Clean up related data, etc.
        console.log("User deleted:", user.id);
        break;
      default:
        console.warn("Unhandled event type:", event);
    }

    res.json({
      success: true,
      message: "Webhook processed",
    });
  } catch (error) {
    console.error("Auth webhook error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing webhook",
      error: error.message,
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const { userId, userType } = req.user;

    let profile;

    if (userType === "student") {
      const { data, error } = await supabaseClient
        .from("student_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      profile = data;
    } else if (userType === "employer") {
      const { data, error } = await supabaseClient
        .from("employer_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      profile = data;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid user type",
      });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
      error: error.message,
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      firstName,
      lastName,
      phoneNumber,
      company_name,
      industry,
      country,
      city,
    } = req.body;

    console.log("Profile update request for user ID:", userId);

    // Build the update object based on provided fields
    const updates = {};
    if (firstName) updates.first_name = firstName;
    if (lastName) updates.last_name = lastName;
    if (phoneNumber) updates.phone = phoneNumber;
    if (company_name) updates.company_name = company_name;
    if (industry) updates.industry = industry;
    if (country) updates.country = country;
    if (city) updates.city = city;

    // Determine the table and user type
    let tableName;
    if (req.user.userType === "student") {
      tableName = "student_profiles";
    } else if (req.user.userType === "employer") {
      tableName = "employer_profiles";
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid user type",
      });
    }

    // Update the profile in the appropriate table
    const { error } = await supabaseClient
      .from(tableName)
      .update(updates)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { userId } = req.user;
    const { oldPassword, newPassword } = req.body;

    console.log("Password change request for user ID:", userId);

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old and new passwords are required",
      });
    }

    // Use Supabase Auth to change password
    const { error } = await supabaseClient.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("Password change error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to change password",
      });
    }

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// Delete user account
exports.deleteAccount = async (req, res) => {
  try {
    const { userId } = req.user;

    console.log("Account deletion request for user ID:", userId);

    // Delete the user from the users table
    const { error: userError } = await supabaseClient
      .from("users")
      .delete()
      .eq("id", userId);

    if (userError) throw userError;

    // Delete the auth user
    const { supabaseAdmin } = require("../config/supabase");
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );

    if (authError) {
      console.error("Error deleting user from auth:", authError);
      return res.status(500).json({
        success: false,
        message: "Failed to delete account",
        error: authError.message,
      });
    }

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    });
  }
};

// Export all functions - make sure all exports are properly defined
module.exports = {
  register: exports.register,
  login: exports.login,
  verifyToken: exports.verifyToken,
  confirmEmail: exports.confirmEmail,
  checkUser: exports.checkUser,
  resendConfirmation: exports.resendConfirmation,
  authWebhook: exports.authWebhook,
  getProfile: exports.getProfile,
  updateProfile: exports.updateProfile,
  changePassword: exports.changePassword,
  deleteAccount: exports.deleteAccount,
};
