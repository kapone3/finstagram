/*
  # Implement likes functionality

  1. Changes
    - Drop and recreate likes table with correct references to profiles
    - Add indexes for performance
    - Set up RLS policies for likes

  2. Security
    - Enable RLS
    - Add policies for:
      - Public viewing of likes
      - Authenticated users can create/delete likes
*/

-- Drop existing table if it exists
DROP TABLE IF EXISTS likes CASCADE;

-- Create likes table with correct references
CREATE TABLE likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON likes(user_id);
CREATE INDEX IF NOT EXISTS likes_post_id_idx ON likes(post_id);

-- Create policies for likes
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