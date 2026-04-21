-- Migration: add strategy fields to vehicle_depreciation for OP-only Section 179 / Bonus / MACRS 3-year
-- Per IRS Rev. Proc. 87-56 (Asset Class 00.26 = 3-year for OTR tractors) and OBBBA 2025 (100% bonus restored).
-- Safe to apply on existing rows: all new columns are NULL/default, so legacy code paths are untouched.

ALTER TABLE vehicle_depreciation
  ADD COLUMN IF NOT EXISTS asset_class text,
  ADD COLUMN IF NOT EXISTS strategy text,
  ADD COLUMN IF NOT EXISTS section_179_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_use_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS gvwr_lbs integer,
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS primary_use text,
  ADD COLUMN IF NOT EXISTS estimated_taxable_income numeric;

-- Valid asset_class values:
--   'semi_tractor_otr'        → IRS 00.26, 3-year MACRS
--   'light_truck'             → IRS 00.242, 5-year MACRS
--   'heavy_truck_non_tractor' → IRS 00.241, 5-year MACRS
--   'trailer'                 → IRS 00.27, 5-year MACRS
-- Left as text (no CHECK constraint) for forward compatibility.

-- Valid strategy values:
--   'standard_macrs'      → MACRS only, full recovery period
--   'section_179'         → Section 179 elected amount + MACRS on remainder
--   'section_179_bonus'   → Section 179 + Bonus Depreciation + MACRS
--   'bonus_only'          → 100% Bonus Depreciation (or applicable rate) + MACRS

-- Valid vehicle_type: 'tractor_unit' | 'straight_truck' | 'trailer'
-- Valid primary_use:  'otr' | 'regional' | 'local' | 'other'
