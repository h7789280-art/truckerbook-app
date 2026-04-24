-- Per Diem rate update: $69 -> $80 (CONUS, IRS Notice 2025-54)
-- Effective Oct 1, 2025 - Sep 30, 2026.
--
-- The 80% DOT HOS deduction limit (IRC §274(n)(3)) is applied in app code
-- (see src/utils/perDiemCalculator.js -> computeDeductible). The DB stores
-- only the GROSS rate.
--
-- Apply manually via Supabase Dashboard -> SQL Editor.

-- 1. New users default to $80/day (was $69).
ALTER TABLE per_diem_settings
  ALTER COLUMN daily_rate SET DEFAULT 80.00;

-- 2. Backfill existing users still on the old default.
-- Users who manually customized to a non-default value (e.g. $70, $65, $75)
-- are intentionally NOT touched — they had a reason for that override.
UPDATE per_diem_settings
  SET daily_rate = 80.00
  WHERE daily_rate = 69.00;
