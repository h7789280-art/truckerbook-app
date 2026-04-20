// Serverless proxy for Gemini API.
// Keeps GEMINI_API_KEY server-side so it never ships in the client bundle.
// Validates the caller using a Supabase JWT (Authorization: Bearer <token>).
// In-memory rate limit: 20 requests / 60s per user_id (per instance).

import { createClient } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 20

const rateLimitMap = new Map()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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
  const timeout = setTimeout(() => controller.abort(), 60000)
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
    return res.status(429).json({ error: 'Too many requests', retryAfter: limit.retryAfter })
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
    return res.status(400).json({ error: `Unsupported action: ${action}` })
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt (string required)' })
  }

  // Optional media input (vision / audio / binary).
  // Shape: { mimeType: "image/jpeg" | "audio/webm" | "application/octet-stream", data: "<base64 без data:..., префикса>" }
  // Backwards compat: legacy `image` field is accepted when `media` is absent.
  // If both are present, `media` wins.
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
      return res.status(400).json({ error: 'Invalid media (expected { mimeType, data })' })
    }
    if (effectiveMedia.data.length === 0) {
      return res.status(400).json({ error: 'media.data must be a non-empty base64 string' })
    }

    const mimeType = effectiveMedia.mimeType
    let maxBytes
    if (mimeType.startsWith('image/')) {
      // 4 MB for images (Vercel payload cap 4.5 MB, leave headroom for JSON framing)
      maxBytes = 4 * 1024 * 1024
    } else if (mimeType.startsWith('audio/') || mimeType === 'application/octet-stream') {
      maxBytes = 10 * 1024 * 1024
    } else {
      return res.status(400).json({ error: `Unsupported media type: ${mimeType}` })
    }

    const approxBytes = Math.ceil(effectiveMedia.data.length * 0.75)
    if (approxBytes > maxBytes) {
      return res.status(413).json({ error: 'Media too large', maxBytes })
    }

    mediaPart = { inline_data: { mime_type: mimeType, data: effectiveMedia.data } }
  }

  const model = clientModel || process.env.GEMINI_MODEL || DEFAULT_MODEL

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

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const response = await callGemini(apiKey, model, body)

      if (response.ok) {
        const data = await response.json()
        return res.status(200).json(data)
      }

      const errText = await response.text().catch(() => '')
      console.warn(`Gemini ${response.status} (attempt ${attempt}): ${errText.slice(0, 200)}`)

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '30'
        res.setHeader('Retry-After', retryAfter)
        return res.status(429).json({ error: 'Gemini rate limited', retryAfter })
      }

      if (response.status === 503 && attempt <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS)
        continue
      }

      return res.status(response.status === 503 ? 503 : 500).json({
        error: `Gemini error ${response.status}`,
        details: errText.slice(0, 300),
      })
    } catch (err) {
      console.error(`Gemini request failed (attempt ${attempt}):`, err.message)
      if (attempt <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      return res.status(500).json({ error: 'Gemini request failed', details: err.message })
    }
  }

  return res.status(500).json({ error: 'Unexpected proxy state' })
}
