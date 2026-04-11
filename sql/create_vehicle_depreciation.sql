-- Vehicle Depreciation table for Section 179 / MACRS tracking
CREATE TABLE IF NOT EXISTS vehicle_depreciation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  purchase_price numeric NOT NULL DEFAULT 0,
  purchase_date date NOT NULL,
  salvage_value numeric NOT NULL DEFAULT 0,
  prior_depreciation numeric NOT NULL DEFAULT 0,
  depreciation_type text NOT NULL DEFAULT 'macrs5',  -- 'section179', 'macrs5', 'macrs7'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: only own records
ALTER TABLE vehicle_depreciation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own depreciation"
  ON vehicle_depreciation FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own depreciation"
  ON vehicle_depreciation FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own depreciation"
  ON vehicle_depreciation FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own depreciation"
  ON vehicle_depreciation FOR DELETE
  USING (auth.uid() = user_id);
