require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Please check your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log("Setting up database tables...");

  try {
    console.log("Checking Supabase permissions...");

    // First try direct SQL execution to test permissions
    const { error: sqlTestError } = await supabase
      .rpc("execute_sql", {
        sql_query: "SELECT current_user, current_setting('role');",
      })
      .catch((e) => ({ error: e }));

    // If execute_sql RPC doesn't exist or permissions are insufficient
    if (sqlTestError) {
      console.log("\n⚠️ Note about Supabase permissions:");
      console.log(
        "Your connection doesn't have permission to execute SQL directly or the RPC function isn't enabled."
      );
      console.log("This is normal with the anon key. You have two options:");
      console.log(
        "1. Use the Supabase dashboard to create tables (recommended for production)"
      );
      console.log(
        "2. Use the service_role key in your .env for development (keep this secure!)"
      );

      console.log("\n📋 Manual Table Creation Instructions:");
      console.log("1. Go to https://app.supabase.io/project/_/sql");
      console.log("2. Run the following SQL:");
      console.log(`
CREATE TABLE IF NOT EXISTS public.health_check (
  id uuid primary key default uuid_generate_v4(),
  status text not null,
  created_at timestamp with time zone default now()
);

-- Enable row level security
ALTER TABLE public.health_check ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow anonymous select" ON public.health_check 
  FOR SELECT USING (true);
  
-- Insert initial record
INSERT INTO public.health_check (status) VALUES ('OK');
      `);

      console.log(
        "\nAfter creating tables manually, run your API server again."
      );
      return;
    }

    // Create the health_check table using SQL query
    const { error: tableError } = await supabase
      .from("health_check")
      .select("id")
      .limit(1)
      .catch(() => ({ error: { message: "Table does not exist" } }));

    if (tableError) {
      console.log("Creating health_check table...");

      // Use SQL to create the table
      const { error: createError } = await supabase
        .rpc("execute_sql", {
          sql_query: `
          CREATE TABLE IF NOT EXISTS public.health_check (
            id uuid primary key default uuid_generate_v4(),
            status text not null,
            created_at timestamp with time zone default now()
          );
        `,
        })
        .catch((e) => {
          console.error(
            "SQL execution failed. Trying direct SQL via REST:",
            e.message
          );
          return { error: e };
        });

      if (createError) {
        // If SQL RPC doesn't work, show instructions for manual creation
        console.error("Could not create health_check table automatically.");
        console.log(
          "\nPlease run the following SQL in your Supabase SQL editor:"
        );
        console.log(`
CREATE TABLE IF NOT EXISTS public.health_check (
  id uuid primary key default uuid_generate_v4(),
  status text not null,
  created_at timestamp with time zone default now()
);

INSERT INTO public.health_check (status) VALUES ('OK');
        `);
        return;
      }

      // Insert a test record
      const { error: insertError } = await supabase
        .from("health_check")
        .insert({ status: "OK" })
        .select();

      if (insertError) {
        console.error("Failed to insert test record:", insertError.message);
      } else {
        console.log(
          "Successfully created health_check table and inserted test record."
        );
      }
    } else {
      console.log("health_check table already exists.");
    }

    console.log("\nDatabase setup completed successfully!");
    console.log("You can now run the API server.");
  } catch (err) {
    console.error("Database setup failed:", err);
  }
}

// Add a new function to check and explain permissions
async function explainSupabaseApproach() {
  console.log("\n📚 Working with Supabase - Key Differences from Firebase:");
  console.log("Unlike Firebase, Supabase is built on PostgreSQL, which means:");
  console.log(
    "1. Database schema must be defined before use (tables, columns, relationships)"
  );
  console.log(
    "2. Security is handled through PostgreSQL's Row Level Security (RLS)"
  );
  console.log(
    "3. The anon key has limited permissions by default for security"
  );

  console.log("\n🔧 Three ways to set up your Supabase schema:");
  console.log(
    "1. Supabase Dashboard (SQL Editor or Table Editor) - Most beginner-friendly"
  );
  console.log(
    "2. Migration scripts with service_role key - Good for version control"
  );
  console.log(
    "3. Database webhooks or functions - Advanced, for dynamic schema changes"
  );

  console.log("\n✅ Recommended approach for your project:");
  console.log(
    "For development: Create the initial schema using the SQL Editor in Supabase Dashboard"
  );
  console.log("For production: Use migration scripts in version control");
  console.log(
    "For local development: Set up a local Supabase instance using Docker"
  );
}

setupDatabase().then(() => {
  explainSupabaseApproach();
});
