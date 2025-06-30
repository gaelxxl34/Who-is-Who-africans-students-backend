-- Update university_profiles table to match ONLY the fields in the frontend create form
-- Run this in your Supabase SQL Editor

-- First, let's see the current structure of university_profiles table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_profiles'
ORDER BY ordinal_position;

-- Create a temporary table to track which columns to keep
CREATE TEMPORARY TABLE columns_to_keep (column_name TEXT);

-- Insert ONLY the columns that are in the frontend form
-- REMOVED all administrator-related columns
INSERT INTO columns_to_keep (column_name) VALUES
-- Primary key (always keep)
('id'),
-- Basic university information
('user_id'),
('name'),
('short_name'),
('phone'),
('country'),
('city'),
('address'),
('website'),
('logo_url'),
('registration_number'),
('accreditation_body'),
-- System fields
('is_active'),
('is_verified'),
('created_by'),
('created_at'),
('updated_at');

-- Dynamically drop all columns that are not in our "keep" list
-- This will automatically drop admin_first_name, admin_last_name, admin_email, 
-- admin_phone, admin_title, admin_department and any other columns
DO $$
DECLARE
    col record;
BEGIN
    FOR col IN 
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'university_profiles'
          AND column_name NOT IN (SELECT column_name FROM columns_to_keep)
    LOOP
        EXECUTE format('ALTER TABLE public.university_profiles DROP COLUMN IF EXISTS %I', col.column_name);
        RAISE NOTICE 'Dropped column: %', col.column_name;
    END LOOP;
END
$$;

-- Drop the temporary table
DROP TABLE columns_to_keep;

-- Make required fields NOT NULL
DO $$ 
BEGIN
    -- Set NOT NULL constraints for required fields
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'university_profiles' 
               AND column_name = 'name' 
               AND is_nullable = 'YES') THEN
        ALTER TABLE public.university_profiles ALTER COLUMN name SET NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'university_profiles' 
               AND column_name = 'country' 
               AND is_nullable = 'YES') THEN
        ALTER TABLE public.university_profiles ALTER COLUMN country SET NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'university_profiles' 
               AND column_name = 'city' 
               AND is_nullable = 'YES') THEN
        ALTER TABLE public.university_profiles ALTER COLUMN city SET NOT NULL;
    END IF;
END $$;

-- Add check constraints
DO $$ 
BEGIN
    -- Drop constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE table_name = 'university_profiles' 
               AND constraint_name = 'chk_website_format') THEN
        ALTER TABLE public.university_profiles DROP CONSTRAINT chk_website_format;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE table_name = 'university_profiles' 
               AND constraint_name = 'chk_logo_url_format') THEN
        ALTER TABLE public.university_profiles DROP CONSTRAINT chk_logo_url_format;
    END IF;
    
    -- Drop admin email constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE table_name = 'university_profiles' 
               AND constraint_name = 'chk_admin_email_format') THEN
        ALTER TABLE public.university_profiles DROP CONSTRAINT chk_admin_email_format;
    END IF;
END $$;

-- Now add the remaining constraints
ALTER TABLE public.university_profiles 
ADD CONSTRAINT chk_website_format 
CHECK (website IS NULL OR website ~ '^https?://.*');

ALTER TABLE public.university_profiles 
ADD CONSTRAINT chk_logo_url_format 
CHECK (logo_url IS NULL OR logo_url ~ '^https?://.*');

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_university_profiles_name 
ON public.university_profiles(name);

CREATE INDEX IF NOT EXISTS idx_university_profiles_short_name 
ON public.university_profiles(short_name);

-- Show the final structure of the updated table
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    CASE 
        WHEN column_name IN ('name', 'country', 'city') 
        THEN '✅ REQUIRED in frontend'
        WHEN column_name IN ('short_name', 'phone', 'address', 'website', 'logo_url', 'registration_number', 'accreditation_body')
        THEN '📝 OPTIONAL in frontend'
        WHEN column_name IN ('is_active', 'is_verified', 'user_id', 'created_by', 'created_at', 'updated_at', 'id')
        THEN '🔧 SYSTEM field'
        ELSE '❓ Check if needed'
    END as frontend_usage
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_profiles'
ORDER BY 
    CASE 
        WHEN column_name = 'id' THEN 1
        WHEN column_name = 'user_id' THEN 2
        WHEN column_name IN ('name', 'short_name', 'phone', 'country', 'city', 'address', 'website', 'logo_url') THEN 3
        WHEN column_name IN ('registration_number', 'accreditation_body') THEN 4
        WHEN column_name IN ('is_active', 'is_verified') THEN 5
        ELSE 6
    END,
    column_name;

-- Verify the cleanup was successful
SELECT COUNT(*) as total_columns,
       '✅ University profiles table updated to remove administrator columns' as status
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_profiles';
