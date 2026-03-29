-- Shifts table for team driving (multiple drivers per vehicle)
-- Run this in Supabase SQL Editor if the table doesn't exist yet

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id),
  odometer_start integer,
  odometer_end integer,
  km_driven integer DEFAULT 0,
  driver_name text DEFAULT '',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- If the table already exists, ensure driver_name column is present:
-- ALTER TABLE shifts ADD COLUMN IF NOT EXISTS driver_name text DEFAULT '';

-- RLS: users see only their own shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shifts"
  ON shifts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shifts"
  ON shifts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shifts"
  ON shifts FOR UPDATE
  USING (auth.uid() = user_id);

-- For team driving: allow users to READ shifts from the same vehicle
-- This lets both drivers see each other's shifts on a shared vehicle
CREATE POLICY "Users can view shifts on their vehicles"
  ON shifts FOR SELECT
  USING (
    vehicle_id IN (
      SELECT id FROM vehicles WHERE user_id = auth.uid()
    )
  );
