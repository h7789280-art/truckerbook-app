-- QBI Deduction (IRC §199A) — per-tax-year calculation snapshot for owner-operators.
-- One row per (user, tax_year). Stores both the inputs and the result of
-- calculateQBIDeduction() so future re-rendering, audit, and CPA-package emission
-- do not re-evaluate the calculator. Snapshots are recomputed by the app on
-- save (no DB-side compute trigger).
--
-- Apply manually via Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS qbi_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  filing_status TEXT NOT NULL
    CHECK (filing_status IN ('single', 'mfj', 'mfs', 'hoh')),
  taxable_income_before_qbi NUMERIC(14, 2) NOT NULL,
  qbi NUMERIC(14, 2) NOT NULL,
  w2_wages NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ubia NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_capital_gain NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_sstb BOOLEAN NOT NULL DEFAULT FALSE,
  deduction NUMERIC(14, 2) NOT NULL,
  phase TEXT NOT NULL,
  applied_rule TEXT,
  qbi_loss_carryover NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Full QBIResult object as returned by calculateQBIDeduction(); kept for
  -- debugging, audit, and forward-compatibility with new diagnostic fields.
  calculation_snapshot JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_qbi_calc_user_year
  ON qbi_calculations(user_id, tax_year DESC);

ALTER TABLE qbi_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_qbi" ON qbi_calculations;
CREATE POLICY "users_select_own_qbi" ON qbi_calculations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_qbi" ON qbi_calculations;
CREATE POLICY "users_insert_own_qbi" ON qbi_calculations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_qbi" ON qbi_calculations;
CREATE POLICY "users_update_own_qbi" ON qbi_calculations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_qbi" ON qbi_calculations;
CREATE POLICY "users_delete_own_qbi" ON qbi_calculations
  FOR DELETE USING (auth.uid() = user_id);

-- Note on updated_at:
-- This project does not currently expose a shared set_updated_at() trigger
-- function in any prior migration (grepped 2026-04-24). Per CLAUDE.md
-- guidance for this session, we do NOT introduce a new trigger function;
-- the application is responsible for setting updated_at = NOW() on UPDATE.
