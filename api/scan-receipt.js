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

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
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
        }),
      }
    )

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error('Gemini API error:', response.status, errText)
      return res.status(502).json({ error: `Gemini API ${response.status}: ${errText.slice(0, 300)}` })
    }

    const data = await response.json()
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!rawText) {
      return res.status(502).json({ error: 'Empty AI response' })
    }

    // Strip markdown code fences if present
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse Gemini response:', jsonStr.slice(0, 500))
      return res.status(502).json({ error: 'Invalid AI response format' })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out' })
    }
    console.error('Gemini API error:', err.message, err.response?.data || err)
    return res.status(500).json({ error: err.message || 'Unknown error' })
  }
}
