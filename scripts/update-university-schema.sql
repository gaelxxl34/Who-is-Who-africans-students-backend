-- Add email column to university_profiles table
ALTER TABLE public.university_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Make email required
ALTER TABLE public.university_profiles
ALTER COLUMN email SET NOT NULL;

-- Add unique constraint on email
ALTER TABLE public.university_profiles
ADD CONSTRAINT university_profiles_email_unique UNIQUE (email);

-- Remove user_id foreign key since we won't need authentication
-- First check if there's a foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'university_profiles_user_id_fkey'
    AND table_name = 'university_profiles'
  ) THEN
    ALTER TABLE public.university_profiles
    DROP CONSTRAINT university_profiles_user_id_fkey;
  END IF;
END
$$;

-- Make user_id nullable (for existing records) since it won't be required anymore
ALTER TABLE public.university_profiles
ALTER COLUMN user_id DROP NOT NULL;
