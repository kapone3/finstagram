/*
  # Fix User Registration and Profile Creation

  1. Changes
    - Improve profile creation trigger
    - Add constraints to ensure data integrity
    - Update RLS policies
    
  2. Security
    - Ensure proper profile creation
    - Add validation checks
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  profile_exists boolean;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = new.id
  ) INTO profile_exists;

  -- Only create profile if it doesn't exist
  IF NOT profile_exists THEN
    INSERT INTO public.profiles (
      id,
      username,
      avatar_url,
      created_at
    )
    VALUES (
      new.id,
      COALESCE(
        new.raw_user_meta_data->>'username',
        REGEXP_REPLACE(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')
      ),
      COALESCE(new.raw_user_meta_data->>'avatar_url', null),
      now()
    );
  END IF;

  RETURN new;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update profiles table
ALTER TABLE profiles
ALTER COLUMN username SET NOT NULL,
ADD CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
ADD CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$');

-- Update RLS policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation for new users" ON profiles;

-- Create new policies
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow profile creation for new users"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Ensure all tables use profiles(id) as foreign key reference
DO $$ 
BEGIN
  -- Posts
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'posts_user_id_fkey'
  ) THEN
    ALTER TABLE posts 
    DROP CONSTRAINT posts_user_id_fkey;
  END IF;
  
  ALTER TABLE posts
  ADD CONSTRAINT posts_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Comments
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'comments_user_id_fkey'
  ) THEN
    ALTER TABLE comments
    DROP CONSTRAINT comments_user_id_fkey;
  END IF;
  
  ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Likes
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'likes_user_id_fkey'
  ) THEN
    ALTER TABLE likes
    DROP CONSTRAINT likes_user_id_fkey;
  END IF;
  
  ALTER TABLE likes
  ADD CONSTRAINT likes_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;
END $$;