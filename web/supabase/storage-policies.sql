-- Supabase Storage Policies for Audio Files
-- Run this in Supabase SQL Editor after creating the bucket

-- ============================================
-- STORAGE BUCKET: audio-files
-- ============================================

-- Policy: Allow public read access to audio files
-- This allows anyone to stream/preview audio files
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-files');

-- Policy: Allow authenticated users to upload files
-- For admin/upload functionality
CREATE POLICY "Authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-files' 
  AND auth.role() = 'authenticated'
);

-- Policy: Allow service role to do everything
-- For API routes and migrations
CREATE POLICY "Service role full access"
ON storage.objects FOR ALL
USING (
  bucket_id = 'audio-files' 
  AND auth.role() = 'service_role'
);

-- Policy: Allow service role to delete
-- For cleanup and management
CREATE POLICY "Service role delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio-files' 
  AND auth.role() = 'service_role'
);

-- ============================================
-- ALTERNATIVE: Simple Public Bucket
-- ============================================
-- If you want everything public (simpler, less secure):
-- Just set the bucket to "Public" in Supabase Dashboard
-- and skip these policies

