-- Academic Programs Management Schema
-- Run this in your Supabase SQL Editor

-- Drop existing table if it exists to recreate with correct structure
DROP TABLE IF EXISTS public.academic_programs CASCADE;

-- Create academic_programs table with correct column names
CREATE TABLE IF NOT EXISTS public.academic_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_id UUID NOT NULL REFERENCES public.university_profiles(id) ON DELETE CASCADE,
  program TEXT NOT NULL,
  faculty TEXT NOT NULL,
  duration TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure unique programs per university
  UNIQUE(university_id, program)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_academic_programs_university_id ON public.academic_programs(university_id);
CREATE INDEX IF NOT EXISTS idx_academic_programs_is_active ON public.academic_programs(is_active);
CREATE INDEX IF NOT EXISTS idx_academic_programs_created_at ON public.academic_programs(created_at);
CREATE INDEX IF NOT EXISTS idx_academic_programs_created_by ON public.academic_programs(created_by);

-- Enable RLS
ALTER TABLE public.academic_programs ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for all operations
DROP POLICY IF EXISTS "Allow all operations on academic_programs" ON public.academic_programs;
CREATE POLICY "Allow all operations on academic_programs" 
  ON public.academic_programs FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.academic_programs TO anon, authenticated;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_academic_programs_updated_at ON public.academic_programs;
CREATE TRIGGER update_academic_programs_updated_at 
    BEFORE UPDATE ON public.academic_programs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.academic_programs IS 'Academic programs offered by universities';

-- Insert some sample data for testing (if table is empty)
INSERT INTO public.academic_programs (university_id, program, faculty, duration, is_active, created_by)
SELECT 
    up.id,
    'Bachelor of Science in Computer Science',
    'Faculty of Science and Technology',
    '4 Years',
    true,
    NULL
FROM public.university_profiles up
WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_programs ap WHERE ap.university_id = up.id
)
LIMIT 1;

INSERT INTO public.academic_programs (university_id, program, faculty, duration, is_active, created_by)
SELECT 
    up.id,
    'Bachelor of Business Administration',
    'Faculty of Business',
    '3 Years',
    true,
    NULL
FROM public.university_profiles up
WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_programs ap WHERE ap.university_id = up.id AND ap.program = 'Bachelor of Business Administration'
)
LIMIT 1;

-- Verify the table was created with correct structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'academic_programs'
ORDER BY ordinal_position;

-- Show current programs
SELECT 
    ap.*,
    up.name as university_name
FROM public.academic_programs ap
JOIN public.university_profiles up ON ap.university_id = up.id
ORDER BY ap.created_at DESC;
