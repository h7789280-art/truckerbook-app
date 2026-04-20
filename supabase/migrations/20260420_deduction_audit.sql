-- AI Deduction Audit: Gemini scans personal (byt_expenses) entries and
-- flags ones that look business-deductible. Each suggestion is reviewed
-- by the owner-operator and either accepted (mirrored into vehicle_expenses
-- with a Schedule C category), rejected, or snoozed.

CREATE TABLE IF NOT EXISTS deduction_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  run_date TIMESTAMPTZ DEFAULT NOW(),
  scan_period_start DATE NOT NULL,
  scan_period_end DATE NOT NULL,
  total_scanned INTEGER NOT NULL DEFAULT 0,
  total_found INTEGER NOT NULL DEFAULT 0,
  total_potential_savings NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deduction_audit_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id UUID REFERENCES deduction_audit_runs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL
    CHECK (source_table IN ('personal_expenses', 'transactions', 'byt_expenses')),
  source_id UUID NOT NULL,
  original_description TEXT,
  original_amount NUMERIC(10, 2) NOT NULL,
  original_date DATE NOT NULL,
  suggested_category TEXT NOT NULL,
  suggested_schedule_c_line TEXT NOT NULL,
  confidence_score NUMERIC(3, 2)
    CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning TEXT NOT NULL,
  estimated_tax_savings NUMERIC(10, 2),
  -- When accepted, the new vehicle_expenses row id so we can show a link.
  accepted_expense_id UUID,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'snoozed')),
  user_action_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_suggestions_user_status
  ON deduction_audit_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_runs_user_date
  ON deduction_audit_runs(user_id, run_date DESC);

ALTER TABLE deduction_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduction_audit_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_audit_runs" ON deduction_audit_runs;
CREATE POLICY "users_select_own_audit_runs" ON deduction_audit_runs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_audit_runs" ON deduction_audit_runs;
CREATE POLICY "users_insert_own_audit_runs" ON deduction_audit_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_audit_runs" ON deduction_audit_runs;
CREATE POLICY "users_update_own_audit_runs" ON deduction_audit_runs
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_audit_runs" ON deduction_audit_runs;
CREATE POLICY "users_delete_own_audit_runs" ON deduction_audit_runs
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_select_own_audit_suggestions" ON deduction_audit_suggestions;
CREATE POLICY "users_select_own_audit_suggestions" ON deduction_audit_suggestions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_audit_suggestions" ON deduction_audit_suggestions;
CREATE POLICY "users_insert_own_audit_suggestions" ON deduction_audit_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_audit_suggestions" ON deduction_audit_suggestions;
CREATE POLICY "users_update_own_audit_suggestions" ON deduction_audit_suggestions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_audit_suggestions" ON deduction_audit_suggestions;
CREATE POLICY "users_delete_own_audit_suggestions" ON deduction_audit_suggestions
  FOR DELETE USING (auth.uid() = user_id);
