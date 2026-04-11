/**
 * Backfill script: detect US states for trip_waypoints using local GeoJSON.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-waypoint-states.js
 *
 * Reads VITE_SUPABASE_URL from .env (or set SUPABASE_URL directly).
 * Uses local point-in-polygon — no API calls, no rate limits.
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

// State name -> 2-letter code
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

// --- Local GeoJSON point-in-polygon ---

const geojsonPath = resolve(__dirname, '..', 'public', 'data', 'us-states.geojson')
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'))
const features = geojson.features

function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], xi = ring[i][0]
    const yj = ring[j][1], xj = ring[j][0]
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInGeometry(lat, lng, geometry) {
  const { type, coordinates } = geometry
  if (type === 'Polygon') {
    if (!pointInRing(lat, lng, coordinates[0])) return false
    for (let h = 1; h < coordinates.length; h++) {
      if (pointInRing(lat, lng, coordinates[h])) return false
    }
    return true
  }
  if (type === 'MultiPolygon') {
    for (const polygon of coordinates) {
      if (!pointInRing(lat, lng, polygon[0])) continue
      let inHole = false
      for (let h = 1; h < polygon.length; h++) {
        if (pointInRing(lat, lng, polygon[h])) { inHole = true; break }
      }
      if (!inHole) return true
    }
    return false
  }
  return false
}

function getStateFromCoords(lat, lng) {
  const inCONUS = lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66.5
  const inAlaska = lat >= 51 && lat <= 71.5 && lng >= -180 && lng <= -129.5
  const inHawaii = lat >= 18.5 && lat <= 22.5 && lng >= -161 && lng <= -154.5
  if (!inCONUS && !inAlaska && !inHawaii) return null

  for (const feature of features) {
    if (pointInGeometry(lat, lng, feature.geometry)) {
      return stateToCode(feature.properties.name)
    }
  }
  return null
}

// ---

const LOG_INTERVAL = 500
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function run() {
  console.log('Backfill trip_waypoints.state_code via local GeoJSON point-in-polygon...\n')

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

  let updated = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    try {
      const stateCode = getStateFromCoords(row.latitude, row.longitude)

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
        skipped++
      }
    } catch (err) {
      console.error(`  Error processing ${row.id}:`, err.message)
      errors++
    }

    if ((i + 1) % LOG_INTERVAL === 0 || i === rows.length - 1) {
      console.log(`  Progress: ${i + 1} / ${rows.length} (updated: ${updated}, skipped: ${skipped}, errors: ${errors})`)
    }
  }

  console.log(`\nDone!`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (non-US or failed): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
