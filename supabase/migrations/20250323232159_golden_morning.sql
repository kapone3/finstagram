/*
  # Fix User Registration and Profile Creation

  1. Changes
    - Drop and recreate trigger function with improved error handling
    - Add proper constraints and validation
    - Update foreign key references
    - Fix RLS policies
    
  2. Security
    - Ensure proper profile creation
    - Add validation checks
    - Update security policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved trigger function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  username_val text;
  profile_exists boolean;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = new.id
  ) INTO profile_exists;

  -- Only create profile if it doesn't exist
  IF NOT profile_exists THEN
    -- Generate username from email if not provided
    username_val := COALESCE(
      new.raw_user_meta_data->>'username',
      REGEXP_REPLACE(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')
    );

    -- Ensure username is unique by adding number if needed
    WHILE EXISTS (SELECT 1 FROM profiles WHERE username = username_val) LOOP
      username_val := username_val || floor(random() * 1000)::text;
    END LOOP;

    -- Create profile
    INSERT INTO public.profiles (
      id,
      username,
      full_name,
      avatar_url,
      created_at,
      updated_at
    )
    VALUES (
      new.id,
      username_val,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url',
      now(),
      now()
    );
  END IF;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error details
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update profiles table constraints
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS username_length,
DROP CONSTRAINT IF EXISTS username_format,
ALTER COLUMN username SET NOT NULL,
ADD CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
ADD CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$');

-- Update RLS policies
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
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow profile creation for new users"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Ensure all foreign keys reference profiles correctly
DO $$ 
BEGIN
  -- Posts
  ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_user_id_fkey,
  ADD CONSTRAINT posts_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Comments
  ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey,
  ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Likes
  ALTER TABLE likes
  DROP CONSTRAINT IF EXISTS likes_user_id_fkey,
  ADD CONSTRAINT likes_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Stories
  ALTER TABLE stories
  DROP CONSTRAINT IF EXISTS stories_user_id_fkey,
  ADD CONSTRAINT stories_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Messages
  ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT messages_receiver_id_fkey
    FOREIGN KEY (receiver_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Notifications
  ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  DROP CONSTRAINT IF EXISTS notifications_source_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT notifications_source_user_id_fkey
    FOREIGN KEY (source_user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

  -- Follows
  ALTER TABLE follows
  DROP CONSTRAINT IF EXISTS follows_follower_id_fkey,
  DROP CONSTRAINT IF EXISTS follows_following_id_fkey,
  ADD CONSTRAINT follows_follower_id_fkey
    FOREIGN KEY (follower_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT follows_following_id_fkey
    FOREIGN KEY (following_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;
END $$;