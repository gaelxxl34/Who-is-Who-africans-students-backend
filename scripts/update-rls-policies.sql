-- Who is Who Educhain - Complete Registration Schema with RLS Policies
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Revert to original users table structure that was working
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('student', 'employer', 'admin', 'university')), 
  is_email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Remove the password_hash column since we're using Supabase Auth
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;

-- Add auth_managed column if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_managed BOOLEAN DEFAULT true;

-- Student profiles table - only fields collected from the frontend
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Employer profiles table - only fields collected from the frontend
CREATE TABLE IF NOT EXISTS public.employer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  company_name TEXT NOT NULL,
  industry TEXT,
  phone TEXT,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Admin profiles table - UPDATED with required authentication fields
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin')),
  permissions TEXT[] DEFAULT ARRAY['users:read', 'users:write', 'universities:read', 'universities:write', 'admin:read', 'admin:write', 'dashboard:read', 'audit:read'],
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Add missing columns to existing admin_profiles table
ALTER TABLE public.admin_profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin' CHECK (role IN ('admin'));

ALTER TABLE public.admin_profiles 
ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT ARRAY['users:read', 'users:write', 'universities:read', 'universities:write', 'admin:read', 'admin:write', 'dashboard:read', 'audit:read'];

ALTER TABLE public.admin_profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Remove the useless columns
ALTER TABLE public.admin_profiles DROP COLUMN IF EXISTS locked_until;
ALTER TABLE public.admin_profiles DROP COLUMN IF EXISTS failed_login_attempts;

-- Update existing admin profiles to have the required fields with full permissions
UPDATE public.admin_profiles 
SET 
  role = COALESCE(role, 'admin'),
  permissions = COALESCE(permissions, ARRAY['users:read', 'users:write', 'universities:read', 'universities:write', 'admin:read', 'admin:write', 'dashboard:read', 'audit:read']),
  is_active = COALESCE(is_active, true)
WHERE role IS NULL OR permissions IS NULL OR is_active IS NULL;

-- University profiles table - for universities created by admins
CREATE TABLE IF NOT EXISTS public.university_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT,
  phone TEXT,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  website TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  registration_number TEXT,
  accreditation_body TEXT,
  last_login TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create university admin profiles table (if not exists)
CREATE TABLE IF NOT EXISTS public.university_admin_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES public.university_profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  role TEXT DEFAULT 'university_admin',
  permissions TEXT[] DEFAULT ARRAY['university:read', 'university:write'],
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(university_id, email) -- Prevent duplicate admins per university
);

-- Admin audit logs for tracking admin actions
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Admin sessions table for security tracking
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- University sessions table
CREATE TABLE IF NOT EXISTS public.university_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add email column for easier authentication lookup
ALTER TABLE public.university_admin_profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update email from user table for existing records
UPDATE public.university_admin_profiles 
SET email = users.email 
FROM public.users 
WHERE public.university_admin_profiles.user_id = public.users.id 
AND public.university_admin_profiles.email IS NULL;

-- Add index for authentication lookups
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_email ON public.university_admin_profiles(email);
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_university_id ON public.university_admin_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_is_active ON public.university_admin_profiles(is_active);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_records ENABLE ROW LEVEL SECURITY; -- Ensure this line is present or added
ALTER TABLE public.academic_programs ENABLE ROW LEVEL SECURITY; -- Ensure this line is present or added

-- Drop all existing policies (including the ones causing conflicts)
DROP POLICY IF EXISTS "Allow users to read their own data" ON public.users;
DROP POLICY IF EXISTS "Allow users to update their own data" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to insert their own record" ON public.users;
DROP POLICY IF EXISTS "Allow all operations on users" ON public.users;
DROP POLICY IF EXISTS "Allow student profile read by owner" ON public.student_profiles;
DROP POLICY IF EXISTS "Allow student profile update by owner" ON public.student_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert student profiles" ON public.student_profiles;
DROP POLICY IF EXISTS "Allow all operations on student_profiles" ON public.student_profiles;
DROP POLICY IF EXISTS "Allow employer profile read by owner" ON public.employer_profiles;
DROP POLICY IF EXISTS "Allow employer profile update by owner" ON public.employer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert employer profiles" ON public.employer_profiles;
DROP POLICY IF EXISTS "Allow all operations on employer_profiles" ON public.employer_profiles;
DROP POLICY IF EXISTS "Allow all operations on admin_profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Allow all operations on university_profiles" ON public.university_profiles;
DROP POLICY IF EXISTS "Allow all operations on admin_audit_logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Allow all operations on admin_sessions" ON public.admin_sessions;
DROP POLICY IF EXISTS "Allow all operations on university_sessions" ON public.university_sessions;
DROP POLICY IF EXISTS "Allow all operations on university_admin_profiles" ON public.university_admin_profiles;
DROP POLICY IF EXISTS "Allow all operations on graduate_records" ON public.graduate_records; -- Ensure this line is present or added
DROP POLICY IF EXISTS "Allow all operations on academic_programs" ON public.academic_programs; -- Ensure this line is present or added

-- Create simple permissive policies for custom authentication
-- Since you're handling auth in your app, we'll make RLS permissive
CREATE POLICY "Allow all operations on users" 
  ON public.users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on student_profiles" 
  ON public.student_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on employer_profiles" 
  ON public.employer_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on admin_profiles" 
  ON public.admin_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on university_profiles" 
  ON public.university_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on admin_audit_logs" 
  ON public.admin_audit_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on admin_sessions" 
  ON public.admin_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on university_sessions" 
  ON public.university_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on university_admin_profiles" 
  ON public.university_admin_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on graduate_records" 
  ON public.graduate_records FOR ALL USING (true) WITH CHECK (true); -- Ensure this line is present or added

CREATE POLICY "Allow all operations on academic_programs" 
  ON public.academic_programs FOR ALL USING (true) WITH CHECK (true); -- Ensure this line is present or added

-- Grant necessary permissions
GRANT ALL ON public.users TO anon, authenticated;
GRANT ALL ON public.student_profiles TO anon, authenticated;
GRANT ALL ON public.employer_profiles TO anon, authenticated;
GRANT ALL ON public.admin_profiles TO anon, authenticated;
GRANT ALL ON public.university_profiles TO anon, authenticated;
GRANT ALL ON public.admin_audit_logs TO anon, authenticated;
GRANT ALL ON public.admin_sessions TO anon, authenticated;
GRANT ALL ON public.university_sessions TO anon, authenticated;
GRANT ALL ON public.university_admin_profiles TO anon, authenticated;
GRANT ALL ON public.graduate_records TO anon, authenticated; -- Ensure this line is present or added
GRANT ALL ON public.academic_programs TO anon, authenticated; -- Ensure this line is present or added
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Add useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON public.users(user_type);
CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON public.student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_user_id ON public.employer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_user_id ON public.admin_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_university_profiles_user_id ON public.university_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_university_profiles_country ON public.university_profiles(country);
CREATE INDEX IF NOT EXISTS idx_university_profiles_is_active ON public.university_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id ON public.admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON public.admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_university_sessions_university_user_id ON public.university_sessions(university_user_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_email ON public.university_admin_profiles(email);
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_university_id ON public.university_admin_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_is_active ON public.university_admin_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_graduate_records_user_id ON public.graduate_records(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_programs_university_id ON public.academic_programs(university_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at on new tables
DROP TRIGGER IF EXISTS update_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER update_admin_profiles_updated_at 
    BEFORE UPDATE ON public.admin_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_university_profiles_updated_at ON public.university_profiles;
CREATE TRIGGER update_university_profiles_updated_at 
    BEFORE UPDATE ON public.university_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_university_admin_profiles_updated_at ON public.university_admin_profiles;
CREATE TRIGGER update_university_admin_profiles_updated_at 
    BEFORE UPDATE ON public.university_admin_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Also drop and recreate triggers for other tables to ensure consistency
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_profiles_updated_at ON public.student_profiles;
CREATE TRIGGER update_student_profiles_updated_at 
    BEFORE UPDATE ON public.student_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employer_profiles_updated_at ON public.employer_profiles;
CREATE TRIGGER update_employer_profiles_updated_at 
    BEFORE UPDATE ON public.employer_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify the admin_profiles table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'admin_profiles'
ORDER BY ordinal_position;

-- Verify all policies were created successfully
SELECT 
  tablename, 
  policyname, 
  permissive, 
  cmd,
  '✅ ALLOWS ALL OPERATIONS (needed for custom auth)' as description
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'student_profiles', 'employer_profiles', 'admin_profiles', 'university_profiles', 'admin_audit_logs', 'admin_sessions', 'university_sessions', 'university_admin_profiles', 'graduate_records', 'academic_programs') -- Added new tables
ORDER BY tablename, cmd;

-- Show current admin profiles to verify the update worked
SELECT id, user_id, first_name, last_name, role, permissions, is_active, created_at
FROM public.admin_profiles;

-- Add admin_level column to university_admin_profiles if it doesn't exist
ALTER TABLE public.university_admin_profiles 
ADD COLUMN IF NOT EXISTS admin_level TEXT DEFAULT 'admin' CHECK (admin_level IN ('admin', 'super_admin'));

-- Update existing records to have default admin level
UPDATE public.university_admin_profiles 
SET admin_level = 'admin' 
WHERE admin_level IS NULL;

-- Add index for admin_level for better query performance
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_admin_level ON public.university_admin_profiles(admin_level);

-- Remove password_hash column from university_admin_profiles since we're using Supabase Auth
ALTER TABLE public.university_admin_profiles DROP COLUMN IF EXISTS password_hash;

-- Add auth_managed column to track authentication method
ALTER TABLE public.university_admin_profiles 
ADD COLUMN IF NOT EXISTS auth_managed BOOLEAN DEFAULT true;

-- Update existing university admin profiles to use Supabase Auth
UPDATE public.university_admin_profiles 
SET auth_managed = true 
WHERE auth_managed IS NULL;

-- Add comment to clarify the authentication method
COMMENT ON TABLE public.university_admin_profiles IS 'University administrator profiles - authentication handled by Supabase Auth, not password hash';

