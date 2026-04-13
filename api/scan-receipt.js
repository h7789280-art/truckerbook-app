const MODELS = ['gemini-1.5-flash', 'gemini-2.5-flash']
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const { image } = req.body || {}
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image (base64 string required)' })
  }

  // Limit payload ~4MB base64 (~3MB image)
  if (image.length > 4 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image too large' })
  }

  const prompt = `Analyze this receipt/invoice image. Extract ALL line items and categorize each one.

Return ONLY valid JSON (no markdown, no backticks):
{
  "store_name": "store/gas station name",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "items": [
    {
      "description": "Diesel fuel",
      "amount": 250.00,
      "category": "fuel",
      "subcategory": "diesel"
    }
  ]
}

Categories to use:
- "fuel" (diesel, gas) — subcategory: "diesel" or "gas"
- "def" (DEF fluid, AdBlue)
- "food" (food, drinks, snacks)
- "tools" (tools, parts, accessories for truck)
- "parking" (parking fees)
- "scale" (scale/weigh station fees)
- "wash" (truck wash, car wash)
- "tolls" (toll roads)
- "phone" (phone, communication)
- "clothes" (work clothes, boots)
- "other" (anything else)

If you cannot read the receipt clearly, return: {"error": "Cannot read receipt", "items": []}`

  // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
  const cleanBase64 = image.includes(',') ? image.split(',')[1] : image

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: cleanBase64,
          },
        },
      ],
    }],
  }

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Gemini request: model=${model}, attempt=${attempt}/${MAX_RETRIES}`)
        const response = await callGemini(apiKey, model, requestBody)

        if (response.status === 503) {
          console.warn(`Gemini 503 (model=${model}, attempt=${attempt})`)
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS)
            continue
          }
          // All retries exhausted for this model — try fallback
          break
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          console.error('Gemini API error:', response.status, errText)
          console.error('Full response:', JSON.stringify({ status: response.status, body: errText }))
          return res.status(502).json({
            error: '\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043e\u0448\u0438\u0431\u043a\u0443. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.',
            detail: `Gemini API ${response.status}`,
          })
        }

        const data = await response.json()
        console.log('Gemini raw response structure:', JSON.stringify({
          candidatesCount: data?.candidates?.length,
          finishReason: data?.candidates?.[0]?.finishReason,
          partsCount: data?.candidates?.[0]?.content?.parts?.length,
        }))
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

        if (!rawText) {
          console.error('Empty rawText. Full response:', JSON.stringify(data))
          return res.status(502).json({ error: '\u041f\u0443\u0441\u0442\u043e\u0439 \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 AI. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435 \u0444\u043e\u0442\u043e.' })
        }

        // Strip markdown code fences if present (handles ```json ... ``` wrapping)
        let jsonStr = rawText
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
        }

        let parsed
        try {
          parsed = JSON.parse(jsonStr)
        } catch (parseErr) {
          console.error('JSON parse error:', parseErr.message)
          console.error('Failed to parse Gemini response:', jsonStr.slice(0, 500))
          console.error('Full response:', JSON.stringify(data))
          return res.status(502).json({ error: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c \u0447\u0435\u043a. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435 \u0444\u043e\u0442\u043e.' })
        }

        if (model !== MODELS[0]) {
          parsed._fallback_model = model
        }

        return res.status(200).json(parsed)
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`Gemini timeout (model=${model}, attempt=${attempt})`)
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS)
            continue
          }
          break
        }
        console.error(`Gemini error (model=${model}, attempt=${attempt}):`, err.message, err.stack)
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS)
          continue
        }
        break
      }
    }
    console.warn(`All ${MAX_RETRIES} retries failed for ${model}, trying next model...`)
  }

  // All models and retries exhausted
  return res.status(503).json({
    error: '\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043c\u0438\u043d\u0443\u0442\u0443.',
  })
}
