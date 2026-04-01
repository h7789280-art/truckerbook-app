import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { getWaypoints } from '../lib/gpsTracker'

export default function TripMap({ tripId, tripOrigin, tripDestination, isActive, currentPosition, onClose }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const polylineRef = useRef(null)
  const currentMarkerRef = useRef(null)
  const [waypoints, setWaypoints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) return
    setLoading(true)
    getWaypoints(tripId)
      .then(data => setWaypoints(data))
      .catch(err => console.error('Failed to load waypoints:', err))
      .finally(() => setLoading(false))
  }, [tripId])

  // Refresh waypoints while tracking is active
  useEffect(() => {
    if (!isActive || !tripId) return
    const interval = setInterval(() => {
      getWaypoints(tripId)
        .then(data => setWaypoints(data))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [isActive, tripId])

  useEffect(() => {
    let cancelled = false
    let L

    async function initMap() {
      L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapRef.current) return

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = L.map(mapRef.current, { zoomControl: false }).setView([55.75, 37.62], 10)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)
      L.control.zoom({ position: 'topright' }).addTo(map)
      mapInstanceRef.current = map
      setTimeout(() => { if (map && map.getContainer()) map.invalidateSize() }, 150)
    }

    initMap()
    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Invalidate map size when loading state changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (map && !loading) {
      setTimeout(() => map.invalidateSize(), 100)
    }
  }, [loading])

  // Draw route
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    import('leaflet').then((L) => {
      // Clear old markers and polyline
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      if (polylineRef.current) {
        polylineRef.current.remove()
        polylineRef.current = null
      }

      if (waypoints.length === 0) return

      const coords = waypoints.map(w => [w.latitude, w.longitude])

      // Polyline
      const polyline = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.8 })
      polyline.addTo(map)
      polylineRef.current = polyline

      // Start marker (green)
      const startIcon = L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;background:#22c55e;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      const startMarker = L.marker(coords[0], { icon: startIcon }).addTo(map)
      markersRef.current.push(startMarker)

      // End marker (red)
      if (coords.length > 1) {
        const endIcon = L.divIcon({
          className: '',
          html: '<div style="width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })
        const endMarker = L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map)
        markersRef.current.push(endMarker)
      }

      // Fit bounds
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] })
    })
  }, [waypoints])

  // Current position marker (pulsing blue dot)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isActive || !currentPosition) return

    import('leaflet').then((L) => {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove()
      }

      const pulseIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:20px;height:20px;">
          <div style="position:absolute;width:20px;height:20px;background:rgba(59,130,246,0.3);border-radius:50%;animation:gpsPulse 1.5s ease-out infinite;"></div>
          <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;background:#3b82f6;border:2px solid #fff;border-radius:50%;"></div>
        </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      const marker = L.marker([currentPosition.latitude, currentPosition.longitude], { icon: pulseIcon }).addTo(map)
      currentMarkerRef.current = marker
    })

    return () => {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove()
        currentMarkerRef.current = null
      }
    }
  }, [currentPosition, isActive])

  const overlayStyle = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: theme.bg,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <div style={overlayStyle}>
      <style>{`
        @keyframes gpsPulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 'max(12px, env(safe-area-inset-top, 20px))',
        paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px',
        borderBottom: '1px solid ' + theme.border,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: theme.text,
              fontSize: '16px', fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
              textAlign: 'left',
            }}
          >
            {'\u2190 ' + t('common.back')}
          </button>
          {(tripOrigin || tripDestination) && (
            <div style={{ color: theme.dim, fontSize: '13px', paddingLeft: '8px' }}>
              {(tripOrigin || '?') + ' \u2192 ' + (tripDestination || '?')}
            </div>
          )}
        </div>
        {isActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%' }} />
            {t('gps.tracking')}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {loading ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.dim, background: theme.bg, zIndex: 500 }}>
            {t('common.loading')}
          </div>
        ) : waypoints.length === 0 && !isActive ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.dim, fontSize: '14px', background: theme.bg, zIndex: 500 }}>
            {t('gps.noRoute')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
