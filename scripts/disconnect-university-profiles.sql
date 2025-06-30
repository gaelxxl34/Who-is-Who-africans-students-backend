-- Script to disconnect university_profiles from users table
-- Run this in your Supabase SQL Editor

-- First check if there's a foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'university_profiles_user_id_fkey'
    AND table_name = 'university_profiles'
  ) THEN
    -- Drop the foreign key constraint
    ALTER TABLE public.university_profiles
    DROP CONSTRAINT university_profiles_user_id_fkey;
    
    RAISE NOTICE 'Foreign key constraint removed';
  END IF;
END
$$;

-- Make user_id nullable
ALTER TABLE public.university_profiles
ALTER COLUMN user_id DROP NOT NULL;

-- Drop any unique constraint related to user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'university_profiles_user_id_key'
    AND table_name = 'university_profiles'
  ) THEN
    ALTER TABLE public.university_profiles
    DROP CONSTRAINT university_profiles_user_id_key;
    
    RAISE NOTICE 'Unique constraint on user_id removed';
  END IF;
END
$$;

-- Add email column if it doesn't exist
ALTER TABLE public.university_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Make email required and unique
ALTER TABLE public.university_profiles
ALTER COLUMN email SET NOT NULL;

-- Add unique constraint on email if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'university_profiles_email_unique'
    AND table_name = 'university_profiles'
  ) THEN
    ALTER TABLE public.university_profiles
    ADD CONSTRAINT university_profiles_email_unique UNIQUE (email);
    
    RAISE NOTICE 'Unique constraint on email added';
  END IF;
END
$$;

-- Update existing records to ensure they have an email
UPDATE public.university_profiles up
SET email = (SELECT u.email FROM public.users u WHERE u.id = up.user_id)
WHERE email IS NULL AND user_id IS NOT NULL;

-- Show the final structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'university_profiles'
ORDER BY ordinal_position;

-- Verify constraints
SELECT 
    tc.constraint_name, 
    tc.constraint_type, 
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'university_profiles'
ORDER BY tc.constraint_name;
