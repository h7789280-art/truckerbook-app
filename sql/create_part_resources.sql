-- Create part_resources table for tracking planned vehicle part lifecycle
-- (oil, filters, brakes, clutch, belts, battery, tires, etc.)
-- Used by owner_operator role only.

CREATE TABLE IF NOT EXISTS part_resources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  part_name text NOT NULL DEFAULT '',
  installed_date date NOT NULL DEFAULT CURRENT_DATE,
  installed_odometer integer NOT NULL DEFAULT 0,
  resource_miles integer,
  resource_months integer,
  cost decimal,
  notes text,
  status text NOT NULL DEFAULT 'active',
  removed_date date,
  removed_odometer integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS part_resources_user_idx ON part_resources(user_id);
CREATE INDEX IF NOT EXISTS part_resources_vehicle_idx ON part_resources(vehicle_id);
CREATE INDEX IF NOT EXISTS part_resources_status_idx ON part_resources(status);

-- RLS: users can only see/modify their own records
ALTER TABLE part_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own part_resources"
  ON part_resources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own part_resources"
  ON part_resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own part_resources"
  ON part_resources FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own part_resources"
  ON part_resources FOR DELETE
  USING (auth.uid() = user_id);
