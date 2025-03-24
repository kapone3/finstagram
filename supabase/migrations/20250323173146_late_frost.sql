/*
  # Storage Policies for Image Upload Bucket

  1. Security
    - Enable policies for the imageupload bucket
    - Allow authenticated users to:
      - Upload files to their own user directory
      - Delete their own files
    - Allow public access to read files
*/

-- Create policies for the imageupload bucket
BEGIN;

-- Allow public access to read files
CREATE POLICY "Public access to all files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'imageupload');

-- Allow authenticated users to upload files to their own directory
CREATE POLICY "Allow users to upload files to their own directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Allow users to update their own files
CREATE POLICY "Allow users to update their own files"
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

-- Allow users to delete their own files
CREATE POLICY "Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

COMMIT;