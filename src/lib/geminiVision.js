/**
 * AI odometer reading via Gemini Vision.
 * Routed through /api/gemini serverless proxy so the Gemini API key
 * never ships in the client bundle. See api/gemini.js.
 *
 * Returns a structured object (or null on missing session):
 *   { value, confidence, notes, kmConverted }    — recognised odometer
 *   { error: 'no_odometer_detected' }             — image is not a dashboard
 *   { error: 'parse_error' }                      — model returned bad JSON
 *   { error: 'http_<status>' | 'transport_error' } — proxy/transport failure
 */

import { supabase } from './supabase'
import { parseOdometerResponse, shouldWarnOdometerDecrease } from './geminiVisionUtils'

export { parseOdometerResponse, shouldWarnOdometerDecrease }

const ODOMETER_PROMPT =
  'You are reading the odometer on a truck dashboard. Return ONLY a JSON object:\n' +
  '{\n' +
  '  "odometer_miles": <integer>,\n' +
  '  "confidence": "high" | "medium" | "low",\n' +
  '  "notes": "<string, optional>"\n' +
  '}\n' +
  '\n' +
  'Rules:\n' +
  '1. Return the MAIN odometer reading (total miles), NOT trip A or trip B counters.\n' +
  '2. If you see a decimal (e.g. 258099.5), round to nearest integer.\n' +
  '3. If the image shows kilometers (km), convert to miles: miles = round(km / 1.609344). Mention this in "notes".\n' +
  '4. If you cannot read the digits clearly, set confidence: "low" and explain in notes.\n' +
  '5. If the image is not a dashboard or does not contain an odometer, return: {"error": "no_odometer_detected"}.\n' +
  '6. Do NOT return any text outside the JSON.'

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
        prompt: ODOMETER_PROMPT,
        image: { mimeType, data: base64 },
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
      return { error: 'http_' + response.status }
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return parseOdometerResponse(text)
  } catch (err) {
    console.error('readOdometerFromPhoto error:', err)
    return { error: 'transport_error' }
  }
}
