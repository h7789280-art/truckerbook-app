-- Session 2B: QBI persistence — companion fields for the QBI snapshot save flow.
--
-- Apply manually via Supabase Dashboard → SQL Editor.
--
-- Note on prior-year QBI loss carryover (§199A(c)(2)):
--   The 2026-04-24 migration (qbi_calculations) already includes the column
--   `qbi_loss_carryover NUMERIC(14, 2) NOT NULL DEFAULT 0`. We REUSE that
--   column for prior-year QBI loss instead of introducing a duplicate
--   `prior_year_qbi_loss` column with the same semantics.
--
-- This migration adds only one new field:
--   estimated_tax_settings.sehi_annual — annual self-employed health
--   insurance amount, persisted so the QBI calculator (and future planners)
--   can recompute AGI/QBI base across sessions without re-prompting.

ALTER TABLE estimated_tax_settings
  ADD COLUMN IF NOT EXISTS sehi_annual NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN estimated_tax_settings.sehi_annual IS
  'Annual self-employed health insurance expense. Reduces AGI and QBI base in §199A computations.';
