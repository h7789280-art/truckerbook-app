import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { getFleetPositions } from '../lib/api'

export default function FleetMap({ companyId }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadPositions = useCallback(async () => {
    if (!companyId) return
    try {
      setError(null)
      const data = await getFleetPositions(companyId)
      setPositions(data)
    } catch (err) {
      console.error('FleetMap loadPositions error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadPositions()
  }, [loadPositions])

  // Init leaflet map
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

      const map = L.map(mapRef.current, { zoomControl: false }).setView([50, 30], 5)
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

  // Invalidate size when loading finishes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (map && !loading) {
      setTimeout(() => map.invalidateSize(), 100)
    }
  }, [loading])

  // Draw markers
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    import('leaflet').then((L) => {
      // Clear old markers
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      if (positions.length === 0) return

      positions.forEach((pos) => {
        const truckIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
            <div style="width:32px;height:32px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;">\ud83d\ude9b</div>
            <div style="background:rgba(0,0,0,0.75);color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:600;line-height:1.3;">
              ${pos.driver_name || '?'}<br/>
              <span style="font-weight:400;opacity:0.8;">${pos.plate_number || ''}</span>
            </div>
          </div>`,
          iconSize: [120, 36],
          iconAnchor: [16, 18],
        })

        const lastUpdate = pos.recorded_at
          ? new Date(pos.recorded_at).toLocaleString()
          : '—'

        const popupContent = `
          <div style="font-size:13px;line-height:1.5;min-width:160px;">
            <div style="font-weight:700;margin-bottom:4px;">\ud83d\ude9b ${pos.driver_name || '?'}</div>
            <div><b>${t('fleetMap.vehicle')}:</b> ${pos.brand || ''} ${pos.model || ''} (${pos.plate_number || ''})</div>
            <div><b>${t('fleetMap.route')}:</b> ${pos.origin || '?'} \u2192 ${pos.destination || '?'}</div>
            <div style="color:#888;margin-top:4px;font-size:11px;">${t('fleetMap.lastUpdate')}: ${lastUpdate}</div>
          </div>
        `

        const marker = L.marker([pos.latitude, pos.longitude], { icon: truckIcon })
          .bindPopup(popupContent, { maxWidth: 260 })
          .addTo(map)
        markersRef.current.push(marker)
      })

      // fitBounds
      const bounds = L.latLngBounds(positions.map(p => [p.latitude, p.longitude]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
    })
  }, [positions, t])

  const handleRefresh = () => {
    setLoading(true)
    loadPositions()
  }

  const hasPositions = positions.length > 0

  return (
    <div style={{
      background: theme.card,
      border: '1px solid ' + theme.border,
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '12px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid ' + theme.border,
      }}>
        <div style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}>
          {'\ud83d\uddfa\ufe0f'} {t('fleetMap.fleetMap')}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            background: 'none',
            border: '1px solid ' + theme.border,
            borderRadius: '8px',
            color: theme.dim,
            fontSize: '12px',
            padding: '4px 10px',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {'\u21bb'} {t('fleetMap.refreshMap')}
        </button>
      </div>

      {/* Map container */}
      <div style={{ position: 'relative', height: '300px' }}>
        <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: theme.dim, background: theme.bg, zIndex: 500,
          }}>
            {t('common.loading')}
          </div>
        )}

        {!loading && !hasPositions && !error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: theme.dim, fontSize: '14px', background: theme.bg, zIndex: 500, gap: '8px',
          }}>
            <span style={{ fontSize: '32px' }}>{'\ud83d\ude9b'}</span>
            {t('fleetMap.noActiveTrips')}
          </div>
        )}

        {!loading && error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ef4444', fontSize: '13px', background: theme.bg, zIndex: 500,
          }}>
            {t('common.error')}
          </div>
        )}
      </div>
    </div>
  )
}
