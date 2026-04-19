-- Add tax_withhold_pct to profiles: percentage of gross income a self-employed trucker
-- sets aside for taxes. Powers the Real-time Tax Meter widget on Overview.
-- Default 25%, UI range 15-40%.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tax_withhold_pct NUMERIC(5, 2) DEFAULT 25.00;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS tax_withhold_pct_range;

ALTER TABLE profiles
  ADD CONSTRAINT tax_withhold_pct_range
  CHECK (tax_withhold_pct IS NULL OR (tax_withhold_pct >= 15 AND tax_withhold_pct <= 40));
