-- Add state_of_residence column to profiles (US state tax home base)
-- 2-letter state code. Default TX (Texas — no state income tax, common trucker home base).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_of_residence TEXT DEFAULT 'TX';
