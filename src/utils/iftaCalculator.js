/**
 * IFTA State Miles Calculator
 * Reverse-geocodes trip waypoints via Nominatim and calculates
 * miles driven per US/CA state/province for IFTA reporting.
 */

import { supabase } from '../lib/supabase'
import { stateToCode } from './usStates'

const NOMINATIM_DELAY_MS = 1100 // Nominatim usage policy: max 1 req/sec

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Reverse-geocode a lat/lng via Nominatim.
 * Returns { state_code, country_code } or null if not in US/CA.
 */
export async function reverseGeocodeWaypoint(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=5&addressdetails=1`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TruckerBook/1.0 (IFTA mileage calculator)' },
  })

  if (!res.ok) {
    console.warn(`Nominatim HTTP ${res.status} for ${lat},${lng}`)
    return null
  }

  const data = await res.json()
  if (!data.address) return null

  const countryCode = (data.address.country_code || '').toLowerCase()

  // Only US and CA are IFTA jurisdictions
  if (countryCode !== 'us' && countryCode !== 'ca') return null

  const stateName = data.address.state
  if (!stateName) return null

  const stateCode = stateToCode(stateName)
  if (!stateCode) return null

  return { state_code: stateCode, country_code: countryCode }
}

/**
 * Haversine distance between two points in miles.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Determine fiscal quarter (1-4) from a Date.
 */
function getQuarter(date) {
  return Math.ceil((date.getMonth() + 1) / 3)
}

/**
 * Main function: calculate miles per state for a completed trip.
 *
 * 1. Loads waypoints for the trip (sorted by recorded_at)
 * 2. Reverse-geocodes waypoints missing state_code (with rate limiting)
 * 3. Computes haversine distances between consecutive points
 * 4. Aggregates miles per state
 * 5. Upserts into ifta_trip_state_miles
 *
 * @param {string} tripId - UUID of the trip
 * @returns {Object} Map of state_code → miles, e.g. { TX: 450.2, OK: 200.1 }
 */
export async function calculateTripStateMiles(tripId) {
  // 1. Fetch waypoints ordered by recorded_at
  const { data: waypoints, error: wpError } = await supabase
    .from('trip_waypoints')
    .select('id, latitude, longitude, state_code, recorded_at')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true })

  if (wpError) throw wpError
  if (!waypoints || waypoints.length < 2) return {}

  // 2. Reverse-geocode waypoints missing state_code
  for (const wp of waypoints) {
    if (wp.state_code) continue

    const geo = await reverseGeocodeWaypoint(wp.latitude, wp.longitude)
    if (geo) {
      wp.state_code = geo.state_code
      // Persist to DB
      await supabase
        .from('trip_waypoints')
        .update({ state_code: geo.state_code })
        .eq('id', wp.id)
    }

    // Rate limit — always wait even if geo failed
    await sleep(NOMINATIM_DELAY_MS)
  }

  // 3. Calculate miles per state from consecutive pairs
  const stateMiles = {}

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude)

    if (a.state_code && b.state_code) {
      if (a.state_code === b.state_code) {
        // Same state — full distance to that state
        stateMiles[a.state_code] = (stateMiles[a.state_code] || 0) + dist
      } else {
        // State border crossing — split distance evenly (approximation)
        stateMiles[a.state_code] = (stateMiles[a.state_code] || 0) + dist / 2
        stateMiles[b.state_code] = (stateMiles[b.state_code] || 0) + dist / 2
      }
    } else if (a.state_code) {
      // Only first point has state — attribute all to it
      stateMiles[a.state_code] = (stateMiles[a.state_code] || 0) + dist
    } else if (b.state_code) {
      // Only second point has state — attribute all to it
      stateMiles[b.state_code] = (stateMiles[b.state_code] || 0) + dist
    }
    // If neither has state_code, distance is not counted (outside IFTA jurisdictions)
  }

  // 4. Get trip date for quarter/year
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('start_date, created_at, vehicle_id, user_id')
    .eq('id', tripId)
    .single()

  if (tripError) throw tripError

  const tripDate = new Date(trip.start_date || trip.created_at)
  const quarter = getQuarter(tripDate)
  const year = tripDate.getFullYear()

  // 5. Upsert into ifta_trip_state_miles
  const rows = Object.entries(stateMiles).map(([state_code, miles]) => ({
    trip_id: tripId,
    user_id: trip.user_id,
    vehicle_id: trip.vehicle_id,
    state_code,
    miles: Math.round(miles * 100) / 100, // 2 decimal places
    quarter,
    year,
  }))

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('ifta_trip_state_miles')
      .upsert(rows, { onConflict: 'trip_id,state_code' })

    if (upsertError) throw upsertError
  }

  return stateMiles
}
