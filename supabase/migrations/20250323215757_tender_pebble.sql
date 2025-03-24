/*
  # Messaging System Database Schema

  1. New Tables
    - `messages`: Private messages between users
      - `id` (uuid, primary key)
      - `sender_id` (uuid, references profiles)
      - `receiver_id` (uuid, references profiles)
      - `content` (text)
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS on messages table
    - Add policies for:
      - Users can only read messages they sent or received
      - Users can only send messages to users who follow them
*/

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT messages_no_self_message CHECK (sender_id != receiver_id)
);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_receiver_id_idx ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);

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

-- Create function to check if user can message another user
CREATE OR REPLACE FUNCTION can_message_user(receiver_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM follows 
    WHERE follower_id = receiver_id 
    AND following_id = auth.uid()
  );
END;
$$;