-- Create graduate_records table for academic credentials
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create graduate_records table
CREATE TABLE IF NOT EXISTS public.graduate_records (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- University relationship
  university_id UUID NOT NULL REFERENCES public.university_profiles(id) ON DELETE CASCADE,
  
  -- Academic program relationship
  program_id UUID NOT NULL REFERENCES public.academic_programs(id),
  
  -- Student information - simplified to match actual usage
  student_full_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  graduation_year INTEGER NOT NULL,
  
  -- Document links
  certificate_url TEXT,
  transcript_url TEXT,
  certificate_hash TEXT,  -- For blockchain verification
  transcript_hash TEXT,   -- For blockchain verification
  
  -- Verification status
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES public.users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Blockchain verification
  blockchain_tx_id TEXT,
  blockchain_verified BOOLEAN DEFAULT false,
  blockchain_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps and audit
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_graduate_records_university_id ON public.graduate_records(university_id);
CREATE INDEX IF NOT EXISTS idx_graduate_records_program_id ON public.graduate_records(program_id);
CREATE INDEX IF NOT EXISTS idx_graduate_records_registration_number ON public.graduate_records(registration_number);
CREATE INDEX IF NOT EXISTS idx_graduate_records_graduation_year ON public.graduate_records(graduation_year);
CREATE INDEX IF NOT EXISTS idx_graduate_records_is_verified ON public.graduate_records(is_verified);

-- Add table comment
COMMENT ON TABLE public.graduate_records IS 'Stores verified academic credentials for graduates with document links and blockchain verification';

-- Enable Row Level Security
ALTER TABLE public.graduate_records ENABLE ROW LEVEL SECURITY;

-- DROP any conflicting policies if needed:
DROP POLICY IF EXISTS "Allow all operations on graduate_records" ON public.graduate_records;

-- Drop policies to avoid conflicts
DROP POLICY IF EXISTS "Universities can view their own graduates" ON public.graduate_records;
DROP POLICY IF EXISTS "Insert graduate records by admin" ON public.graduate_records;
DROP POLICY IF EXISTS "Universities can update their own graduates" ON public.graduate_records;
DROP POLICY IF EXISTS "Admins have full access to graduate records" ON public.graduate_records;

-- Create policies for access control
-- Universities can only see their own graduates
CREATE POLICY "Universities can view their own graduates" 
  ON public.graduate_records 
  FOR SELECT
  USING (university_id IN (
    SELECT university_id FROM public.university_admin_profiles 
    WHERE user_id = auth.uid()
  ));

-- Drop conflicting INSERT policy if exists:
DROP POLICY IF EXISTS "Insert graduate records by admin" ON public.graduate_records;

-- Create policy for INSERT using only WITH CHECK expression:
CREATE POLICY "Insert graduate records by admin" 
  ON public.graduate_records
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND university_id = (
      SELECT university_id 
      FROM public.university_admin_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Universities can only update their own records
CREATE POLICY "Universities can update their own graduates" 
  ON public.graduate_records 
  FOR UPDATE
  USING (university_id IN (
    SELECT university_id FROM public.university_admin_profiles 
    WHERE user_id = auth.uid()
  ));

-- Admins have full access
CREATE POLICY "Admins have full access to graduate records" 
  ON public.graduate_records 
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE user_id = auth.uid()
  ));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_graduate_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop the trigger if it already exists to avoid conflict
DROP TRIGGER IF EXISTS update_graduate_records_updated_at ON public.graduate_records;

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_graduate_records_updated_at 
    BEFORE UPDATE ON public.graduate_records 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.graduate_records TO anon, authenticated;

-- Success message
SELECT 'Graduate Records table created successfully!' AS result;
