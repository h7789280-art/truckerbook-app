// Serverless proxy for Gemini API.
// Keeps GEMINI_API_KEY server-side so it never ships in the client bundle.
// Validates the caller using a Supabase JWT (Authorization: Bearer <token>).
// In-memory rate limit: 20 requests / 60s per user_id (per instance).

import { createClient } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.5-flash'
const PRO_MODEL = 'gemini-2.5-pro'

// Aggressive retry on transient Google errors. 4 retries => 5 attempts total.
// Backoff: 500ms, 1s, 2s, 4s + 0-200ms jitter. Total ~7.5-8.3s.
const MAX_RETRIES = 4
const BASE_DELAY_MS = 500
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

// Per-call timeout. Kept low so retries fit inside Vercel 60s function budget.
const GEMINI_CALL_TIMEOUT_MS = 15000

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 20

const rateLimitMap = new Map()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function computeBackoff(attempt) {
  return BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200)
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function checkRateLimit(userId) {
  const now = Date.now()
  const arr = rateLimitMap.get(userId) || []
  const recent = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0]
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000)
    return { ok: false, retryAfter: Math.max(retryAfter, 1) }
  }
  recent.push(now)
  rateLimitMap.set(userId, recent)
  return { ok: true }
}

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

async function authenticate(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) return { error: 'Missing Authorization Bearer token', status: 401 }
  const jwt = m[1].trim()
  const admin = getSupabaseAdmin()
  if (!admin) return { error: 'Server auth not configured', status: 500 }
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user?.id) return { error: 'Invalid token', status: 401 }
  return { userId: data.user.id }
}

async function callGemini(apiKey, model, body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_CALL_TIMEOUT_MS)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      }
    )
    return response
  } finally {
    clearTimeout(timeout)
  }
}

// Runs up to MAX_RETRIES+1 attempts against a single model.
// Returns { kind: 'ok', response } | { kind: 'permanent', response, errText }
//       | { kind: 'retryable_exhausted', lastStatus, errText } | { kind: 'network_exhausted', err }
async function callGeminiWithRetry(apiKey, model, body) {
  let lastStatus = null
  let lastErrText = ''
  let lastNetworkErr = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const attemptNum = attempt + 1
    const totalAttempts = MAX_RETRIES + 1
    try {
      const response = await callGemini(apiKey, model, body)

      if (response.ok) {
        console.log(`[gemini-proxy] success model=${model} attempts=${attemptNum}`)
        return { kind: 'ok', response }
      }

      const errText = await response.text().catch(() => '')
      console.warn(
        `[gemini-proxy] attempt=${attemptNum}/${totalAttempts} status=${response.status} model=${model}`
      )

      if (!RETRY_STATUSES.has(response.status)) {
        // Permanent error — caller should surface as-is.
        return { kind: 'permanent', response, errText }
      }

      lastStatus = response.status
      lastErrText = errText

      if (attempt < MAX_RETRIES) {
        const delay = computeBackoff(attempt)
        console.log(
          `[gemini-proxy] attempt=${attemptNum}/${totalAttempts} retrying after ${Math.round(delay)}ms`
        )
        await sleep(delay)
      }
    } catch (err) {
      lastNetworkErr = err
      console.warn(
        `[gemini-proxy] attempt=${attemptNum}/${totalAttempts} network_error model=${model}: ${err.message}`
      )
      if (attempt < MAX_RETRIES) {
        const delay = computeBackoff(attempt)
        console.log(
          `[gemini-proxy] attempt=${attemptNum}/${totalAttempts} retrying after ${Math.round(delay)}ms`
        )
        await sleep(delay)
      }
    }
  }

  if (lastStatus !== null) {
    return { kind: 'retryable_exhausted', lastStatus, errText: lastErrText }
  }
  return { kind: 'network_exhausted', err: lastNetworkErr }
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const auth = await authenticate(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const limit = checkRateLimit(auth.userId)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter))
    return res.status(429).json({
      error: 'Too many requests',
      retryable: true,
      retryAfter: limit.retryAfter,
    })
  }

  const {
    action = 'generate',
    prompt,
    systemInstruction,
    generationConfig,
    model: clientModel,
    image,
    media,
  } = req.body || {}

  if (action !== 'generate') {
    return res.status(400).json({ error: `Unsupported action: ${action}`, retryable: false })
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt (string required)', retryable: false })
  }

  let mediaPart = null
  let effectiveMedia = null
  if (media !== undefined && media !== null) {
    if (image !== undefined && image !== null) {
      console.warn('Both media and image provided; using media and ignoring image')
    }
    effectiveMedia = media
  } else if (image !== undefined && image !== null) {
    effectiveMedia = image
  }

  if (effectiveMedia !== null) {
    if (
      typeof effectiveMedia !== 'object' ||
      typeof effectiveMedia.mimeType !== 'string' ||
      typeof effectiveMedia.data !== 'string'
    ) {
      return res.status(400).json({
        error: 'Invalid media (expected { mimeType, data })',
        retryable: false,
      })
    }
    if (effectiveMedia.data.length === 0) {
      return res.status(400).json({
        error: 'media.data must be a non-empty base64 string',
        retryable: false,
      })
    }

    const mimeType = effectiveMedia.mimeType
    let maxBytes
    if (mimeType.startsWith('image/')) {
      // 4 MB for images (Vercel payload cap 4.5 MB, leave headroom for JSON framing)
      maxBytes = 4 * 1024 * 1024
    } else if (mimeType.startsWith('audio/') || mimeType === 'application/octet-stream') {
      maxBytes = 10 * 1024 * 1024
    } else {
      return res.status(400).json({
        error: `Unsupported media type: ${mimeType}`,
        retryable: false,
      })
    }

    const approxBytes = Math.ceil(effectiveMedia.data.length * 0.75)
    if (approxBytes > maxBytes) {
      return res.status(413).json({ error: 'Media too large', retryable: false, maxBytes })
    }

    mediaPart = { inline_data: { mime_type: mimeType, data: effectiveMedia.data } }
  }

  const initialModel = clientModel || process.env.GEMINI_MODEL || DEFAULT_MODEL

  const parts = [{ text: prompt }]
  if (mediaPart) parts.push(mediaPart)

  const body = {
    contents: [{ role: 'user', parts }],
  }
  if (systemInstruction && typeof systemInstruction === 'string') {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }
  if (generationConfig && typeof generationConfig === 'object') {
    body.generationConfig = generationConfig
  }

  const result = await callGeminiWithRetry(apiKey, initialModel, body)

  if (result.kind === 'ok') {
    try {
      const data = await result.response.json()
      return res.status(200).json(data)
    } catch (err) {
      console.error(`[gemini-proxy] response parse failed model=${initialModel}: ${err.message}`)
      return res.status(502).json({
        error: 'Gemini response parse failed',
        retryable: true,
        details: err.message,
      })
    }
  }

  if (result.kind === 'permanent') {
    console.warn(
      `[gemini-proxy] permanent_error model=${initialModel} status=${result.response.status}`
    )
    return res.status(result.response.status).json({
      error: `Gemini error ${result.response.status}`,
      retryable: false,
      details: (result.errText || '').slice(0, 300),
    })
  }

  // Retryable failures exhausted on initial model. Try the fallback (Pro -> Flash) once.
  if (initialModel === PRO_MODEL && FALLBACK_MODEL !== PRO_MODEL) {
    console.log(
      `[gemini-proxy] falling_back from=${initialModel} to=${FALLBACK_MODEL}`
    )
    const fallback = await callGeminiWithRetry(apiKey, FALLBACK_MODEL, body)

    if (fallback.kind === 'ok') {
      try {
        const data = await fallback.response.json()
        return res.status(200).json(data)
      } catch (err) {
        console.error(
          `[gemini-proxy] fallback response parse failed model=${FALLBACK_MODEL}: ${err.message}`
        )
        return res.status(502).json({
          error: 'Gemini response parse failed',
          retryable: true,
          details: err.message,
        })
      }
    }

    if (fallback.kind === 'permanent') {
      console.warn(
        `[gemini-proxy] fallback permanent_error model=${FALLBACK_MODEL} status=${fallback.response.status}`
      )
      return res.status(fallback.response.status).json({
        error: `Gemini error ${fallback.response.status}`,
        retryable: false,
        details: (fallback.errText || '').slice(0, 300),
      })
    }

    console.error(
      `[gemini-proxy] final_failure model=${FALLBACK_MODEL} attempts=${MAX_RETRIES + 1} (after fallback)`
    )
    return res.status(503).json({
      error: 'temporarily_unavailable',
      retryable: true,
      details:
        fallback.kind === 'retryable_exhausted'
          ? `Gemini ${fallback.lastStatus}`
          : (fallback.err && fallback.err.message) || 'Gemini request failed',
    })
  }

  // No fallback available (caller wasn't on Pro). Surface retryable 503.
  console.error(
    `[gemini-proxy] final_failure model=${initialModel} attempts=${MAX_RETRIES + 1}`
  )

  if (result.kind === 'retryable_exhausted' && result.lastStatus === 429) {
    return res.status(429).json({
      error: 'Gemini rate limited',
      retryable: true,
      details: (result.errText || '').slice(0, 300),
    })
  }

  return res.status(503).json({
    error: 'temporarily_unavailable',
    retryable: true,
    details:
      result.kind === 'retryable_exhausted'
        ? `Gemini ${result.lastStatus}`
        : (result.err && result.err.message) || 'Gemini request failed',
  })
}
