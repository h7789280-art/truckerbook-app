-- Add pin_hash column to profiles table for PIN-code authentication
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_hash text;
