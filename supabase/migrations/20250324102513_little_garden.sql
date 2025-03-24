/*
  # Remove link and text columns from stories table

  1. Changes
    - Remove link column
    - Remove text column
*/

-- Remove columns from stories table
ALTER TABLE stories
DROP COLUMN IF EXISTS link,
DROP COLUMN IF EXISTS text;