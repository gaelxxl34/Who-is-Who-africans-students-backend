require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Please check your .env file.");
  process.exit(1);
}

console.log("Supabase URL:", supabaseUrl);
console.log("Testing connection with anon key...");

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test basic connection
    const { data: authData, error: authError } =
      await supabase.auth.getSession();

    if (authError) {
      console.error("❌ Authentication error:", authError.message);
      return;
    }

    console.log("✅ Basic connection successful!");

    // Try to query the health_check table
    console.log("\nTesting health_check table...");
    const { data, error } = await supabase
      .from("health_check")
      .select("*")
      .limit(1);

    if (error) {
      if (error.message.includes("does not exist")) {
        console.error(
          "❌ The health_check table does not exist. Please run schema.sql in Supabase SQL Editor."
        );
      } else {
        console.error("❌ Error querying health_check table:", error.message);
      }
      return;
    }

    if (!data || data.length === 0) {
      console.log(
        "✅ Table exists but contains no data. Consider adding a test record."
      );
      return;
    }

    console.log("✅ Successfully connected to health_check table!");
    console.log("Data:", data);

    // If we got this far, everything is working
    console.log("\n🎉 Your Supabase connection is fully functional!");
    console.log("You can now run the API server with: npm run dev");
  } catch (err) {
    console.error("❌ Connection test failed:", err.message);
  }
}

testConnection();
