/**
 * AI odometer reading via Google Gemini Vision API
 */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function readOdometerFromPhoto(imageFile) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    console.error('VITE_GEMINI_API_KEY is not set')
    return null
  }

  try {
    const base64 = await fileToBase64(imageFile)
    const mimeType = imageFile.type || 'image/jpeg'

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64,
                },
              },
              {
                text: 'This is a photo of a vehicle odometer. Read the number shown on the odometer display. Return ONLY the numeric value, digits only, no spaces, no units, no text. If you cannot read it, return ERROR.',
              },
            ],
          }],
        }),
      }
    )

    if (!response.ok) {
      console.error('Gemini API error:', response.status)
      return null
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text || text.includes('ERROR')) {
      return null
    }

    // Remove separators (spaces, commas, dots used as thousand separators)
    const cleaned = text.replace(/[\s,._\-]/g, '')
    const num = parseInt(cleaned, 10)

    if (isNaN(num) || num <= 0) {
      return null
    }

    return num
  } catch (err) {
    console.error('readOdometerFromPhoto error:', err)
    return null
  }
}
