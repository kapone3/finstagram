/*
  # Storage Configuration Fix

  1. Create Storage Bucket
    - Create 'imageupload' bucket if it doesn't exist
    - Set public access

  2. Security
    - Update storage policies to match path structure
    - Allow public read access
    - Allow authenticated users to upload/delete their own files
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('imageupload', 'imageupload', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Drop existing policies
DROP POLICY IF EXISTS "Public access to imageupload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their imageupload directory" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their imageupload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their imageupload files" ON storage.objects;

-- Create new policies
CREATE POLICY "Public access to imageupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'imageupload');

CREATE POLICY "Users can upload to their imageupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imageupload' AND
  auth.uid()::text = SPLIT_PART(name, '/', 2)
);

CREATE POLICY "Users can update their imageupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  auth.uid()::text = SPLIT_PART(name, '/', 2)
);

CREATE POLICY "Users can delete their imageupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  auth.uid()::text = SPLIT_PART(name, '/', 2)
);