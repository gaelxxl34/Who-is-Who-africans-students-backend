/**
 * Script to initialize Supabase tables and policies
 * Run with: node scripts/init-supabase.js
 */

require("dotenv").config();
const { supabaseAdmin } = require("../config/supabase");

const initializeDatabase = async () => {
  try {
    console.log("🚀 Initializing Supabase database...");

    // Create health_check table for connection testing
    const { error: healthCheckError } = await supabaseAdmin.rpc(
      "create_table_if_not_exists",
      {
        table_name: "health_check",
        table_definition: `
        id uuid primary key default uuid_generate_v4(),
        status text not null,
        created_at timestamp with time zone default now()
      `,
      }
    );

    if (healthCheckError) {
      console.error("Error creating health_check table:", healthCheckError);
    } else {
      // Insert test data
      const { error: insertError } = await supabaseAdmin
        .from("health_check")
        .insert({ status: "OK" })
        .select();

      if (insertError) {
        console.error("Error inserting into health_check:", insertError);
      } else {
        console.log("✅ Health check table created and seeded");
      }
    }

    // Create main tables for the application
    const tables = [
      {
        name: "universities",
        definition: `
          id uuid primary key default uuid_generate_v4(),
          name text not null,
          country text not null,
          website text,
          contact_email text,
          contact_phone text,
          verified boolean default false,
          created_at timestamp with time zone default now(),
          updated_at timestamp with time zone default now()
        `,
      },
      {
        name: "students",
        definition: `
          id uuid primary key default uuid_generate_v4(),
          student_id text not null,
          first_name text not null,
          last_name text not null,
          email text,
          university_id uuid references universities(id),
          created_at timestamp with time zone default now(),
          updated_at timestamp with time zone default now(),
          unique(student_id, university_id)
        `,
      },
      {
        name: "credentials",
        definition: `
          id uuid primary key default uuid_generate_v4(),
          student_id uuid references students(id),
          credential_type text not null,
          program text not null,
          issue_date date not null,
          expiry_date date,
          blockchain_hash text,
          verified boolean default false,
          created_at timestamp with time zone default now(),
          updated_at timestamp with time zone default now()
        `,
      },
      {
        name: "verification_logs",
        definition: `
          id uuid primary key default uuid_generate_v4(),
          credential_id uuid references credentials(id),
          verifier_email text,
          verifier_organization text,
          verified_at timestamp with time zone default now(),
          verification_result boolean not null,
          ip_address text
        `,
      },
    ];

    // Create each table
    for (const table of tables) {
      const { error } = await supabaseAdmin.rpc("create_table_if_not_exists", {
        table_name: table.name,
        table_definition: table.definition,
      });

      if (error) {
        console.error(`Error creating ${table.name} table:`, error);
      } else {
        console.log(`✅ Created table: ${table.name}`);
      }
    }

    console.log("✅ Database initialization completed");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
};

// Run the initialization
initializeDatabase();
