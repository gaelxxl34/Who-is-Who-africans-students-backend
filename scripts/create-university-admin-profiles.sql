-- Who is Who Educhain - University Admin Profiles Creation Script
-- Run this in your Supabase SQL Editor

-- First, add 'university_admin' as a valid user type
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_user_type_check;

ALTER TABLE public.users 
ADD CONSTRAINT users_user_type_check 
CHECK (user_type IN ('student', 'employer', 'admin', 'university', 'university_admin'));

-- Create university_admin_profiles table
CREATE TABLE IF NOT EXISTS public.university_admin_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES public.university_profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT, -- e.g. "Vice Chancellor", "Registrar", "Academic Director"
  phone TEXT,
  role TEXT DEFAULT 'university_admin' CHECK (role IN ('university_admin', 'university_super_admin')),
  permissions TEXT[] DEFAULT ARRAY[
    'university:read', 
    'university:write', 
    'students:read', 
    'students:write', 
    'courses:read', 
    'courses:write',
    'transcripts:read',
    'transcripts:write',
    'certificates:read',
    'certificates:write'
  ],
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  UNIQUE(user_id), -- Each user can only have one university admin profile
  
  -- Ensure a user can only be admin for one university at a time
  CONSTRAINT one_university_per_admin UNIQUE(user_id)
);

-- Add comments for documentation
COMMENT ON TABLE public.university_admin_profiles IS 'University administrators who can manage their specific university data';
COMMENT ON COLUMN public.university_admin_profiles.user_id IS 'References the user account (must have user_type = university_admin)';
COMMENT ON COLUMN public.university_admin_profiles.university_id IS 'References the university this admin manages';
COMMENT ON COLUMN public.university_admin_profiles.title IS 'Job title within the university (e.g. Vice Chancellor, Registrar)';
COMMENT ON COLUMN public.university_admin_profiles.permissions IS 'Array of permissions for what this admin can do';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_user_id 
ON public.university_admin_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_university_id 
ON public.university_admin_profiles(university_id);

CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_is_active 
ON public.university_admin_profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_university_admin_profiles_created_at 
ON public.university_admin_profiles(created_at);

-- Enable RLS on the new table
ALTER TABLE public.university_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for our custom auth system
DROP POLICY IF EXISTS "Allow all operations on university_admin_profiles" ON public.university_admin_profiles;
CREATE POLICY "Allow all operations on university_admin_profiles" 
  ON public.university_admin_profiles FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.university_admin_profiles TO anon, authenticated;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_university_admin_profiles_updated_at ON public.university_admin_profiles;
CREATE TRIGGER update_university_admin_profiles_updated_at 
    BEFORE UPDATE ON public.university_admin_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CLEANUP: Remove unnecessary passwords table since we use Supabase Auth
-- Drop the table if it exists (safe operation)
DROP TABLE IF EXISTS public.passwords CASCADE;

-- Also remove any references to password-related functionality
-- Since we're using Supabase Auth, authentication is handled externally

-- Update university_profiles table to remove user_id dependency if it exists
-- Since university admins are separate from universities now
ALTER TABLE public.university_profiles DROP COLUMN IF EXISTS user_id;

-- Add email field to university_profiles if it doesn't exist
ALTER TABLE public.university_profiles ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Add index for university email
CREATE INDEX IF NOT EXISTS idx_university_profiles_email 
ON public.university_profiles(email);

-- Create a view for easy university admin management
CREATE OR REPLACE VIEW public.university_admin_view AS
SELECT 
  ua.id as admin_id,
  ua.user_id,
  u.email,
  ua.first_name,
  ua.last_name,
  ua.title,
  ua.phone,
  ua.role,
  ua.permissions,
  ua.is_active,
  ua.last_login,
  ua.created_at as admin_created_at,
  ua.updated_at as admin_updated_at,
  -- University information
  up.id as university_id,
  up.name as university_name,
  up.short_name as university_short_name,
  up.email as university_email,
  up.country as university_country,
  up.city as university_city,
  up.is_active as university_is_active
FROM public.university_admin_profiles ua
JOIN public.users u ON ua.user_id = u.id
JOIN public.university_profiles up ON ua.university_id = up.id;

-- Grant permissions on the view
GRANT SELECT ON public.university_admin_view TO anon, authenticated;

-- Create audit table for university admin actions
CREATE TABLE IF NOT EXISTS public.university_admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS and create policy for audit logs
ALTER TABLE public.university_admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on university_admin_audit_logs" ON public.university_admin_audit_logs;
CREATE POLICY "Allow all operations on university_admin_audit_logs" 
  ON public.university_admin_audit_logs FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.university_admin_audit_logs TO anon, authenticated;

-- Add index for audit logs
CREATE INDEX IF NOT EXISTS idx_university_admin_audit_logs_admin_user_id 
ON public.university_admin_audit_logs(university_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_audit_logs_created_at 
ON public.university_admin_audit_logs(created_at);

-- Insert some sample data (optional - remove if not needed)
-- First, let's create a sample university if none exists
INSERT INTO public.university_profiles (
  name, 
  short_name, 
  email, 
  country, 
  city, 
  is_active, 
  is_verified
) 
SELECT 
  'Makerere University',
  'MAK',
  'admin@mak.ac.ug',
  'Uganda',
  'Kampala',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.university_profiles WHERE email = 'admin@mak.ac.ug'
);

-- Verification queries to check everything was created correctly
SELECT 'University admin system created successfully - passwords table removed' as status;

-- Show the new table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_admin_profiles'
ORDER BY ordinal_position;

-- Show constraints
SELECT 
  constraint_name, 
  constraint_type
FROM information_schema.table_constraints 
WHERE table_schema = 'public' 
  AND table_name = 'university_admin_profiles';

-- Show indexes
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'university_admin_profiles';

-- Show the view structure
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_admin_view'
ORDER BY ordinal_position;

-- Show sample data from the view (will be empty initially)
SELECT COUNT(*) as university_admin_count 
FROM public.university_admin_view;

-- Show universities available for admin assignment
SELECT 
  id,
  name,
  short_name,
  email,
  country,
  city,
  is_active
FROM public.university_profiles
ORDER BY name;

-- Verify passwords table has been removed
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'passwords' AND table_schema = 'public')
    THEN '❌ Passwords table still exists'
    ELSE '✅ Passwords table successfully removed'
  END as cleanup_status;
