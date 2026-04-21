// Serverless proxy for Gemini API.
// Keeps GEMINI_API_KEY server-side so it never ships in the client bundle.
// Validates the caller using a Supabase JWT (Authorization: Bearer <token>).
// In-memory rate limit: 20 requests / 60s per user_id (per instance).
//
// Parallel race strategy for Vercel Hobby plan (10s hard limit):
// fire Flash + Flash-Lite in parallel, first successful response wins,
// losers get aborted. Pro excluded — too slow (often 6-8s) to fit budget.

import { createClient } from '@supabase/supabase-js'

const RACE_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']

const FIRST_RACE_TIMEOUT_MS = 7000
const RETRY_RACE_TIMEOUT_MS = 2000
const TOTAL_BUDGET_MS = 9000 // 1s buffer under Vercel 10s Hobby limit

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 20

const rateLimitMap = new Map()

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

async function fetchModel(apiKey, modelId, body, controller, timeoutMs) {
  const timer = setTimeout(() => {
    try { controller.abort() } catch {}
  }, timeoutMs)
  try {
    return await fetch(buildGeminiUrl(apiKey, modelId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    })
  } finally {
    clearTimeout(timer)
  }
}

// Fires all models simultaneously. Returns the first successful response.
// On failure, returns { success: false, permanent?, status?, errText? }.
// `errors` array is appended for observability across multiple races.
async function raceModels(apiKey, body, modelIds, timeoutMs, errors) {
  const controllers = modelIds.map(() => new AbortController())

  const requests = modelIds.map((modelId, idx) => {
    const ctrl = controllers[idx]
    return fetchModel(apiKey, modelId, body, ctrl, timeoutMs)
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json()
          return { modelUsed: modelId, data }
        }
        const errText = await response.text().catch(() => '')
        errors.push({ model: modelId, status: response.status, body: errText.slice(0, 200) })
        const permanent = !RETRYABLE_STATUSES.has(response.status)
          && response.status >= 400
          && response.status < 500
        const err = new Error(`${modelId} status=${response.status}`)
        err.status = response.status
        err.permanent = permanent
        err.errText = errText
        err.modelUsed = modelId
        throw err
      })
      .catch((err) => {
        if (!err.status) {
          const isAbort = err && (err.name === 'AbortError' || err.code === 20)
          errors.push({ model: modelId, error: isAbort ? 'aborted/timeout' : (err.message || String(err)) })
        }
        throw err
      })
  })

  try {
    const winner = await Promise.any(requests)
    // Cancel losers so we don't burn Gemini quota on unused responses.
    controllers.forEach((c, idx) => {
      if (modelIds[idx] !== winner.modelUsed) {
        try { c.abort() } catch {}
      }
    })
    return { success: true, ...winner }
  } catch (aggregateErr) {
    const individual = aggregateErr && aggregateErr.errors ? aggregateErr.errors : []
    const permanentErr = individual.find((e) => e && e.permanent)
    if (permanentErr) {
      return {
        success: false,
        permanent: true,
        status: permanentErr.status,
        errText: permanentErr.errText,
        modelUsed: permanentErr.modelUsed,
      }
    }
    return { success: false }
  }
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

  const startTime = Date.now()
  const errors = []

  try {
    const first = await raceModels(apiKey, body, RACE_MODELS, FIRST_RACE_TIMEOUT_MS, errors)

    if (first.success) {
      console.log(`[gemini-proxy] SUCCESS model=${first.modelUsed} duration=${Date.now() - startTime}ms race=1`)
      res.setHeader('X-Model-Used', first.modelUsed)
      return res.status(200).json(first.data)
    }

    if (first.permanent) {
      console.log(`[gemini-proxy] PERMANENT status=${first.status} duration=${Date.now() - startTime}ms`)
      return res.status(first.status).json({
        error: 'permanent',
        retryable: false,
        status: first.status,
        details: (first.errText || '').slice(0, 300),
        modelUsed: first.modelUsed,
      })
    }

    const elapsed = Date.now() - startTime
    const remainingBudget = TOTAL_BUDGET_MS - elapsed

    if (remainingBudget > RETRY_RACE_TIMEOUT_MS) {
      const retryTimeout = Math.min(RETRY_RACE_TIMEOUT_MS, remainingBudget - 500)
      console.log(`[gemini-proxy] RETRY_RACE starting elapsed=${elapsed}ms remaining=${remainingBudget}ms timeout=${retryTimeout}ms`)
      const retry = await raceModels(apiKey, body, RACE_MODELS, retryTimeout, errors)

      if (retry.success) {
        console.log(`[gemini-proxy] SUCCESS_RETRY model=${retry.modelUsed} total_duration=${Date.now() - startTime}ms`)
        res.setHeader('X-Model-Used', retry.modelUsed)
        return res.status(200).json(retry.data)
      }

      if (retry.permanent) {
        console.log(`[gemini-proxy] PERMANENT_RETRY status=${retry.status} duration=${Date.now() - startTime}ms`)
        return res.status(retry.status).json({
          error: 'permanent',
          retryable: false,
          status: retry.status,
          details: (retry.errText || '').slice(0, 300),
          modelUsed: retry.modelUsed,
        })
      }
    }

    console.log(`[gemini-proxy] FINAL_FAILURE duration=${Date.now() - startTime}ms errors=${JSON.stringify(errors.slice(-6))}`)
    return res.status(503).json({
      error: 'all_models_unavailable',
      retryable: true,
      attempted: RACE_MODELS,
      details: errors.slice(-3),
    })
  } catch (err) {
    const message = err && err.message ? err.message : String(err)
    console.log(`[gemini-proxy] EXCEPTION ${message} duration=${Date.now() - startTime}ms`)
    return res.status(500).json({ error: 'internal', retryable: true, details: message })
  }
}
