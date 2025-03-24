/*
  # Storage Bucket Policies for Image and Story Upload

  1. New Storage Buckets
    - imageupload: For posts and avatar images
    - storieupload: For story content

  2. Security
    - Enable policies for both buckets
    - Allow authenticated users to:
      - Upload files to their own user directory
      - Delete their own files
    - Allow public access to read files
*/

-- Create storage policies for imageupload bucket
BEGIN;

-- Allow public access to read files from imageupload
CREATE POLICY "Public access to imageupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'imageupload');

-- Allow authenticated users to upload files to their own directory in imageupload
CREATE POLICY "Users can upload to their imageupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Allow users to update their own files in imageupload
CREATE POLICY "Users can update their imageupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
)
WITH CHECK (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Allow users to delete their own files from imageupload
CREATE POLICY "Users can delete their imageupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Create storage policies for storieupload bucket
-- Allow public access to read files from storieupload
CREATE POLICY "Public access to storieupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'storieupload');

-- Allow authenticated users to upload files to their own directory in storieupload
CREATE POLICY "Users can upload to their storieupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Allow users to update their own files in storieupload
CREATE POLICY "Users can update their storieupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
)
WITH CHECK (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Allow users to delete their own files from storieupload
CREATE POLICY "Users can delete their storieupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

COMMIT;