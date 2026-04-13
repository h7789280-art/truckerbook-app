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

const PROMPT = `Analyze this document (image or text). First, determine the document type, then extract data accordingly.

STEP 1: Determine document type:
- "receipt" — store receipt, gas station receipt, purchase receipt with items and prices
- "trip" — dispatcher message, rate confirmation, load sheet, delivery order with origin/destination/miles/rate
- "repair" — repair invoice, service bill, mechanic invoice with labor/parts for vehicle repair
- "unknown" — cannot determine

STEP 2: Based on type, extract data:

IF type is "receipt", return:
{
  "doc_type": "receipt",
  "store_name": "...",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "items": [
    {"description": "...", "amount": 0.00, "category": "fuel|def|food|tobacco|tools|parts|supplies|parking|scale|wash|tolls|phone|clothes|medical|other"}
  ]
}

IF type is "trip", return:
{
  "doc_type": "trip",
  "origin_city": "...",
  "origin_state": "...",
  "destination_city": "...",
  "destination_state": "...",
  "miles": 0,
  "deadhead_miles": 0,
  "rate": 0.00,
  "rate_per_mile": 0.00,
  "pickup_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "broker": "...",
  "load_number": "...",
  "weight": 0,
  "commodity": "...",
  "notes": ""
}

IF type is "repair", return:
{
  "doc_type": "repair",
  "shop_name": "...",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "vehicle_info": "...",
  "mileage": 0,
  "items": [
    {"description": "...", "amount": 0.00, "category": "labor|parts|diagnostics|towing|other"}
  ],
  "notes": ""
}

IF unknown:
{"doc_type": "unknown", "error": "Cannot determine document type"}

Return ONLY valid JSON (no markdown, no backticks).

IMPORTANT RULES:
- Cigarette brands (KENT, Marlboro, Winston, Camel, Parliament, L&M, Lucky Strike) -> category "tobacco"
- Cleaning supplies for truck -> "supplies"
- If from auto parts store (AutoZone, O'Reilly, NAPA, Advance Auto) -> default "parts"
- Truck stop receipts (Pilot, Flying J, Love's, TA, Petro) -> check each item individually
- "DH" or "deadhead" = deadhead miles
- If rate_per_mile not stated, calculate: rate / miles
- If deadhead not mentioned, set to 0
- All amounts in USD unless clearly stated otherwise
- For repair invoices: separate labor from parts, include diagnostics and towing if present`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const { image, text } = req.body || {}

  if (!image && !text) {
    return res.status(400).json({ error: 'Missing image or text' })
  }

  if (image && typeof image === 'string' && image.length > 4 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image too large' })
  }

  const parts = [{ text: PROMPT }]

  if (text) {
    parts.push({ text: `\n\nDocument text:\n${text}` })
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
        console.log(`smart-scan: model=${model}, attempt=${attempt}/${MAX_RETRIES}`)
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
        console.log('smart-scan raw response:', JSON.stringify({
          candidatesCount: data?.candidates?.length,
          finishReason: data?.candidates?.[0]?.finishReason,
          partsCount: data?.candidates?.[0]?.content?.parts?.length,
        }))
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

        if (!rawText) {
          console.error('Empty rawText. Full response:', JSON.stringify(data))
          return res.status(502).json({ error: '\u041f\u0443\u0441\u0442\u043e\u0439 \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 AI. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435 \u0444\u043e\u0442\u043e.' })
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
          return res.status(502).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435 \u0444\u043e\u0442\u043e.' })
        }

        if (parsed.error && parsed.doc_type === 'unknown') {
          return res.status(422).json(parsed)
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
