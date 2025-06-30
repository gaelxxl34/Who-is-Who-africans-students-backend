-- Simple health check table for Who is Who Educhain
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Health check table for API testing
CREATE TABLE IF NOT EXISTS public.health_check (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert a test record
INSERT INTO public.health_check (status) VALUES ('OK');

-- Enable Row Level Security but allow anonymous access for health checks
ALTER TABLE public.health_check ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read the health check data
CREATE POLICY "Allow anonymous select on health_check" 
  ON public.health_check FOR SELECT USING (true);
