const express = require("express");
const router = express.Router();
const { supabaseClient } = require("../config/supabase");

// Test Supabase connection
router.get("/test-supabase", async (req, res) => {
  try {
    console.log("🔍 Testing Supabase connection...");

    // Test users table directly
    const { data, error, count } = await supabaseClient
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
      usersCount: count || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("💥 Supabase test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to connect to Supabase",
      error: error.message,
    });
  }
});

module.exports = router;
