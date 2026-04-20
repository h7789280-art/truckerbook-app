-- SEP-IRA contributions ledger for owner-operators
-- Retirement savings that reduce AGI at federal level. Each row is a deposit
-- to a SEP-IRA brokerage account, tracked per tax_year so the year-end CPA
-- package can emit a contributions CSV for Schedule 1 line 16.

CREATE TABLE IF NOT EXISTS sep_ira_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0 AND amount <= 100000),
  contribution_date DATE NOT NULL,
  broker_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sep_ira_user_year
  ON sep_ira_contributions(user_id, tax_year);

ALTER TABLE sep_ira_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_sep_ira" ON sep_ira_contributions;
CREATE POLICY "users_select_own_sep_ira" ON sep_ira_contributions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_sep_ira" ON sep_ira_contributions;
CREATE POLICY "users_insert_own_sep_ira" ON sep_ira_contributions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_sep_ira" ON sep_ira_contributions;
CREATE POLICY "users_update_own_sep_ira" ON sep_ira_contributions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_sep_ira" ON sep_ira_contributions;
CREATE POLICY "users_delete_own_sep_ira" ON sep_ira_contributions
  FOR DELETE USING (auth.uid() = user_id);
