const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Get environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Helper function to decode and validate JWT
const validateJWT = (token, keyName) => {
  try {
    if (!token) return { valid: false, error: `${keyName} is missing` };

    // Decode JWT payload (without verification for inspection)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: `${keyName} is not a valid JWT format` };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    console.log(`🔍 ${keyName} payload:`, payload);

    // Check if it's a Supabase token
    if (payload.iss !== "supabase") {
      return { valid: false, error: `${keyName} is not a Supabase token` };
    }

    // Check role for service key
    if (
      keyName === "SUPABASE_SERVICE_ROLE_KEY" &&
      payload.role !== "service_role"
    ) {
      return {
        valid: false,
        error: `${keyName} does not have service_role permission. Found role: ${payload.role}`,
      };
    }

    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return { valid: false, error: `${keyName} has expired` };
    }

    return { valid: true, payload };
  } catch (error) {
    return {
      valid: false,
      error: `${keyName} is malformed: ${error.message}`,
    };
  }
};

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "⚠️ Missing Supabase configuration. Please check your .env file."
  );
  console.error("Required variables: SUPABASE_URL, SUPABASE_ANON_KEY");
  console.error("Required for user creation: SUPABASE_SERVICE_ROLE_KEY");
  console.error("Current values:", {
    SUPABASE_URL: SUPABASE_URL || "missing",
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? "set" : "missing",
    SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
  });
}

// Validate the keys
const anonValidation = validateJWT(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
if (!anonValidation.valid) {
  console.error(`❌ ANON KEY ERROR: ${anonValidation.error}`);
}

const serviceValidation = validateJWT(
  SUPABASE_SERVICE_ROLE_KEY,
  "SUPABASE_SERVICE_ROLE_KEY"
);
if (!serviceValidation.valid) {
  console.error(`❌ SERVICE ROLE KEY ERROR: ${serviceValidation.error}`);
}

// Create clients with proper configuration for admin authentication
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const supabaseAdmin =
  SUPABASE_SERVICE_ROLE_KEY && serviceValidation.valid
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

// Add helper function for admin authentication
const authenticateAdminWithSupabase = async (email, password) => {
  try {
    console.log("🔐 Attempting Supabase Auth for admin:", email);

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      console.error("❌ Supabase Auth error:", error.message);
      throw error;
    }

    console.log("✅ Supabase Auth successful for admin");

    // Immediately sign out to clear session (we use JWT instead)
    await supabaseClient.auth.signOut();

    return data;
  } catch (error) {
    console.error("❌ Admin Supabase Auth failed:", error);
    throw error;
  }
};

// Test the connections at startup
const testConnections = async () => {
  try {
    console.log("🧪 Testing Supabase connections...");

    // Test anon client
    const { data: anonTest, error: anonError } = await supabaseClient
      .from("users")
      .select("count")
      .limit(1);

    if (anonError) {
      console.error("❌ Anon client test failed:", anonError.message);
    } else {
      console.log("✅ Anon client working");
    }

    // Test admin client
    if (supabaseAdmin) {
      const { data: adminTest, error: adminError } = await supabaseAdmin
        .from("users")
        .select("count")
        .limit(1);

      if (adminError) {
        console.error("❌ Admin client test failed:", adminError.message);
      } else {
        console.log("✅ Admin client working");
      }
    }
  } catch (error) {
    console.error("❌ Connection test failed:", error.message);
  }
};

// Run connection test after a brief delay
setTimeout(testConnections, 1000);

// Log connection status on startup
console.log("🔌 Supabase client initialized");
if (supabaseAdmin) {
  console.log("✅ Supabase admin client initialized (with service role)");
} else {
  console.error("❌ CRITICAL: Supabase admin client not available");
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not provided or invalid");
}

module.exports = {
  supabaseClient,
  supabaseAdmin,
  authenticateAdminWithSupabase, // Export the helper function
};
