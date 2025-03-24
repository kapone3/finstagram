/*
  # Fix Database Schema and Foreign Key References

  1. Changes
    - Ensure proper profile creation on signup
    - Fix foreign key references to use profiles(id)
    - Update RLS policies
    - Add proper constraints and indexes
    
  2. Security
    - Enable RLS on all tables
    - Fix permissions for all operations
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved trigger function for profile creation
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
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update foreign key references to use profiles(id)
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
END $$;

-- Update RLS policies
-- Profiles
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

-- Posts
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

-- Comments
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

-- Likes
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

-- Stories
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

-- Follows
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
DROP POLICY IF EXISTS "Users can follow/unfollow" ON follows;
DROP POLICY IF EXISTS "Users can unfollow" ON follows;

CREATE POLICY "Follows are viewable by everyone"
ON follows FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can follow/unfollow"
ON follows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
ON follows FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);

-- Messages
DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
DROP POLICY IF EXISTS "Users can send messages to followers" ON messages;

CREATE POLICY "Users can read their own messages"
ON messages FOR SELECT
TO authenticated
USING (
  auth.uid() = sender_id OR 
  auth.uid() = receiver_id
);

CREATE POLICY "Users can send messages to followers"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 
    FROM follows 
    WHERE follower_id = receiver_id 
    AND following_id = auth.uid()
  )
);

-- Notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Ensure RLS is enabled on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;