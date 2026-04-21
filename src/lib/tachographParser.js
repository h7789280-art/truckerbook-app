/**
 * Tachograph .ddd file parser
 * Supports EU digital tachograph card data (simplified parsing)
 * Falls back to Gemini AI (via /api/gemini serverless proxy) for
 * complex/unrecognized formats. The Gemini API key never ships in
 * the client bundle. See api/gemini.js.
 */

import { supabase } from './supabase'

const ACTIVITY_TYPES = {
  0: 'available',
  1: 'driving',
  2: 'work',
  3: 'rest',
}

function readUint16BE(view, offset) {
  return (view.getUint8(offset) << 8) | view.getUint8(offset + 1)
}

function readUint32BE(view, offset) {
  return (
    (view.getUint8(offset) << 24) |
    (view.getUint8(offset + 1) << 16) |
    (view.getUint8(offset + 2) << 8) |
    view.getUint8(offset + 3)
  ) >>> 0
}

function decodeIA5String(uint8, start, length) {
  let str = ''
  for (let i = start; i < start + length && i < uint8.length; i++) {
    const ch = uint8[i]
    if (ch >= 32 && ch < 127) str += String.fromCharCode(ch)
  }
  return str.trim()
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

/**
 * Try to parse .ddd binary locally (simplified EU tachograph card format)
 */
function tryBinaryParse(buffer) {
  const uint8 = new Uint8Array(buffer)
  const view = new DataView(buffer)

  if (uint8.length < 512) return null

  let driverName = ''
  let cardNumber = ''
  const activities = []

  // Try to find driver identification section
  // EU tachograph card files have TLV-like structure
  // Card Identification: tag 0x0001, driver name area typically within first 0x200 bytes
  try {
    // Scan for printable ASCII sequences that could be driver name
    // Card number is typically 16 chars starting around offset 0x10-0x30
    for (let offset = 0; offset < Math.min(uint8.length, 0x200); offset++) {
      // Look for card number pattern (16 alphanumeric chars)
      if (!cardNumber) {
        let candidate = ''
        for (let j = 0; j < 16 && offset + j < uint8.length; j++) {
          const ch = uint8[offset + j]
          if ((ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 90)) {
            candidate += String.fromCharCode(ch)
          } else {
            break
          }
        }
        if (candidate.length >= 14 && candidate.length <= 16) {
          cardNumber = candidate
        }
      }
    }

    // Try to extract driver name from known offsets
    // In many .ddd card dumps, name appears around 0x30-0x80
    const nameCandidate1 = decodeIA5String(uint8, 0x30, 36)
    const nameCandidate2 = decodeIA5String(uint8, 0x42, 36)
    const nameCandidate3 = decodeIA5String(uint8, 0x58, 36)

    for (const candidate of [nameCandidate1, nameCandidate2, nameCandidate3]) {
      if (candidate.length >= 3 && /^[A-Za-z\s\-]+$/.test(candidate)) {
        driverName = candidate
        break
      }
    }

    // Try to parse activity records
    // Activity records are typically after offset 0x200
    // Each activity record: 2 bytes = (activity_type:2bits)(time:13bits)(??:1bit)
    // Time is minutes since midnight
    let activityOffset = 0x200
    const maxScan = Math.min(uint8.length, 0x2000)
    let lastTimestamp = null

    while (activityOffset < maxScan - 4) {
      const word = readUint16BE(view, activityOffset)
      const actType = (word >> 14) & 0x03
      const timeVal = (word >> 1) & 0x1FFF

      // Validate: timeVal should be 0-1440 (minutes in a day)
      if (timeVal <= 1440 && actType <= 3) {
        const nextWord = activityOffset + 2 < maxScan ? readUint16BE(view, activityOffset + 2) : null
        const nextTime = nextWord !== null ? (nextWord >> 1) & 0x1FFF : null

        if (nextTime !== null && nextTime <= 1440 && nextTime >= timeVal) {
          const duration = nextTime - timeVal
          if (duration > 0 && duration <= 1440) {
            const startH = Math.floor(timeVal / 60)
            const startM = timeVal % 60
            const endH = Math.floor(nextTime / 60)
            const endM = nextTime % 60

            activities.push({
              type: ACTIVITY_TYPES[actType] || 'available',
              start: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
              end: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
              duration,
            })
          }
        }
      }
      activityOffset += 2
    }

    // If we found meaningful data, return it
    if (driverName || cardNumber || activities.length > 2) {
      const totalDriving = activities.filter(a => a.type === 'driving').reduce((s, a) => s + a.duration, 0)
      const totalRest = activities.filter(a => a.type === 'rest').reduce((s, a) => s + a.duration, 0)
      const totalWork = activities.filter(a => a.type === 'work').reduce((s, a) => s + a.duration, 0)
      const totalAvailable = activities.filter(a => a.type === 'available').reduce((s, a) => s + a.duration, 0)

      return {
        driverName: driverName || 'Unknown',
        cardNumber: cardNumber || 'Unknown',
        totalDriving: formatDuration(totalDriving),
        totalDrivingMinutes: totalDriving,
        totalRest: formatDuration(totalRest),
        totalRestMinutes: totalRest,
        totalWork: formatDuration(totalWork),
        totalWorkMinutes: totalWork,
        totalAvailable: formatDuration(totalAvailable),
        totalAvailableMinutes: totalAvailable,
        activities,
        source: 'binary',
      }
    }
  } catch (e) {
    console.warn('Binary parse attempt failed:', e)
  }

  return null
}

/**
 * Convert ArrayBuffer to base64 in O(n) using chunked String.fromCharCode.
 * Avoids O(n^2) string concatenation from reduce() which freezes the browser
 * on multi-MB .ddd files.
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Fallback: send file to Gemini (via /api/gemini proxy) for AI-based extraction.
 * Throws user-friendly Error messages — TachographViewer.jsx renders err.message.
 */
async function parseWithGemini(buffer) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) {
    throw new Error('Authentication required. Please sign in again.')
  }

  const base64 = bufferToBase64(buffer)

  const prompt = 'This is a binary .ddd tachograph file from an EU digital tachograph card. Extract the following data and return ONLY valid JSON (no markdown, no explanation):\n{\n  "driverName": "driver full name",\n  "cardNumber": "card number",\n  "totalDriving": "Xh Ym",\n  "totalRest": "Xh Ym",\n  "totalWork": "Xh Ym",\n  "activities": [{"type": "driving|rest|work|available", "start": "HH:MM", "end": "HH:MM", "duration": minutes_as_number}]\n}\nIf you cannot extract a field, use "Unknown" for strings or 0 for numbers. Return at least estimated values based on the binary data patterns.'

  let response
  try {
    response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({
        action: 'generate',
        prompt,
        media: {
          mimeType: 'application/octet-stream',
          data: base64,
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    })
  } catch (e) {
    console.error('parseTachographFile: network error', e)
    throw new Error('Tachograph parsing service temporarily unavailable.')
  }

  if (!response.ok) {
    if (response.status === 401) {
      console.warn('parseTachographFile: unauthorized')
      throw new Error('Authentication required. Please sign in again.')
    }
    if (response.status === 413) {
      console.error('parseTachographFile: file too large')
      throw new Error('Tachograph file too large (max 10 MB).')
    }
    if (response.status === 429) {
      console.warn('parseTachographFile: rate limited')
      throw new Error('Too many requests. Please wait a minute.')
    }
    console.error('parseTachographFile: Gemini proxy error', response.status)
    throw new Error('Tachograph parsing service temporarily unavailable.')
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not parse Gemini response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  // Calculate minutes if not provided
  const calcMinutes = (durStr) => {
    if (!durStr || durStr === 'Unknown') return 0
    const hMatch = durStr.match(/(\d+)h/)
    const mMatch = durStr.match(/(\d+)m/)
    return (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0)
  }

  return {
    driverName: parsed.driverName || 'Unknown',
    cardNumber: parsed.cardNumber || 'Unknown',
    totalDriving: parsed.totalDriving || '0h 0m',
    totalDrivingMinutes: calcMinutes(parsed.totalDriving),
    totalRest: parsed.totalRest || '0h 0m',
    totalRestMinutes: calcMinutes(parsed.totalRest),
    totalWork: parsed.totalWork || '0h 0m',
    totalWorkMinutes: calcMinutes(parsed.totalWork),
    totalAvailable: parsed.totalAvailable || '0h 0m',
    totalAvailableMinutes: calcMinutes(parsed.totalAvailable),
    activities: (parsed.activities || []).map(a => ({
      type: a.type || 'available',
      start: a.start || '00:00',
      end: a.end || '00:00',
      duration: typeof a.duration === 'number' ? a.duration : 0,
    })),
    source: 'gemini',
  }
}

/**
 * Main parser: tries binary first, falls back to Gemini
 * @param {File} file - .ddd File object
 * @returns {Promise<Object>} parsed tachograph data
 */
export async function parseTachographFile(file) {
  const buffer = await file.arrayBuffer()

  // Try binary parse first
  const binaryResult = tryBinaryParse(buffer)
  if (binaryResult) return binaryResult

  // Fallback to Gemini AI
  return parseWithGemini(buffer)
}
