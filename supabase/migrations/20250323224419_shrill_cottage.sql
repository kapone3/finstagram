/*
  # Remove message notifications from activity feed

  1. Changes
    - Remove message notifications from notifications table
    - Update create_notification function to exclude message notifications
    - Keep message unread status only in messages table
*/

-- Remove existing message notifications
DELETE FROM notifications
WHERE notification_type = 'message';

-- Update create_notification function to exclude message notifications
CREATE OR REPLACE FUNCTION create_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    -- Create notification for like
    INSERT INTO notifications (
      user_id,
      source_user_id,
      notification_type,
      reference_id,
      message
    )
    SELECT 
      p.user_id,
      NEW.user_id,
      'like',
      p.id,
      'hat deinen Beitrag gelikt'
    FROM posts p
    WHERE p.id = NEW.post_id
    AND p.user_id != NEW.user_id;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    -- Create notification for comment
    INSERT INTO notifications (
      user_id,
      source_user_id,
      notification_type,
      reference_id,
      message
    )
    SELECT 
      p.user_id,
      NEW.user_id,
      'comment',
      p.id,
      'hat deinen Beitrag kommentiert'
    FROM posts p
    WHERE p.id = NEW.post_id
    AND p.user_id != NEW.user_id;
  ELSIF TG_TABLE_NAME = 'follows' THEN
    -- Create notification for follow
    IF NEW.following_id != NEW.follower_id THEN
      INSERT INTO notifications (
        user_id,
        source_user_id,
        notification_type,
        reference_id,
        message
      )
      VALUES (
        NEW.following_id,
        NEW.follower_id,
        'follow',
        NEW.follower_id,
        'folgt dir jetzt'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop message notification trigger
DROP TRIGGER IF EXISTS create_message_notification ON messages;