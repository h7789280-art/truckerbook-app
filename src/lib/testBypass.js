// Client-side wrapper around /api/auth/test-bypass.
// Lets Auth.jsx / InviteFlow.jsx skip Supabase's SMS path for whitelisted phones.
//
// All functions return shape compatible with supabase.auth.* helpers so callers
// can fall through to the normal flow on any non-bypass response.

import { supabase } from './supabase.js'

// Probe whether `phone` is a closed-beta test user.
// On any error or non-200, returns false so the caller falls through to SMS.
export async function isBypassPhone(phone) {
  try {
    const resp = await fetch('/api/auth/test-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check', phone }),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    return Boolean(data?.bypass)
  } catch {
    return false
  }
}

// Try to verify `code` against the test_users whitelist and install the
// returned tokens into the Supabase client.
//
// Returns:
//   { ok: true }            -> session installed; caller proceeds as if verifyOtp succeeded
//   { ok: false, fallback: true }   -> phone isn't a bypass user, caller should run normal verifyOtp
//   { ok: false, error: 'msg' }    -> bypass user but wrong code; caller should surface error
export async function verifyBypass(phone, code) {
  let resp
  try {
    resp = await fetch('/api/auth/test-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', phone, code }),
    })
  } catch (err) {
    return { ok: false, fallback: true }
  }

  if (resp.status === 404 || resp.status === 403) {
    return { ok: false, fallback: true }
  }
  if (!resp.ok) {
    let msg = 'Bypass failed'
    try {
      const data = await resp.json()
      msg = data?.error || msg
    } catch {}
    return { ok: false, error: msg }
  }

  const { access_token, refresh_token } = await resp.json()
  if (!access_token || !refresh_token) {
    return { ok: false, fallback: true }
  }
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
