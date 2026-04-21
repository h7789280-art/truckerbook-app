// Shared security helpers for serverless endpoints under /api.
// JWT validation via Supabase service-role client + in-memory rate limit
// shared across the scan-* endpoint group (scan-receipt, smart-scan, parse-trip).
// CORS preflight + standard headers.
// Each helper that rejects sends the response itself; callers just `return`.

import { createClient } from '@supabase/supabase-js'

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 20

// Single Map shared by every endpoint that imports this module.
// All three scan-* endpoints draw from the same Gemini quota, so per-user
// budget is enforced across the whole group, not per-endpoint.
const rateLimitMap = new Map()

let supabaseAdmin = null
function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return supabaseAdmin
}

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

export async function validateJwt(req, res) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' })
    return null
  }
  const jwt = m[1].trim()
  const admin = getSupabaseAdmin()
  if (!admin) {
    console.error('Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY missing)')
    res.status(500).json({ error: 'Server auth not configured' })
    return null
  }
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user?.id) {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }
  return { userId: data.user.id }
}

export function checkRateLimit(userId, res) {
  const now = Date.now()
  const arr = rateLimitMap.get(userId) || []
  const recent = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0]
    const retryAfter = Math.max(
      Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000),
      1
    )
    res.setHeader('Retry-After', String(retryAfter))
    res.status(429).json({ error: 'Too many requests', retryAfter })
    return false
  }
  recent.push(now)
  rateLimitMap.set(userId, recent)
  return true
}
