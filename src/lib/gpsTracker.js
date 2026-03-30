import { supabase } from './supabase'

const INTERVAL_MS = 60000
const MIN_DISTANCE_M = 500
const STORAGE_KEY = 'gps_offline_waypoints'

let watchId = null
let lastSaved = null
let lastSavedTime = 0

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

async function syncOfflineWaypoints() {
  const queue = getOfflineQueue()
  if (queue.length === 0) return
  const toInsert = [...queue]
  saveOfflineQueue([])
  const { error } = await supabase
    .from('trip_waypoints')
    .insert(toInsert)
  if (error) {
    console.error('GPS sync error:', error)
    const remaining = getOfflineQueue()
    saveOfflineQueue([...toInsert, ...remaining])
  }
}

async function insertWaypointRow(row) {
  if (!navigator.onLine) {
    const queue = getOfflineQueue()
    queue.push(row)
    saveOfflineQueue(queue)
    return
  }
  await syncOfflineWaypoints()
  const { error } = await supabase
    .from('trip_waypoints')
    .insert(row)
  if (error) {
    console.error('insertWaypoint error:', error)
    const queue = getOfflineQueue()
    queue.push(row)
    saveOfflineQueue(queue)
  }
}

export function startTracking(tripId, userId, onPosition) {
  if (watchId !== null) stopTracking()
  if (!navigator.geolocation) {
    console.error('Geolocation not supported')
    return false
  }

  supabase
    .from('trips')
    .update({ is_tracking: true })
    .eq('id', tripId)
    .then(({ error }) => { if (error) console.error('update is_tracking error:', error) })

  window.addEventListener('online', syncOfflineWaypoints)

  lastSaved = null
  lastSavedTime = 0

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed, heading, accuracy } = pos.coords
      const now = Date.now()

      if (onPosition) onPosition({ latitude, longitude, speed, heading, accuracy })

      const timePassed = now - lastSavedTime >= INTERVAL_MS
      const distPassed = lastSaved
        ? distanceMeters(lastSaved.lat, lastSaved.lon, latitude, longitude) >= MIN_DISTANCE_M
        : true

      if (timePassed || distPassed) {
        const row = {
          trip_id: tripId,
          user_id: userId,
          latitude,
          longitude,
          speed: speed != null ? speed : null,
          heading: heading != null ? heading : null,
          accuracy: accuracy != null ? accuracy : null,
          recorded_at: new Date().toISOString(),
        }
        insertWaypointRow(row)
        lastSaved = { lat: latitude, lon: longitude }
        lastSavedTime = now
      }
    },
    (err) => {
      console.error('GPS error:', err.code, err.message)
    },
    { enableHighAccuracy: true, maximumAge: 30000 }
  )

  return true
}

export function stopTracking(tripId) {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  window.removeEventListener('online', syncOfflineWaypoints)
  lastSaved = null
  lastSavedTime = 0

  if (tripId) {
    supabase
      .from('trips')
      .update({ is_tracking: false })
      .eq('id', tripId)
      .then(({ error }) => { if (error) console.error('update is_tracking error:', error) })
  }
  syncOfflineWaypoints()
}

export async function getWaypoints(tripId) {
  const { data, error } = await supabase
    .from('trip_waypoints')
    .select('*')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data || []
}

export function isTracking() {
  return watchId !== null
}
