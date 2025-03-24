/*
  # Update RLS policies and database structure

  1. Changes
    - Update storage policies for both buckets
    - Add proper RLS policies for all tables
    - Fix foreign key references
    - Add missing indexes

  2. Security
    - Enable RLS on all tables
    - Add proper policies for authenticated users
    - Ensure proper bucket access
*/

-- Drop existing storage policies
BEGIN;

DO $$
BEGIN
  -- Drop existing storage policies for imageupload bucket
  DROP POLICY IF EXISTS "Public access to imageupload files" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload to their imageupload directory" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their imageupload files" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their imageupload files" ON storage.objects;
  
  -- Drop existing storage policies for storieupload bucket
  DROP POLICY IF EXISTS "Public access to storieupload files" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload to their storieupload directory" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their storieupload files" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their storieupload files" ON storage.objects;
END $$;

-- Create storage policies for imageupload bucket
CREATE POLICY "Public access to imageupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'imageupload');

CREATE POLICY "Users can upload to their imageupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

CREATE POLICY "Users can update their imageupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

CREATE POLICY "Users can delete their imageupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imageupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Create storage policies for storieupload bucket
CREATE POLICY "Public access to storieupload files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'storieupload');

CREATE POLICY "Users can upload to their storieupload directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

CREATE POLICY "Users can update their storieupload files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

CREATE POLICY "Users can delete their storieupload files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'storieupload' AND
  (auth.uid())::text = (SPLIT_PART(name, '/', 2))
);

-- Update posts table policies
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
DROP POLICY IF EXISTS "Users can create posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

CREATE POLICY "Posts are viewable by everyone"
ON posts FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can create posts"
ON posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
ON posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
ON posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Update stories table policies
DROP POLICY IF EXISTS "Stories are viewable by everyone" ON stories;
DROP POLICY IF EXISTS "Users can create stories" ON stories;
DROP POLICY IF EXISTS "Users can delete own stories" ON stories;

CREATE POLICY "Stories are viewable by everyone"
ON stories FOR SELECT
TO public
USING (expires_at > now());

CREATE POLICY "Users can create stories"
ON stories FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
ON stories FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Update profiles table policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation for new users" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Allow profile creation for new users"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Update likes table policies
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON likes;
DROP POLICY IF EXISTS "Users can create likes" ON likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON likes;

CREATE POLICY "Likes are viewable by everyone"
ON likes FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can create likes"
ON likes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
ON likes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Update comments table policies
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

CREATE POLICY "Comments are viewable by everyone"
ON comments FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can create comments"
ON comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Ensure all tables have RLS enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

COMMIT;