/*
  # Create stories table and policies

  1. New Tables
    - `stories`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `image_url` (text)
      - `expires_at` (timestamp with time zone)
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `stories` table
    - Add policies for:
      - Public viewing of active stories
      - Authenticated users can create stories
      - Users can delete their own stories
*/

-- Create stories table if it doesn't exist
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Stories are viewable by everyone" ON stories;
    DROP POLICY IF EXISTS "Users can create stories" ON stories;
    DROP POLICY IF EXISTS "Users can delete own stories" ON stories;

    -- Create new policies
    CREATE POLICY "Stories are viewable by everyone"
      ON stories
      FOR SELECT
      TO public
      USING (expires_at > now());

    CREATE POLICY "Users can create stories"
      ON stories
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can delete own stories"
      ON stories
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
END $$;