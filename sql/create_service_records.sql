-- Create service_records table for Repair and Maintenance
CREATE TABLE IF NOT EXISTS service_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  category text DEFAULT 'repair',
  description text DEFAULT '',
  service_station text DEFAULT '',
  cost decimal DEFAULT 0,
  odometer integer DEFAULT 0,
  date date DEFAULT CURRENT_DATE,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

-- Policy: users can SELECT their own records
CREATE POLICY "Users can view own service_records"
  ON service_records FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can INSERT their own records
CREATE POLICY "Users can insert own service_records"
  ON service_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can UPDATE their own records
CREATE POLICY "Users can update own service_records"
  ON service_records FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: users can DELETE their own records
CREATE POLICY "Users can delete own service_records"
  ON service_records FOR DELETE
  USING (auth.uid() = user_id);
