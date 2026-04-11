/**
 * Local point-in-polygon state detection using GeoJSON boundaries.
 * Replaces Nominatim reverse geocoding for IFTA — works offline, no rate limits.
 */

import { stateToCode } from './usStates'

let cachedFeatures = null

/**
 * Load and cache US state boundary features from the GeoJSON file.
 */
async function loadFeatures() {
  if (cachedFeatures) return cachedFeatures
  const res = await fetch('/data/us-states.geojson')
  if (!res.ok) throw new Error(`Failed to load us-states.geojson: ${res.status}`)
  const geojson = await res.json()
  cachedFeatures = geojson.features
  return cachedFeatures
}

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (lat, lng) is inside the polygon ring.
 * Ring format: [[lng, lat], [lng, lat], ...]  (GeoJSON order)
 */
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

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
 * Handles holes: first ring is outer boundary, subsequent rings are holes.
 */
function pointInGeometry(lat, lng, geometry) {
  const { type, coordinates } = geometry

  if (type === 'Polygon') {
    // coordinates[0] = outer ring, coordinates[1..n] = holes
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

/**
 * Determine the US state for given coordinates.
 * Returns two-letter state code (e.g. "TX", "NY") or null if outside the US.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} Two-letter state code or null
 */
export async function getStateFromCoords(lat, lng) {
  // Quick bounds check — skip if clearly outside US
  // Continental US: lat 24.5–49.5, lng -125–-66.5
  // Alaska: lat 51–71.5, lng -180–-129.5
  // Hawaii: lat 18.5–22.5, lng -161–-154.5
  const inCONUS = lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66.5
  const inAlaska = lat >= 51 && lat <= 71.5 && lng >= -180 && lng <= -129.5
  const inHawaii = lat >= 18.5 && lat <= 22.5 && lng >= -161 && lng <= -154.5
  if (!inCONUS && !inAlaska && !inHawaii) return null

  const features = await loadFeatures()

  for (const feature of features) {
    if (pointInGeometry(lat, lng, feature.geometry)) {
      const name = feature.properties.name
      return stateToCode(name)
    }
  }

  return null
}
