const { supabaseClient } = require("../config/supabase");
const readline = require("readline");
require("dotenv").config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (input) => {
      resolve(input);
    });
  });
}

async function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  const { data: existingUser } = await supabaseClient
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  return true;
}

function validatePassword(password) {
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  return true;
}

async function createSuperAdmin() {
  try {
    console.log("\n🔐 Who Is Who Educhain - Super Admin Creation Script");
    console.log("===================================================");
    console.log(
      "This script will create a super admin account for the system."
    );
    console.log("Please provide the required information below.\n");

    // Check the current constraint first
    console.log("🔍 Checking database constraint...");
    try {
      const { data: constraintCheck, error: constraintError } =
        await supabaseClient.rpc("check_constraint_sql", {
          table_name: "users",
          constraint_name: "users_user_type_check",
        });

      console.log("Current constraint status:", constraintCheck);
    } catch (error) {
      console.log("Could not check constraint, continuing...");
    }

    // Test if admin type is allowed
    console.log("🧪 Testing admin user_type...");
    try {
      const { data: testResult, error: testError } = await supabaseClient
        .from("users")
        .insert({
          email: "test-admin-constraint@example.com",
          user_type: "admin",
          is_email_verified: true,
          auth_managed: true,
        })
        .select();

      if (testError) {
        if (testError.message.includes("violates check constraint")) {
          console.log(
            "❌ CONSTRAINT ISSUE: Admin user_type is still not allowed!"
          );
          console.log("\n🔧 PLEASE RUN THIS SQL IN YOUR SUPABASE SQL EDITOR:");
          console.log("");
          console.log("-- First, check current constraint");
          console.log(
            "SELECT conname, pg_get_constraintdef(oid) as definition"
          );
          console.log("FROM pg_constraint");
          console.log("WHERE conname = 'users_user_type_check';");
          console.log("");
          console.log("-- Drop the old constraint");
          console.log(
            "ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_user_type_check;"
          );
          console.log("");
          console.log("-- Add the new constraint");
          console.log(
            "ALTER TABLE public.users ADD CONSTRAINT users_user_type_check"
          );
          console.log(
            "  CHECK (user_type IN ('student', 'employer', 'admin', 'university'));"
          );
          console.log("");
          console.log("-- Verify the new constraint");
          console.log(
            "SELECT conname, pg_get_constraintdef(oid) as definition"
          );
          console.log("FROM pg_constraint");
          console.log("WHERE conname = 'users_user_type_check';");
          console.log("");
          console.log("❗ After running this SQL, try the script again.");
          rl.close();
          return;
        } else {
          throw testError;
        }
      } else {
        // Clean up test data
        await supabaseClient
          .from("users")
          .delete()
          .eq("email", "test-admin-constraint@example.com");
        console.log("✅ Admin user_type is allowed");
      }
    } catch (testDbError) {
      console.log("❌ Test failed:", testDbError.message);
      rl.close();
      return;
    }

    // Quick database connectivity test
    console.log("🔍 Testing database connection...");
    try {
      const { data: connectionTest, error: connectionError } =
        await supabaseClient.from("users").select("count").limit(1);

      if (connectionError) {
        throw new Error(
          `Database connection failed: ${connectionError.message}`
        );
      }
      console.log("✅ Database connection successful");
    } catch (error) {
      console.log("❌ Database connection failed:", error.message);
      console.log("🔧 Check your .env file and Supabase credentials");
      rl.close();
      return;
    }

    console.log("");

    // Email input with validation
    let email;
    do {
      try {
        email = await question("📧 Enter Super Admin Email: ");
        await validateEmail(email);
        console.log("✅ Email format is valid\n");
        break;
      } catch (error) {
        console.log(`❌ ${error.message}. Please try again.\n`);
      }
    } while (true);

    // First name input
    let firstName;
    do {
      firstName = await question("👤 Enter First Name: ");
      if (firstName.trim().length >= 2) {
        console.log("✅ First name accepted\n");
        break;
      } else {
        console.log(
          "❌ First name must be at least 2 characters. Please try again.\n"
        );
      }
    } while (true);

    // Last name input
    let lastName;
    do {
      lastName = await question("👤 Enter Last Name: ");
      if (lastName.trim().length >= 2) {
        console.log("✅ Last name accepted\n");
        break;
      } else {
        console.log(
          "❌ Last name must be at least 2 characters. Please try again.\n"
        );
      }
    } while (true);

    // Phone number (optional)
    const phoneNumber = await question(
      "📱 Enter Phone Number (optional, press Enter to skip): "
    );
    if (phoneNumber.trim()) {
      console.log("✅ Phone number added\n");
    } else {
      console.log("⏭️ Phone number skipped\n");
    }

    // Password requirements display
    console.log("🔒 Password Requirements:");
    console.log("  • At least 6 characters long");
    console.log("");

    // Password input with validation
    let password, confirmPassword;
    do {
      try {
        password = await questionHidden("🔑 Enter Password: ");
        validatePassword(password);
        console.log("✅ Password meets requirements\n");

        confirmPassword = await questionHidden("🔑 Confirm Password: ");

        if (password === confirmPassword) {
          console.log("✅ Passwords match!\n");
          break;
        } else {
          console.log("❌ Passwords do not match. Please try again.\n");
        }
      } catch (error) {
        console.log(`❌ ${error.message}\n`);
      }
    } while (true);

    // Confirmation summary
    console.log("📋 Admin Account Summary:");
    console.log("========================");
    console.log(`Name: ${firstName} ${lastName}`);
    console.log(`Email: ${email}`);
    console.log(`Phone: ${phoneNumber || "Not provided"}`);
    console.log(`Role: Super Administrator`);
    console.log("");

    // Final confirmation
    const confirm = await question("✅ Create this admin account? (yes/no): ");
    if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
      console.log("❌ Admin creation cancelled.");
      rl.close();
      return;
    }

    console.log("\n⏳ Creating super admin account...");
    console.log("🔄 Step 1: Creating authentication user...");

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } =
      await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined,
          data: {
            user_type: "admin",
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

    if (authError) {
      if (authError.message.includes("User already registered")) {
        console.log(
          "⚠️ User already exists in auth system, trying to use existing user..."
        );

        // Try to get the existing user
        const { data: signInData, error: signInError } =
          await supabaseClient.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) {
          throw new Error(
            `User exists but password doesn't match: ${signInError.message}`
          );
        }

        // Use the existing user data
        authData.user = signInData.user;
      } else {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }
    }

    console.log("✅ Step 1 complete: Authentication user ready");
    console.log(`   User ID: ${authData.user.id}`);
    console.log("🔄 Step 2: Creating user record...");

    // Step 2: Create user record
    let newUser;
    try {
      const { data: insertedUser, error: userError } = await supabaseClient
        .from("users")
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          user_type: "admin",
          is_email_verified: true,
          auth_managed: true,
        })
        .select()
        .single();

      if (userError) {
        // Check if user already exists in database
        const { data: existingUser, error: checkError } = await supabaseClient
          .from("users")
          .select("*")
          .eq("id", authData.user.id)
          .single();

        if (existingUser) {
          console.log(
            "⚠️ User already exists in database, using existing record"
          );
          newUser = existingUser;
        } else {
          throw new Error(`Failed to create user: ${userError.message}`);
        }
      } else {
        newUser = insertedUser;
      }
    } catch (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log("✅ Step 2 complete: User record ready");
    console.log("🔄 Step 3: Creating admin profile...");

    // Step 3: Create admin profile
    let adminProfile;
    try {
      // Check if admin profile already exists
      const { data: existingProfile } = await supabaseClient
        .from("admin_profiles")
        .select("*")
        .eq("user_id", newUser.id)
        .single();

      if (existingProfile) {
        console.log("⚠️ Admin profile already exists, using existing profile");
        adminProfile = existingProfile;
      } else {
        const { data: insertedProfile, error: profileError } =
          await supabaseClient
            .from("admin_profiles")
            .insert({
              user_id: newUser.id,
              first_name: firstName,
              last_name: lastName,
              phone: phoneNumber || null,
              is_super_admin: true,
            })
            .select()
            .single();

        if (profileError) {
          throw new Error(
            `Failed to create admin profile: ${profileError.message}`
          );
        }

        adminProfile = insertedProfile;
      }
    } catch (profileDbError) {
      throw new Error(
        `Admin profile database error: ${profileDbError.message}`
      );
    }

    console.log("✅ Step 3 complete: Admin profile ready");
    console.log("🔄 Step 4: Logging admin creation...");

    // Step 4: Log admin creation (optional - skip if table doesn't exist)
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: newUser.id,
        action: "SUPER_ADMIN_CREATED",
        resource_type: "admin_profile",
        resource_id: adminProfile.id,
        new_values: {
          email: newUser.email,
          created_by: "SYSTEM_SCRIPT",
        },
        ip_address: "127.0.0.1",
      });
      console.log("✅ Step 4 complete: Audit log created");
    } catch (auditError) {
      console.log("⚠️ Audit log failed but continuing:", auditError.message);
      console.log("✅ Step 4 complete: Skipped audit log");
    }

    console.log("\n🎉 SUCCESS! Super Admin created successfully!");
    console.log("==========================================");
    console.log(`👤 Name: ${firstName} ${lastName}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🆔 User ID: ${newUser.id}`);
    console.log(`🔧 Admin Profile ID: ${adminProfile.id}`);
    console.log(`📅 Created: ${new Date().toLocaleString()}`);
    console.log("\n🚀 Next Steps:");
    console.log("1. Test login with these credentials");
    console.log("2. Create admin login endpoints");
    console.log("3. Build admin dashboard");
    console.log("\n💡 Admin Login Endpoint: POST /api/admin/login");
  } catch (error) {
    console.error("\n💥 Error creating super admin:", error.message);
    console.log("\n🔧 The constraint is still not properly updated.");
    console.log(
      "Please run the SQL commands shown above in your Supabase SQL Editor."
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  createSuperAdmin();
}

module.exports = { createSuperAdmin };
