-- Quarterly Estimated Tax Payments (IRS Form 1040-ES tracker)
-- One row per (user, tax_year, quarter). Estimated amount is auto-recomputed
-- from Tax Summary when unpaid; paid quarters preserve their values.

CREATE TABLE IF NOT EXISTS quarterly_tax_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter IN (1, 2, 3, 4)),
  estimated_amount NUMERIC(12, 2) NOT NULL,
  paid_amount NUMERIC(12, 2),
  paid_date DATE,
  payment_method TEXT,
  reminder_set BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, tax_year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_qtp_user_year
  ON quarterly_tax_payments (user_id, tax_year);

ALTER TABLE quarterly_tax_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own quarterly payments" ON quarterly_tax_payments;
CREATE POLICY "Users see own quarterly payments"
  ON quarterly_tax_payments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own quarterly payments" ON quarterly_tax_payments;
CREATE POLICY "Users insert own quarterly payments"
  ON quarterly_tax_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own quarterly payments" ON quarterly_tax_payments;
CREATE POLICY "Users update own quarterly payments"
  ON quarterly_tax_payments FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own quarterly payments" ON quarterly_tax_payments;
CREATE POLICY "Users delete own quarterly payments"
  ON quarterly_tax_payments FOR DELETE
  USING (auth.uid() = user_id);
