-- Current odometer tracking for owner_operator (profiles) and fleet vehicles (vehicles).
-- Apply manually in Supabase SQL Editor if any of the columns are missing.
-- Safe to re-run: all ALTERs use IF NOT EXISTS.

-- profiles: owner_operator stores the main-vehicle odometer directly on profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odometer integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odometer_updated_at timestamptz;

-- vehicles: per-vehicle last-updated timestamp (odometer column already exists)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_updated_at timestamptz;

-- Force PostgREST to reload its schema cache so the new columns are writable immediately.
NOTIFY pgrst, 'reload schema';
