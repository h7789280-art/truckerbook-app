/**
 * Pure helpers for AI odometer recognition. Extracted into their own module
 * so they can be imported (and unit-tested) without pulling in the supabase
 * client, which depends on `import.meta.env` and trips outside Vite.
 */

/**
 * Parses the raw text returned by Gemini for an odometer photo.
 *
 * Returns:
 *   { value, confidence, notes, kmConverted }   — recognised odometer
 *   { error: 'no_odometer_detected' }            — image is not a dashboard
 *   { error: 'parse_error' }                     — model returned bad JSON
 */
export function parseOdometerResponse(text) {
  if (!text || typeof text !== 'string') {
    return { error: 'parse_error' }
  }

  // Strip optional ```json fences the model sometimes adds.
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { error: 'parse_error' }
  }

  if (parsed && parsed.error === 'no_odometer_detected') {
    return { error: 'no_odometer_detected' }
  }

  const raw = Number(parsed?.odometer_miles)
  if (!Number.isFinite(raw) || raw <= 0) {
    return { error: 'parse_error' }
  }
  const value = Math.round(raw)

  const confidence = ['high', 'medium', 'low'].includes(parsed?.confidence)
    ? parsed.confidence
    : 'medium'
  const notes = typeof parsed?.notes === 'string' ? parsed.notes : ''
  const kmConverted = /\b(km|kilomet)/i.test(notes)

  return { value, confidence, notes, kmConverted }
}

/**
 * Returns true if `newValue` is strictly lower than `currentValue` (and both
 * are real numbers). Odometers normally only increase — the UI uses this to
 * confirm before saving an unexpectedly lower value.
 */
export function shouldWarnOdometerDecrease(newValue, currentValue) {
  const n = Number(newValue)
  const c = Number(currentValue)
  if (!Number.isFinite(n) || !Number.isFinite(c)) return false
  return n < c
}
