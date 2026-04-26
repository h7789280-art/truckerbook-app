-- Fix: Fleet owner must NOT see drivers' personal byt_expenses
--
-- Original policy "Fleet owner can view hired drivers byt_expenses"
-- (sql/add_fleet_invite.sql:49) granted fleet owners SELECT on EVERY
-- byt_expenses row of every hired driver — including rows with
-- visibility = 'personal' (food, shower, laundry, tobacco, personal
-- purchases). This violated the privacy guarantee in CLAUDE.md:
--
--   ### ЛИЧНЫЕ расходы водителя (только он видит)
--   Категории в `byt_expenses` с visibility = 'personal':
--     - Еда / питание, Душ, Стирка, Сигареты, ...
--   Владелец компании НЕ видит эти расходы. Это личное дело водителя.
--
-- This migration restricts fleet owner visibility on byt_expenses to
-- rows with visibility = 'business' only. Personal expenses remain
-- accessible only to the driver via their own user_id = auth.uid()
-- policy (unchanged).
--
-- Apply manually via Supabase Dashboard → SQL Editor.

DROP POLICY IF EXISTS "Fleet owner can view hired drivers byt_expenses" ON byt_expenses;

CREATE POLICY "Fleet owner can view hired drivers byt_expenses"
  ON byt_expenses FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE company_id = auth.uid()
    )
    AND visibility = 'business'
  );

COMMENT ON POLICY "Fleet owner can view hired drivers byt_expenses" ON byt_expenses IS
  'Fleet owners can view ONLY business byt_expenses of their hired drivers. Personal expenses (visibility=''personal'' or NULL) remain private to the driver per CLAUDE.md privacy guarantees.';
