-- Who is Who Educhain - Registration Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a basic auth table for all users (just email and password for authentication)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('student', 'employer')), 
  is_email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can read and update their own data
CREATE POLICY "Allow users to read their own data" 
  ON public.users FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Allow users to update their own data" 
  ON public.users FOR UPDATE USING (auth.uid() = id);

-- Student profiles can be read by the owner
CREATE POLICY "Allow student profile read by owner" 
  ON public.student_profiles FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Allow student profile update by owner" 
  ON public.student_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Employer profiles can be read by the owner
CREATE POLICY "Allow employer profile read by owner" 
  ON public.employer_profiles FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Allow employer profile update by owner" 
  ON public.employer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Add useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON public.users(user_type);
CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON public.student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_user_id ON public.employer_profiles(user_id);
