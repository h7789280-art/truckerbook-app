-- Create vehicle_expenses table for tracking vehicle-related expenses
-- (DEF, oil, parts, equipment, supplies, hotel, toll, etc.)

CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  description text DEFAULT '',
  amount decimal NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);

-- RLS: users can only see/modify their own records
ALTER TABLE vehicle_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicle_expenses"
  ON vehicle_expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicle_expenses"
  ON vehicle_expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicle_expenses"
  ON vehicle_expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicle_expenses"
  ON vehicle_expenses FOR DELETE
  USING (auth.uid() = user_id);
