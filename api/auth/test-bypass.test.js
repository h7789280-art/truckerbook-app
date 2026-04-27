// Tests for api/auth/test-bypass.js — closed-beta SMS bypass endpoint.
// Run with `node api/auth/test-bypass.test.js`; exits 0 iff every assertion holds.
//
// Strategy: inject a stub Supabase admin client via __setAdminFactoryForTests
// and stub global fetch (used to call /auth/v1/token). The Twilio path lives
// inside Supabase Auth, so what we verify here is:
//   - whitelisted phones do NOT trigger the password grant unless verify is
//     called with the right code (i.e. we never accidentally issue a session),
//   - non-whitelisted phones return 404/bypass:false so the client falls
//     through to supabase.auth.signInWithOtp/verifyOtp (the SMS/Twilio path),
//   - ENABLE_TEST_USER_BYPASS=false short-circuits everything to 403,
//   - new test users get auto-created via admin.createUser; existing ones get
//     password reset via updateUserById.

let failures = 0
let passes = 0
const mismatches = []

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + JSON.stringify(actual) + ', expected=' + JSON.stringify(expected) + ')')
    console.error('  FAIL ' + label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }
}
function assertTrue(cond, label) {
  if (cond) passes++
  else {
    failures++
    mismatches.push(label)
    console.error('  FAIL ' + label)
  }
}

console.log('\n=== test-bypass endpoint tests ===\n')

const stubState = {
  testUsers: new Map(),
  authUsers: [],
  createUserCalls: [],
  updateUserCalls: [],
  fetchCalls: [],
}

function makeAdminStub() {
  return {
    from(table) {
      assertEq(table, 'test_users', 'admin.from() called on test_users')
      return {
        select() { return this },
        eq(_col, val) { this._phone = val; return this },
        async maybeSingle() {
          const row = stubState.testUsers.get(this._phone) || null
          return { data: row, error: null }
        },
      }
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: stubState.authUsers.slice() }, error: null }
        },
        async createUser({ phone, password, phone_confirm }) {
          stubState.createUserCalls.push({ phone, password, phone_confirm })
          const user = { id: 'auth-' + phone, phone: phone.replace(/^\+/, '') }
          stubState.authUsers.push(user)
          return { data: { user }, error: null }
        },
        async updateUserById(id, patch) {
          stubState.updateUserCalls.push({ id, patch })
          return { data: { user: { id } }, error: null }
        },
      },
    },
  }
}

globalThis.fetch = async (url, opts) => {
  stubState.fetchCalls.push({ url: String(url), opts })
  if (String(url).includes('/auth/v1/token')) {
    return {
      ok: true,
      status: 200,
      async json() { return { access_token: 'access-token-stub', refresh_token: 'refresh-token-stub' } },
      async text() { return '' },
    }
  }
  throw new Error('unexpected fetch ' + url)
}

function makeReq(body) { return { method: 'POST', headers: {}, body } }
function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
  }
}

process.env.VITE_SUPABASE_URL = 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-stub'
process.env.VITE_SUPABASE_ANON_KEY = 'anon-stub'

const handlerMod = await import('./test-bypass.js')
const handler = handlerMod.default
handlerMod.__setAdminFactoryForTests(() => makeAdminStub())

function resetState() {
  stubState.testUsers.clear()
  stubState.authUsers.length = 0
  stubState.createUserCalls.length = 0
  stubState.updateUserCalls.length = 0
  stubState.fetchCalls.length = 0
}

// ---------------------------------------------------------------------------
// T1 — Whitelisted phone, action=check -> bypass:true, no Twilio path.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'
  stubState.testUsers.set('+380501112233', { phone: '+380501112233', bypass_code: '000000', password: 'pw1' })

  const req = makeReq({ action: 'check', phone: '+380501112233' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 200, 'T1 check whitelisted: 200')
  assertEq(res.body, { bypass: true }, 'T1 check whitelisted: bypass=true')
  assertEq(stubState.fetchCalls.length, 0, 'T1 check whitelisted: no password grant fetched')
}

// ---------------------------------------------------------------------------
// T2 — Whitelisted phone, action=verify with correct code, EXISTING auth user.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'
  stubState.testUsers.set('+380501112233', { phone: '+380501112233', bypass_code: '000000', password: 'pw1' })
  stubState.authUsers.push({ id: 'existing-id', phone: '380501112233' })

  const req = makeReq({ action: 'verify', phone: '+380501112233', code: '000000' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 200, 'T2 verify existing: 200')
  assertEq(res.body.access_token, 'access-token-stub', 'T2 verify existing: access_token')
  assertEq(res.body.refresh_token, 'refresh-token-stub', 'T2 verify existing: refresh_token')
  assertEq(stubState.createUserCalls.length, 0, 'T2 verify existing: no createUser')
  assertEq(stubState.updateUserCalls.length, 1, 'T2 verify existing: updateUserById once')
  assertTrue(
    stubState.fetchCalls.some((c) => c.url.includes('grant_type=password')),
    'T2 verify existing: password grant fetched'
  )
}

// ---------------------------------------------------------------------------
// T3 — Whitelisted phone but auth user does NOT yet exist -> createUser.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'
  stubState.testUsers.set('+380508889900', { phone: '+380508889900', bypass_code: '111111', password: 'pw2' })

  const req = makeReq({ action: 'verify', phone: '+380508889900', code: '111111' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 200, 'T3 verify new user: 200')
  assertEq(stubState.createUserCalls.length, 1, 'T3 verify new user: createUser once')
  assertEq(stubState.createUserCalls[0]?.phone_confirm, true, 'T3 verify new user: phone_confirm=true')
  assertEq(stubState.createUserCalls[0]?.password, 'pw2', 'T3 verify new user: password = test_users.password')
  assertEq(res.body.access_token, 'access-token-stub', 'T3 verify new user: access_token returned')
}

// ---------------------------------------------------------------------------
// T4 — Whitelisted phone but WRONG code -> 401, no session, no auth user touched.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'
  stubState.testUsers.set('+380501112233', { phone: '+380501112233', bypass_code: '000000', password: 'pw1' })

  const req = makeReq({ action: 'verify', phone: '+380501112233', code: '999999' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 401, 'T4 wrong code: 401')
  assertEq(stubState.createUserCalls.length, 0, 'T4 wrong code: no createUser')
  assertEq(stubState.updateUserCalls.length, 0, 'T4 wrong code: no updateUserById')
  assertEq(stubState.fetchCalls.length, 0, 'T4 wrong code: no password grant')
}

// ---------------------------------------------------------------------------
// T5 — Phone NOT in test_users -> check returns bypass:false (Twilio path).
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'

  const req = makeReq({ action: 'check', phone: '+15551234567' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 200, 'T5 non-whitelisted check: 200')
  assertEq(res.body, { bypass: false }, 'T5 non-whitelisted check: bypass=false (use Twilio)')
}

// ---------------------------------------------------------------------------
// T6 — Phone NOT in test_users on verify -> 404; client falls back to verifyOtp.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'true'

  const req = makeReq({ action: 'verify', phone: '+15551234567', code: '123456' })
  const res = makeRes()
  await handler(req, res)

  assertEq(res.statusCode, 404, 'T6 non-whitelisted verify: 404 (falls through to verifyOtp)')
  assertEq(stubState.fetchCalls.length, 0, 'T6 non-whitelisted verify: no password grant')
}

// ---------------------------------------------------------------------------
// T7 — ENABLE_TEST_USER_BYPASS=false -> 403 even for whitelisted phones.
// Production safety: every login goes through Supabase/Twilio.
// ---------------------------------------------------------------------------
{
  resetState()
  process.env.ENABLE_TEST_USER_BYPASS = 'false'
  stubState.testUsers.set('+380501112233', { phone: '+380501112233', bypass_code: '000000', password: 'pw1' })

  const reqCheck = makeReq({ action: 'check', phone: '+380501112233' })
  const resCheck = makeRes()
  await handler(reqCheck, resCheck)
  assertEq(resCheck.statusCode, 403, 'T7 disabled: check returns 403')

  const reqVerify = makeReq({ action: 'verify', phone: '+380501112233', code: '000000' })
  const resVerify = makeRes()
  await handler(reqVerify, resVerify)
  assertEq(resVerify.statusCode, 403, 'T7 disabled: verify returns 403')
  assertEq(stubState.fetchCalls.length, 0, 'T7 disabled: no password grant')
}

// ---------------------------------------------------------------------------
console.log('\n--- summary ---')
console.log('passes:   ' + passes)
console.log('failures: ' + failures)
if (failures > 0) {
  console.error('\nFailures:')
  mismatches.forEach((m) => console.error('  - ' + m))
  process.exit(1)
}
console.log('\nAll bypass tests passed.\n')
