/*
  # Add notifications system

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `source_user_id` (uuid, references profiles)
      - `notification_type` (text)
      - `reference_id` (uuid)
      - `message` (text)
      - `is_read` (boolean)
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS
    - Add policies for notification access
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL,
  reference_id uuid,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at);

-- Create function to create notifications
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
    AND p.user_id != NEW.user_id;  -- Don't notify if user likes their own post
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
    AND p.user_id != NEW.user_id;  -- Don't notify if user comments on their own post
  ELSIF TG_TABLE_NAME = 'follows' THEN
    -- Create notification for follow
    IF NEW.following_id != NEW.follower_id THEN  -- Don't notify if user follows themselves
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

-- Create triggers for notifications
DROP TRIGGER IF EXISTS create_like_notification ON likes;
CREATE TRIGGER create_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION create_notification();

DROP TRIGGER IF EXISTS create_comment_notification ON comments;
CREATE TRIGGER create_comment_notification
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION create_notification();

DROP TRIGGER IF EXISTS create_follow_notification ON follows;
CREATE TRIGGER create_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_notification();