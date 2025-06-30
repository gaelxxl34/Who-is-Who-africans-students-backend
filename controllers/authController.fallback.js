const { supabaseClient } = require("../config/supabase");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Simple password hashing function using Node.js crypto module
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
};

// Verify password against stored hash
const verifyPassword = (password, storedHash) => {
  const [salt, hash] = storedHash.split(":");
  const generatedHash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return hash === generatedHash;
};

// Register a new user
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

    if (!email || !password || !user_type) {
      return res.status(400).json({
        success: false,
        message: "Email, password and user type are required",
      });
    }

    // Check if user already exists
    const { data: existingUser, error: userCheckError } = await supabaseClient
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userCheckError && !userCheckError.message.includes("No rows found")) {
      throw userCheckError;
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Hash the password with crypto
    const hashedPassword = hashPassword(password);

    // Begin transaction
    // First create the user
    const { data: newUser, error: userError } = await supabaseClient
      .from("users")
      .insert({
        email,
        password_hash: hashedPassword,
        user_type,
      })
      .select("id")
      .single();

    if (userError) {
      throw userError;
    }

    // Then create the profile based on user type
    if (user_type === "student") {
      const { error: profileError } = await supabaseClient
        .from("student_profiles")
        .insert({
          user_id: newUser.id,
          first_name: firstName,
          last_name: lastName,
          phone: phoneNumber,
        });

      if (profileError) {
        throw profileError;
      }
    } else if (user_type === "employer") {
      const { error: profileError } = await supabaseClient
        .from("employer_profiles")
        .insert({
          user_id: newUser.id,
          company_name,
          industry,
          phone: phoneNumber,
          country,
          city,
        });

      if (profileError) {
        throw profileError;
      }
    }

    // Create and sign JWT token
    const token = jwt.sign(
      { userId: newUser.id, email, userType: user_type },
      process.env.JWT_SECRET || "fallback_secret_key",
      { expiresIn: "24h" }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: newUser.id,
        email,
        userType: user_type,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🔐 FALLBACK LOGIN attempt for:", email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // First try Supabase Auth login (primary authentication)
    console.log("🔑 Attempting Supabase Auth login...");
    const { data: authData, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      console.error("❌ Supabase Auth login failed:", authError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
        debug: authError.message,
      });
    }

    console.log("✅ Supabase Auth login successful for:", authData.user.email);

    // Check if user exists in our custom users table using multiple methods
    console.log("🔍 Searching for user in custom table...");

    // Try case-insensitive search first (more reliable)
    let { data: user, error: userError } = await supabaseClient
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (userError && !userError.message.includes("No rows found")) {
      console.error("❌ Database error checking user:", userError);
      throw userError;
    }

    // If still not found, try exact match
    if (!user) {
      console.log("🔍 Trying exact email match...");
      const { data: exactUser, error: exactError } = await supabaseClient
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      user = exactUser;
      userError = exactError;
    }

    // If still not found, try matching by Supabase Auth ID
    if (!user) {
      console.log("🔍 Trying to find by Supabase Auth ID...");
      const { data: idUser, error: idError } = await supabaseClient
        .from("users")
        .select("*")
        .eq("id", authData.user.id)
        .maybeSingle();

      user = idUser;
      userError = idError;
    }

    if (!user) {
      console.log(
        "❌ User not found in custom table despite existing in Supabase Auth"
      );
      console.log("🔍 Auth user data:", {
        id: authData.user.id,
        email: authData.user.email,
        created_at: authData.user.created_at,
      });

      return res.status(500).json({
        success: false,
        message:
          "User authentication succeeded but profile not found. Please contact support.",
        debug: {
          authUserId: authData.user.id,
          authUserEmail: authData.user.email,
          searchAttempts: ["ilike email", "exact email", "by auth id"],
        },
      });
    }

    console.log("✅ User found in database:", user.email);

    // Generate JWT token for your app
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.user_type,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Update last login time
    try {
      await supabaseClient
        .from("users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", user.id);
    } catch (updateError) {
      console.warn("⚠️ Failed to update last login:", updateError.message);
    }

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
      },
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

// Verify token
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
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret_key"
    );

    // Check if user still exists
    const { data: user, error: userError } = await supabaseClient
      .from("users")
      .select("id, email, user_type")
      .eq("id", decoded.userId)
      .single();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid token",
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
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};
