-- Test-user SMS bypass for closed beta.
-- Whitelisted phones can sign in without going through Supabase/Twilio SMS.
-- Bypass is only honored when the server endpoint sees ENABLE_TEST_USER_BYPASS='true'.
-- Reads/writes are restricted to service_role; the anon client must never see this table.

CREATE TABLE IF NOT EXISTS test_users (
  phone TEXT PRIMARY KEY,
  description TEXT,
  bypass_code TEXT NOT NULL DEFAULT '000000',
  password TEXT NOT NULL DEFAULT '000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE test_users IS
  'Whitelist for closed-beta SMS bypass. Service-role only. See CLAUDE.md > Test user bypass.';
COMMENT ON COLUMN test_users.phone IS 'E.164 phone (e.g., +380...). Must match the value passed to signInWithOtp.';
COMMENT ON COLUMN test_users.bypass_code IS 'Code the user types in the SMS-screen UI. UI requires 6 digits, so use 000000 or any 6-digit string.';
COMMENT ON COLUMN test_users.password IS 'Server-side password used to issue a Supabase session via grant_type=password. Never exposed to clients.';

ALTER TABLE test_users ENABLE ROW LEVEL SECURITY;

-- No policies: with RLS on and no policies, anon/authenticated requests get zero rows.
-- service_role bypasses RLS, so the bypass endpoint can still read.
