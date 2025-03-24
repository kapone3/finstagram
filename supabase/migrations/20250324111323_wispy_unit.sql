/*
  # Fix Posts Display and Foreign Keys

  1. Changes
    - Update foreign key references
    - Fix table relationships
    - Ensure proper cascade behavior
    
  2. Security
    - Maintain RLS policies
    - Keep existing permissions
*/

-- Drop existing foreign key constraints
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS posts_user_id_fkey;

ALTER TABLE comments
DROP CONSTRAINT IF EXISTS comments_user_id_fkey,
DROP CONSTRAINT IF EXISTS comments_post_id_fkey;

ALTER TABLE likes
DROP CONSTRAINT IF EXISTS likes_user_id_fkey,
DROP CONSTRAINT IF EXISTS likes_post_id_fkey;

-- Recreate foreign key constraints with correct references
ALTER TABLE posts
ADD CONSTRAINT posts_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE comments
ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE,
ADD CONSTRAINT comments_post_id_fkey
  FOREIGN KEY (post_id)
  REFERENCES posts(id)
  ON DELETE CASCADE;

ALTER TABLE likes
ADD CONSTRAINT likes_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE,
ADD CONSTRAINT likes_post_id_fkey
  FOREIGN KEY (post_id)
  REFERENCES posts(id)
  ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON posts(user_id);
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON comments(user_id);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON likes(user_id);
CREATE INDEX IF NOT EXISTS likes_post_id_idx ON likes(post_id);

-- Update RLS policies
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
DROP POLICY IF EXISTS "Users can create posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON likes;
DROP POLICY IF EXISTS "Users can create likes" ON likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON likes;

-- Create new policies
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