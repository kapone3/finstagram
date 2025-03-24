/*
  # Add is_read column to messages table

  1. Changes
    - Add is_read column to messages table
    - Set default value to false
    - Update existing messages to have is_read = true
*/

-- Add is_read column to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Update existing messages to be marked as read
UPDATE messages
SET is_read = true
WHERE is_read IS NULL;