/**
 * AI parts-invoice scanner via Google Gemini Vision API.
 * Used by the parts-resource flow (owner_operator) to auto-fill PartFormModal.
 *
 * Returns a normalized object:
 *   {
 *     part_category: one of PART_PRESETS keys | null,
 *     part_name: string | null,
 *     install_date: 'YYYY-MM-DD' | null,
 *     odometer_miles: integer | null,
 *     cost_total: number | null,
 *     shop_name: string | null,
 *     invoice_number: string | null,
 *   }
 * or null when the scan failed entirely (network/parse error).
 */

// Exact category keys from src/lib/partResourcePresets.js — DO NOT invent new ones.
// Gemini is instructed to use one of these English tokens, then we map to app keys.
const ALLOWED_GEMINI_CATEGORIES = [
  'engine_oil',
  'fuel_filter',
  'air_filter',
  'cabin_filter',
  'def_filter',
  'transmission_oil',
  'differential_oil',
  'brake_pads',
  'brake_discs',
  'clutch',
  'belts',
  'battery',
  'steer_tires',
  'drive_tires',
  'trailer_tires',
  'other',
]

// Map Gemini-returned tokens → actual keys used in PART_PRESETS.
const CATEGORY_MAP = {
  engine_oil: 'oil',
  fuel_filter: 'filter_fuel',
  air_filter: 'filter_air',
  cabin_filter: 'filter_cabin',
  def_filter: 'filter_def',
  transmission_oil: 'transmission_oil',
  differential_oil: 'diff_oil',
  brake_pads: 'brake_pads',
  brake_discs: 'brake_disc',
  clutch: 'clutch',
  belts: 'belts',
  battery: 'battery',
  steer_tires: 'tire_steer',
  drive_tires: 'tire_drive',
  trailer_tires: 'tire_trailer',
  other: 'other',
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Client-side compression before upload to keep Gemini payload small.
function compressImage(file, maxSize = 1024 * 1024, maxDim = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/')) {
      resolve(null)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const tryQ = (q) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(null); return }
            if (blob.size > maxSize && q > 0.3) {
              tryQ(q - 0.1)
            } else {
              const reader = new FileReader()
              reader.onload = () => resolve({
                base64: reader.result.split(',')[1],
                mimeType: 'image/jpeg',
              })
              reader.onerror = () => resolve(null)
              reader.readAsDataURL(blob)
            }
          },
          'image/jpeg',
          q
        )
      }
      tryQ(quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

function extractJson(text) {
  if (!text) return null
  let s = text.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
  }
  try {
    return JSON.parse(s)
  } catch {
    // Fallback: grab the first {...} block
    const m = s.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch { return null }
    }
    return null
  }
}

function normalizeDate(v) {
  if (!v || typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function normalizeInt(v) {
  if (v == null) return null
  const n = parseInt(String(v).replace(/[\s,]/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function normalizeFloat(v) {
  if (v == null) return null
  const cleaned = String(v).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function normalizeStr(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

export async function scanPartInvoice(imageFile) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    console.error('VITE_GEMINI_API_KEY is not set')
    return null
  }

  try {
    const compressed = await compressImage(imageFile)
    let base64, mimeType
    if (compressed) {
      base64 = compressed.base64
      mimeType = compressed.mimeType
    } else {
      base64 = await fileToBase64(imageFile)
      mimeType = imageFile.type || 'image/jpeg'
    }

    const promptText = [
      'Analyze this auto parts invoice/receipt and extract the following fields.',
      'Return ONLY a JSON object with these keys, no explanation, no markdown.',
      'Use null for any missing fields.',
      '',
      'Fields:',
      '- part_category: one of [' + ALLOWED_GEMINI_CATEGORIES.join(', ') + ']',
      '- part_name: exact part name as written (string)',
      '- install_date: service/install date in YYYY-MM-DD format',
      '- odometer_miles: integer, odometer reading at service if shown',
      '- cost_total: number, total amount paid',
      '- shop_name: service shop / vendor name',
      '- invoice_number: invoice or receipt number if present',
      '',
      'Example output:',
      '{"part_category":"engine_oil","part_name":"Shell Rotella T6 5W-40","install_date":"2026-04-15","odometer_miles":325400,"cost_total":189.99,"shop_name":"Pilot Travel Center","invoice_number":"INV-2341"}',
    ].join('\n')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: promptText },
            ],
          }],
        }),
      }
    )

    if (!response.ok) {
      console.error('Gemini invoice scan error:', response.status)
      return null
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    const parsed = extractJson(text)
    if (!parsed || typeof parsed !== 'object') return null

    const rawCat = normalizeStr(parsed.part_category)
    const mappedCat = rawCat ? CATEGORY_MAP[rawCat.toLowerCase()] || null : null

    return {
      part_category: mappedCat,
      part_name: normalizeStr(parsed.part_name),
      install_date: normalizeDate(parsed.install_date),
      odometer_miles: normalizeInt(parsed.odometer_miles),
      cost_total: normalizeFloat(parsed.cost_total),
      shop_name: normalizeStr(parsed.shop_name),
      invoice_number: normalizeStr(parsed.invoice_number),
    }
  } catch (err) {
    console.error('scanPartInvoice error:', err)
    return null
  }
}
