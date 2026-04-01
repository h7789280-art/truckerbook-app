-- Fleet invite: new columns for driver invitations
-- Run this in Supabase SQL Editor

-- profiles: company_id links hired driver to fleet owner
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES profiles(id);
-- profiles: invited flag — true until driver completes invite flow
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;
-- profiles: invite_code for SMS invite link
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code text;

-- vehicles: driver_id links vehicle to a specific driver user
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id);

-- RLS: fleet owner can read profiles of their hired drivers
CREATE POLICY "Fleet owner can view hired drivers"
  ON profiles FOR SELECT
  USING (
    company_id = auth.uid()
  );

-- RLS: fleet owner can read vehicles they own (already covered by user_id = auth.uid())
-- RLS: hired driver can read their assigned vehicle
CREATE POLICY "Hired driver can view assigned vehicle"
  ON vehicles FOR SELECT
  USING (
    driver_id = auth.uid()
  );

-- RLS: hired driver can read their own fuel_entries, trips, etc.
-- (already covered by user_id = auth.uid() policies)

-- RLS: fleet owner can read data from their hired drivers' entries
CREATE POLICY "Fleet owner can view hired drivers fuel_entries"
  ON fuel_entries FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
  );

CREATE POLICY "Fleet owner can view hired drivers trips"
  ON trips FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
  );

CREATE POLICY "Fleet owner can view hired drivers byt_expenses"
  ON byt_expenses FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
  );

CREATE POLICY "Fleet owner can view hired drivers service_records"
  ON service_records FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
  );

CREATE POLICY "Fleet owner can view hired drivers shifts"
  ON shifts FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
  );
