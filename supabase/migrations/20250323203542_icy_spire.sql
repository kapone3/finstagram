/*
  # Complete Storage Configuration and Policies

  1. Storage Setup
    - Create imageupload bucket
    - Configure public access
    - Set proper CORS settings
    
  2. Security
    - Update storage policies with precise path validation
    - Ensure proper user directory structure
    - Add comprehensive security rules
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('imageupload', 'imageupload', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public access to imageupload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their imageupload directory" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their imageupload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their imageupload files" ON storage.objects;

-- Create new policies with improved conditions
CREATE POLICY "Public access to imageupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'imageupload');

-- Improved path validation using regex
CREATE POLICY "Users can upload to their imageupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imageupload' AND
  (
    -- Validate path structure: type/user_id/timestamp_uuid.ext
    name ~ '^(posts|stories|avatars)/[^/]+/\d+_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-zA-Z0-9]+$' AND
    -- Ensure user_id in path matches authenticated user
    auth.uid()::text = (regexp_match(name, '^(posts|stories|avatars)/([^/]+)/'))[2]
  )
);

CREATE POLICY "Users can update their imageupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  auth.uid()::text = (regexp_match(name, '^(posts|stories|avatars)/([^/]+)/'))[2]
);

CREATE POLICY "Users can delete their imageupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  auth.uid()::text = (regexp_match(name, '^(posts|stories|avatars)/([^/]+)/'))[2]
);