/**
 * Backfill script: reverse-geocode trip_waypoints to populate state_code.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-waypoint-states.js
 *
 * Reads VITE_SUPABASE_URL from .env (or set SUPABASE_URL directly).
 * Rate-limited to 1 request per 1.1 seconds (Nominatim usage policy).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env')
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    const env = {}
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
    return env
  } catch { return {} }
}

const fileEnv = loadEnv()
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Set SUPABASE_SERVICE_ROLE_KEY (and optionally SUPABASE_URL).')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-waypoint-states.js')
  process.exit(1)
}

// State name -> 2-letter code (inline to avoid ESM import issues with src/)
const STATE_NAME_TO_CODE = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
  'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB', 'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL', 'Nova Scotia': 'NS', 'Ontario': 'ON',
  'Prince Edward Island': 'PE', 'Quebec': 'QC', 'Saskatchewan': 'SK',
  'Northwest Territories': 'NT', 'Nunavut': 'NU', 'Yukon': 'YT',
}

function stateToCode(state) {
  if (!state) return null
  const trimmed = state.trim()
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase()
    if (Object.values(STATE_NAME_TO_CODE).includes(upper)) return upper
  }
  if (STATE_NAME_TO_CODE[trimmed]) return STATE_NAME_TO_CODE[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (name.toLowerCase() === lower) return code
  }
  return null
}

const NOMINATIM_DELAY_MS = 1100
const LOG_INTERVAL = 50

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=5&addressdetails=1`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TruckerBook/1.0 (IFTA backfill script)' },
  })

  if (!res.ok) {
    console.warn(`  Nominatim HTTP ${res.status} for ${lat},${lng}`)
    return null
  }

  const data = await res.json()
  if (!data.address) return null

  const countryCode = (data.address.country_code || '').toLowerCase()
  if (countryCode !== 'us' && countryCode !== 'ca') return null

  const stateName = data.address.state
  return stateToCode(stateName)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function run() {
  console.log('Backfill trip_waypoints.state_code via Nominatim reverse geocoding...\n')

  // Fetch all waypoints where state_code IS NULL
  const { data: rows, error } = await supabase
    .from('trip_waypoints')
    .select('id, latitude, longitude')
    .is('state_code', null)
    .order('recorded_at', { ascending: true })
    .limit(10000)

  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${rows.length} waypoints without state_code.\n`)

  if (rows.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  const estimated = Math.ceil(rows.length * NOMINATIM_DELAY_MS / 1000 / 60)
  console.log(`Estimated time: ~${estimated} minutes (rate limited to 1 req/1.1s)\n`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    try {
      const stateCode = await reverseGeocode(row.latitude, row.longitude)

      if (stateCode) {
        const { error: updErr } = await supabase
          .from('trip_waypoints')
          .update({ state_code: stateCode })
          .eq('id', row.id)

        if (updErr) {
          console.error(`  DB update error for ${row.id}:`, updErr.message)
          errors++
        } else {
          updated++
        }
      } else {
        skipped++ // Outside US/CA or geocoding failed
      }
    } catch (err) {
      console.error(`  Error processing ${row.id}:`, err.message)
      errors++
    }

    // Log progress every LOG_INTERVAL records
    if ((i + 1) % LOG_INTERVAL === 0 || i === rows.length - 1) {
      console.log(`  Progress: ${i + 1} / ${rows.length} (updated: ${updated}, skipped: ${skipped}, errors: ${errors})`)
    }

    // Rate limit
    if (i < rows.length - 1) {
      await sleep(NOMINATIM_DELAY_MS)
    }
  }

  console.log(`\nDone!`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (non-US/CA or failed geocode): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
