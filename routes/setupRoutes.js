const express = require("express");
const router = express.Router();
const { supabaseClient } = require("../config/supabase");

// Get database structure
router.get("/db-structure", async (req, res) => {
  try {
    // Get list of tables
    const { data: tables, error: tablesError } = await supabaseClient
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");

    if (tablesError) {
      throw tablesError;
    }

    // Get columns for each table
    const tableStructure = {};
    for (const table of tables) {
      const { data: columns, error: columnsError } = await supabaseClient
        .from("information_schema.columns")
        .select("column_name, data_type")
        .eq("table_name", table.table_name)
        .eq("table_schema", "public");

      if (!columnsError) {
        tableStructure[table.table_name] = columns;
      }
    }

    res.json({
      success: true,
      message: "Database structure retrieved",
      tables: tables.map((t) => t.table_name),
      structure: tableStructure,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get database structure",
      error: error.message,
    });
  }
});

// Create SQL for missing tables
router.get("/create-tables-sql", (req, res) => {
  const createUsersTableSQL = `
    -- Create users table if it doesn't exist
    CREATE TABLE IF NOT EXISTS public.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      user_type VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Enable Row Level Security
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    
    -- Create basic RLS policy
    CREATE POLICY "Allow all for now" ON public.users
      FOR ALL USING (true);
  `;

  res.json({
    success: true,
    message: "SQL generated for creating basic tables",
    sql: createUsersTableSQL,
    instructions:
      "Run this SQL in your Supabase SQL Editor to create the missing tables",
  });
});

// Simple create test user endpoint
router.post("/create-test-user", async (req, res) => {
  try {
    // Create basic test user with minimal fields
    const { data: user, error } = await supabaseClient
      .from("users")
      .insert({
        email: `test-user-${Date.now()}@example.com`,
        user_type: "student",
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: "Test user created successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create test user",
      error: error.message,
    });
  }
});

module.exports = router;
