// POST /api/auth/test-bypass
// SMS-bypass endpoint for closed beta. Returns 403 unless
// ENABLE_TEST_USER_BYPASS === 'true' in Vercel env.
//
// Two actions:
//   { action: 'check',  phone }         -> { bypass: boolean }
//   { action: 'verify', phone, code }   -> { access_token, refresh_token, user_id }
//
// Whitelist lives in the test_users table (service_role only). On verify,
// the endpoint creates the auth.users row if missing (phone_confirm=true,
// password=test_users.password), then exchanges phone+password for a session
// via Supabase's /auth/v1/token?grant_type=password. The client takes those
// tokens straight into supabase.auth.setSession().
//
// IMPORTANT: leaves Supabase's normal signInWithOtp/verifyOtp path untouched.

import { createClient } from '@supabase/supabase-js'

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function getEnv() {
  return {
    enabled: process.env.ENABLE_TEST_USER_BYPASS === 'true',
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  }
}

let cachedAdmin = null
let adminFactory = null  // test seam; see __setAdminFactoryForTests
function getAdmin(url, serviceKey) {
  if (adminFactory) return adminFactory(url, serviceKey)
  if (cachedAdmin) return cachedAdmin
  cachedAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedAdmin
}

// Test-only: lets tests swap the Supabase admin client without touching the
// network. Pass null to restore the real factory.
export function __setAdminFactoryForTests(factory) {
  adminFactory = factory
  cachedAdmin = null
}

async function findTestUser(admin, phone) {
  const { data, error } = await admin
    .from('test_users')
    .select('phone, bypass_code, password')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data
}

async function findAuthUserByPhone(admin, phone) {
  // listUsers paginates 50 at a time; for closed beta whitelists this is plenty.
  let page = 1
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 })
    if (error) throw error
    const match = (data?.users || []).find((u) => u.phone === phone.replace(/^\+/, '') || u.phone === phone)
    if (match) return match
    if (!data?.users || data.users.length < 50) return null
    page += 1
  }
  return null
}

async function ensureAuthUser(admin, phone, password) {
  const existing = await findAuthUserByPhone(admin, phone)
  if (existing) {
    // Reset the known password so the grant_type=password call below works
    // even if a previous bypass run set a different value.
    await admin.auth.admin.updateUserById(existing.id, { password, phone_confirm: true })
    return existing
  }
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  })
  if (error) throw error
  return data?.user
}

async function exchangePasswordForSession(url, anonKey, phone, password) {
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ phone, password }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Supabase password grant failed (${resp.status}): ${text}`)
  }
  return resp.json()
}

export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { enabled, url, serviceKey, anonKey } = getEnv()
  if (!enabled) {
    return res.status(403).json({ error: 'Test bypass disabled' })
  }
  if (!url || !serviceKey || !anonKey) {
    console.error('[test-bypass] missing env (url/serviceKey/anonKey)')
    return res.status(500).json({ error: 'Server not configured' })
  }

  const { action, phone, code } = req.body || {}
  if (typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ error: 'Missing phone' })
  }
  const cleanPhone = phone.trim()

  const admin = getAdmin(url, serviceKey)

  try {
    if (action === 'check') {
      const testUser = await findTestUser(admin, cleanPhone)
      return res.status(200).json({ bypass: Boolean(testUser) })
    }

    if (action === 'verify') {
      if (typeof code !== 'string' || !code) {
        return res.status(400).json({ error: 'Missing code' })
      }
      const testUser = await findTestUser(admin, cleanPhone)
      if (!testUser) {
        return res.status(404).json({ error: 'Not a test user' })
      }
      if (code !== testUser.bypass_code) {
        return res.status(401).json({ error: 'Invalid code' })
      }
      const authUser = await ensureAuthUser(admin, cleanPhone, testUser.password)
      const session = await exchangePasswordForSession(url, anonKey, cleanPhone, testUser.password)
      console.log(`[BYPASS] Test user logged in: ${cleanPhone}`)
      return res.status(200).json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: authUser?.id || null,
      })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('[test-bypass] error', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
