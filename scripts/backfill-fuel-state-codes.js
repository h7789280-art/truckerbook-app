/**
 * Backfill script: populate state_code from state in fuel_entries.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-fuel-state-codes.js
 *
 * Reads VITE_SUPABASE_URL from .env (or set SUPABASE_URL directly).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dependency needed)
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
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-fuel-state-codes.js')
  process.exit(1)
}

// State name → 2-letter code mapping (inline to avoid ESM import issues with src/)
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
    const reverse = Object.values(STATE_NAME_TO_CODE).includes(upper)
    if (reverse) return upper
  }
  if (STATE_NAME_TO_CODE[trimmed]) return STATE_NAME_TO_CODE[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (name.toLowerCase() === lower) return code
  }
  return null
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const BATCH_SIZE = 100

async function run() {
  console.log('Backfill fuel_entries.state_code from state...\n')

  // Fetch all rows where state_code IS NULL and state IS NOT NULL
  const { data: rows, error } = await supabase
    .from('fuel_entries')
    .select('id, state, state_code')
    .is('state_code', null)
    .not('state', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${rows.length} rows with state but no state_code.\n`)

  if (rows.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  let updated = 0
  let skipped = 0
  const unmapped = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const updates = []

    for (const row of batch) {
      const code = stateToCode(row.state)
      if (code) {
        updates.push({ id: row.id, state_code: code })
      } else {
        skipped++
        if (unmapped.length < 10) {
          unmapped.push({ id: row.id, state: row.state })
        }
      }
    }

    // Update each row in the batch
    for (const upd of updates) {
      const { error: updErr } = await supabase
        .from('fuel_entries')
        .update({ state_code: upd.state_code })
        .eq('id', upd.id)

      if (updErr) {
        console.error(`  Error updating ${upd.id}:`, updErr.message)
        skipped++
      } else {
        updated++
      }
    }

    console.log(`  Processed ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`)
  }

  console.log(`\nDone!`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (unmapped): ${skipped}`)

  if (unmapped.length > 0) {
    console.log(`\nUnmapped examples:`)
    for (const u of unmapped) {
      console.log(`  id=${u.id}  state="${u.state}"`)
    }
  }
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
