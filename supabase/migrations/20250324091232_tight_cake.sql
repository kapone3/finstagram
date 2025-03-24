/*
  # Add link field to profiles table

  1. Changes
    - Add link column to profiles table
    - Update existing profiles
*/

-- Add link column to profiles table if it doesn't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS link text;