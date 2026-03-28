import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { fetchVehicles } from '../lib/api'

export default function VehicleSwitcher({ userId, profile, activeVehicleId, onSelect, onAddVehicle }) {
  const { theme } = useTheme()
  const [vehicles, setVehicles] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const data = await fetchVehicles(userId)
      setVehicles(data)
    } catch (err) {
      console.error('VehicleSwitcher load error:', err)
    } finally {
      setLoaded(true)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  if (!loaded || vehicles.length === 0) return null

  const mainVehicle = {
    id: 'main',
    brand: profile?.brand || '',
    model: profile?.model || '',
    plate_number: profile?.plate_number || '',
  }

  const allVehicles = [mainVehicle, ...vehicles]

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      padding: '0 16px 8px',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
    }}>
      {allVehicles.map((v) => {
        const isActive = activeVehicleId === v.id
        const label = [v.brand, v.model].filter(Boolean).join(' ') || '\u041c\u0430\u0448\u0438\u043d\u0430'
        const plate = v.plate_number || '\u041d\u0435\u0442 \u043d\u043e\u043c\u0435\u0440\u0430'
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '12px',
              border: isActive ? '2px solid #f59e0b' : ('2px solid ' + theme.border),
              background: isActive ? (theme.card2 || theme.card) : theme.card,
              color: theme.text,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              transition: 'border-color 0.2s',
            }}
          >
            <span style={{ fontSize: '16px' }}>{'\ud83d\ude9b'}</span>
            <span>{label}</span>
            <span style={{ color: theme.dim, fontWeight: 400 }}>{'\u00b7'}</span>
            <span style={{ color: theme.dim, fontWeight: 400, fontSize: '12px' }}>{plate}</span>
          </button>
        )
      })}
      {onAddVehicle && (
        <button
          onClick={onAddVehicle}
          style={{
            flexShrink: 0,
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: '2px dashed ' + theme.border,
            background: 'transparent',
            color: theme.dim,
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
