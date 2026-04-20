/**
 * AI odometer reading via Gemini Vision.
 * Routed through /api/gemini serverless proxy so the Gemini API key
 * never ships in the client bundle. See api/gemini.js.
 */

import { supabase } from './supabase'

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
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) {
    // No session — fail quietly (same contract as old "no API key" path).
    return null
  }

  try {
    const base64 = await fileToBase64(imageFile)
    const mimeType = imageFile.type || 'image/jpeg'

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({
        action: 'generate',
        prompt:
          'This is a photo of a vehicle odometer. Read the number shown on the odometer display. Return ONLY the numeric value, digits only, no spaces, no units, no text. If you cannot read it, return ERROR.',
        image: {
          mimeType,
          data: base64,
        },
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        console.warn('readOdometerFromPhoto: unauthorized')
      } else if (response.status === 429) {
        console.warn('readOdometerFromPhoto: rate limited')
      } else if (response.status === 413) {
        console.error('readOdometerFromPhoto: image too large')
      } else if (response.status === 503) {
        console.warn('readOdometerFromPhoto: service unavailable')
      } else {
        console.error('readOdometerFromPhoto: Gemini proxy error', response.status)
      }
      return null
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text || text.includes('ERROR')) {
      return null
    }

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
