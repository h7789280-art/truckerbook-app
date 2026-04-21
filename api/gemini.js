// Serverless proxy for Gemini API.
// Keeps GEMINI_API_KEY server-side so it never ships in the client bundle.
// Validates the caller using a Supabase JWT (Authorization: Bearer <token>).
// In-memory rate limit: 20 requests / 60s per user_id (per instance).
//
// Multi-model fallback chain: Pro -> Flash -> Flash-Lite, each model with
// its own retry budget. Worst-case total budget stays under Vercel 60s.

import { createClient } from '@supabase/supabase-js'

// Ordered fallback chain. Each model has its own attempt budget and timeout.
// Worst case: 2*12 + 2*10 + 2*8 + 5 small backoffs ~= 63s, paired with
// maxDuration=60 in vercel.json the function will hard-stop on last attempt.
const MODEL_CHAIN = [
  { id: 'gemini-2.5-pro',        maxAttempts: 2, timeoutMs: 12000 },
  { id: 'gemini-2.5-flash',      maxAttempts: 2, timeoutMs: 10000 },
  { id: 'gemini-2.5-flash-lite', maxAttempts: 2, timeoutMs: 8000  },
]

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const BASE_DELAY_MS = 800

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
  res.setHeader('Access-Control-Expose-Headers', 'X-Model-Used')
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

function buildGeminiUrl(apiKey, modelId) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${apiKey}`
}

async function fetchWithTimeout(url, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    })
  } finally {
    clearTimeout(timer)
  }
}

// Runs the full model chain. Each model gets maxAttempts tries on retryable
// errors. On any permanent error (non-retryable 4xx) we short-circuit with
// `permanent: true`. Reference equality on `model` is intentional: we iterate
// the exact MODEL_CHAIN objects with for..of.
async function callGeminiWithChain(apiKey, body) {
  const errors = []
  const lastModel = MODEL_CHAIN[MODEL_CHAIN.length - 1]

  for (const model of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= model.maxAttempts; attempt++) {
      const startTime = Date.now()
      try {
        console.log(`[gemini-proxy] model=${model.id} attempt=${attempt}/${model.maxAttempts}`)

        const response = await fetchWithTimeout(
          buildGeminiUrl(apiKey, model.id),
          body,
          model.timeoutMs
        )

        if (response.ok) {
          const duration = Date.now() - startTime
          console.log(`[gemini-proxy] SUCCESS model=${model.id} attempt=${attempt} duration=${duration}ms`)
          return { kind: 'ok', response, modelUsed: model.id }
        }

        // Non-retryable 4xx — skip remaining attempts and models.
        if (!RETRYABLE_STATUSES.has(response.status)) {
          const errText = await response.text().catch(() => '')
          console.log(`[gemini-proxy] PERMANENT model=${model.id} status=${response.status}`)
          return { kind: 'permanent', status: response.status, errText, modelUsed: model.id }
        }

        const errText = await response.text().catch(() => '')
        errors.push({ model: model.id, attempt, status: response.status, body: errText.slice(0, 200) })
        console.log(`[gemini-proxy] RETRY model=${model.id} attempt=${attempt} status=${response.status}`)

        const isLastAttempt = attempt === model.maxAttempts && model === lastModel
        if (!isLastAttempt) {
          const delay = BASE_DELAY_MS * Math.pow(1.8, attempt - 1) + Math.random() * 300
          await sleep(delay)
        }
      } catch (err) {
        const message = err && err.message ? err.message : String(err)
        errors.push({ model: model.id, attempt, error: message })
        console.log(`[gemini-proxy] EXCEPTION model=${model.id} attempt=${attempt} error=${message}`)

        const isLastAttempt = attempt === model.maxAttempts && model === lastModel
        if (!isLastAttempt) {
          await sleep(BASE_DELAY_MS)
        }
      }
    }

    console.log(`[gemini-proxy] FALLBACK from ${model.id} — all attempts exhausted`)
  }

  console.log(`[gemini-proxy] FINAL_FAILURE all_models_exhausted errors=${JSON.stringify(errors)}`)
  return { kind: 'final_failure', errors }
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

  const result = await callGeminiWithChain(apiKey, body)

  if (result.kind === 'ok') {
    try {
      const data = await result.response.json()
      res.setHeader('X-Model-Used', result.modelUsed)
      return res.status(200).json(data)
    } catch (err) {
      console.error(`[gemini-proxy] response parse failed model=${result.modelUsed}: ${err.message}`)
      return res.status(502).json({
        error: 'Gemini response parse failed',
        retryable: true,
        details: err.message,
      })
    }
  }

  if (result.kind === 'permanent') {
    return res.status(result.status).json({
      error: 'permanent',
      retryable: false,
      status: result.status,
      details: (result.errText || '').slice(0, 300),
      modelUsed: result.modelUsed,
    })
  }

  // final_failure
  const attempted = MODEL_CHAIN.map((m) => m.id)
  const lastError = result.errors.length > 0
    ? result.errors[result.errors.length - 1]
    : null
  const lastErrorText = lastError
    ? (lastError.status ? `${lastError.model} status=${lastError.status}` : `${lastError.model} error=${lastError.error}`)
    : 'unknown'

  return res.status(503).json({
    error: 'all_models_unavailable',
    retryable: true,
    attempted,
    lastError: lastErrorText,
    details: result.errors.slice(-3),
  })
}
