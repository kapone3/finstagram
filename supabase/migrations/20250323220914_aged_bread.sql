/*
  # Fix Messages Table Policies

  1. Changes
    - Drop existing policies before recreating them
    - Ensure clean policy creation
    
  2. Security
    - Maintain same security rules
    - Keep existing RLS setup
*/

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
  DROP POLICY IF EXISTS "Users can send messages to followers" ON messages;
END $$;

-- Create policies for messages
CREATE POLICY "Users can read their own messages"
ON messages FOR SELECT
TO authenticated
USING (
  auth.uid() = sender_id OR 
  auth.uid() = receiver_id
);

-- Users can only send messages to users who follow them
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