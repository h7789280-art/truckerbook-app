// POST /api/parse-trip — requires `Authorization: Bearer <supabase-jwt>` and is rate-limited per user.
import { setCorsHeaders, handleOptions, validateJwt, checkRateLimit } from './_security.js'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callGemini(apiKey, model, requestBody) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    }
  )

  clearTimeout(timeout)
  return response
}

const PROMPT = `Parse this dispatcher message or rate confirmation. Extract trip details.

Return ONLY valid JSON (no markdown, no backticks):
{
  "origin_city": "Miami",
  "origin_state": "FL",
  "destination_city": "Los Angeles",
  "destination_state": "CA",
  "miles": 2750,
  "deadhead_miles": 50,
  "rate": 5500.00,
  "rate_per_mile": 2.00,
  "pickup_date": "2026-04-15",
  "delivery_date": "2026-04-18",
  "broker": "XPO Logistics",
  "load_number": "LD-123456",
  "weight": 40000,
  "commodity": "Electronics",
  "notes": ""
}

Rules:
- If rate_per_mile not stated, calculate: rate / miles
- If deadhead not mentioned, set to 0
- Extract dates if present, otherwise null
- Extract broker/company name if present
- "DH" or "deadhead" = deadhead miles
- All amounts in USD
- If cannot parse, return {"error": "Cannot parse trip details"}`

export default async function handler(req, res) {
  setCorsHeaders(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await validateJwt(req, res)
  if (!auth) return
  if (!checkRateLimit(auth.userId, res)) return

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const { text, image } = req.body || {}

  if (!text && !image) {
    return res.status(400).json({ error: 'Missing text or image' })
  }

  if (image && typeof image === 'string' && image.length > 4 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image too large' })
  }

  const parts = [{ text: PROMPT }]

  if (text) {
    parts.push({ text: `\n\nDispatcher message:\n${text}` })
  }

  if (image) {
    const cleanBase64 = image.includes(',') ? image.split(',')[1] : image
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: cleanBase64,
      },
    })
  }

  const requestBody = { contents: [{ parts }] }

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`parse-trip: model=${model}, attempt=${attempt}/${MAX_RETRIES}`)
        const response = await callGemini(apiKey, model, requestBody)

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          console.warn(`Gemini ${response.status} (model=${model}, attempt=${attempt}): ${errText.slice(0, 200)}`)
          if (response.status === 404) {
            console.warn(`Model ${model} not found (404), switching to next model`)
            break
          }
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS)
            continue
          }
          break
        }

        const data = await response.json()
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

        if (!rawText) {
          console.error('Empty rawText from Gemini')
          return res.status(502).json({ error: '\u041f\u0443\u0441\u0442\u043e\u0439 \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 AI' })
        }

        let jsonStr = rawText
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
        }

        let parsed
        try {
          parsed = JSON.parse(jsonStr)
        } catch (parseErr) {
          console.error('JSON parse error:', parseErr.message, jsonStr.slice(0, 500))
          return res.status(502).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c \u0440\u0435\u0439\u0441' })
        }

        if (parsed.error) {
          return res.status(422).json({ error: parsed.error })
        }

        if (model !== MODELS[0]) {
          parsed._fallback_model = model
        }

        return res.status(200).json(parsed)
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`Gemini timeout (model=${model}, attempt=${attempt})`)
        } else {
          console.error(`Gemini error (model=${model}, attempt=${attempt}):`, err.message)
        }
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS)
          continue
        }
        break
      }
    }
    console.warn(`All ${MAX_RETRIES} retries failed for ${model}, trying next model...`)
  }

  return res.status(503).json({
    error: '\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043c\u0438\u043d\u0443\u0442\u0443.',
  })
}
