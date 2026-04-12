import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { fetchTrips, fetchFleetSummary } from '../lib/api'

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

export default function TripsDetails({ userId, profile, onBack }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const distLabel = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'
  const isOwner = profile?.role === 'owner_operator'

  const [loading, setLoading] = useState(true)
  const [allTrips, setAllTrips] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [filter, setFilter] = useState('all')
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [expanded, setExpanded] = useState(null)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      if (isOwner) {
        const trips = await fetchTrips(userId)
        setAllTrips(trips || [])
      } else {
        const [trips, fleet] = await Promise.all([
          fetchTrips(userId),
          fetchFleetSummary(userId),
        ])
        setAllTrips(trips || [])
        setVehicles(fleet?.vehicles || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [userId, isOwner])

  useEffect(() => { loadData() }, [loadData])

  const now = new Date()
  let periodFrom, periodTo = now
  if (period === 'week') {
    periodFrom = new Date(now)
    periodFrom.setDate(periodFrom.getDate() - 7)
  } else if (period === 'custom' && customFrom) {
    periodFrom = new Date(customFrom)
    periodTo = customTo ? new Date(customTo) : now
  } else {
    periodFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  let filtered = allTrips.filter(tr => {
    const d = new Date(tr.created_at)
    return d >= periodFrom && d <= periodTo
  })
  if (filter !== 'all') {
    filtered = filtered.filter(tr => tr.vehicle_id === filter)
  }

  const tripsByVeh = {}
  vehicles.forEach(v => { tripsByVeh[v.id] = [] })
  filtered.forEach(tr => {
    if (tr.vehicle_id && tripsByVeh[tr.vehicle_id]) {
      tripsByVeh[tr.vehicle_id].push(tr)
    }
  })

  const fmtDate = (ds) => {
    if (!ds) return ''
    const d = new Date(ds)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const periodBtnStyle = (key) => ({
    flex: 1,
    padding: '8px 4px',
    borderRadius: '8px',
    border: period === key ? '2px solid #f59e0b' : '1px solid ' + theme.border,
    background: period === key ? '#f59e0b22' : 'transparent',
    color: period === key ? '#f59e0b' : theme.dim,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  })

  const cardStyle = {
    background: theme.card,
    borderRadius: '14px',
    border: '1px solid ' + theme.border,
    padding: '14px 16px',
  }

  return (
    <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: theme.text,
            fontSize: '22px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '8px',
          }}
        >
          {'\u2190'}
        </button>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{t('overview.inlineTripsTitle')}</div>
      </div>

      {/* Vehicle filter — company only */}
      {!isOwner && vehicles.length > 0 && (
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid ' + theme.border,
            background: theme.card,
            color: theme.text,
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            appearance: 'auto',
            marginBottom: '10px',
          }}
        >
          <option value="all">{'\ud83d\ude9b'} {t('expenses.allVehicles')}</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>
              {'\ud83d\ude9b'} {`${v.brand || ''} ${v.model || ''} ${v.plate_number || ''}`.trim() || v.id}
            </option>
          ))}
        </select>
      )}

      {/* Period filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button onClick={() => setPeriod('week')} style={periodBtnStyle('week')}>
          {t('trips.week')}
        </button>
        <button onClick={() => setPeriod('month')} style={periodBtnStyle('month')}>
          {t('common.month')}
        </button>
        <button onClick={() => setPeriod('custom')} style={periodBtnStyle('custom')}>
          {t('trips.periodFilter')}
        </button>
      </div>

      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: '8px',
              border: '1px solid ' + theme.border, background: theme.card, color: theme.text, fontSize: '13px',
            }}
          />
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: '8px',
              border: '1px solid ' + theme.border, background: theme.card, color: theme.text, fontSize: '13px',
            }}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : isOwner ? (
        /* Owner-operator: flat trip list */
        filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
            {t('trips.noTrips')}
          </div>
        ) : (
          filtered.map(tr => (
            <div key={tr.id} style={{ ...cardStyle, marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}>
                    {tr.origin || '?'} {'\u2192'} {tr.destination || '?'}
                  </div>
                  <div style={{ color: theme.dim, fontSize: '12px', marginTop: '2px' }}>
                    {fmtDate(tr.created_at)} {'\u00b7'} {formatNumber(tr.distance_km || 0)} {distLabel}
                    {(tr.deadhead_km || 0) > 0 && (
                      <span style={{ color: '#f59e0b', marginLeft: '6px' }}>
                        {'\u00b7 '}{t('trips.deadhead')}{': '}{formatNumber(tr.deadhead_km)}{' '}{distLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                  +{formatNumber(tr.income || 0)} {cs}
                </div>
              </div>
            </div>
          ))
        )
      ) : filter !== 'all' ? (
        /* Company: filtered by specific vehicle */
        filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: theme.dim, fontSize: 13 }}>
            {t('trips.noTripsVehicle')}
          </div>
        ) : (
          filtered.map(tr => (
            <div key={tr.id} style={{ ...cardStyle, marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}>
                    {tr.origin || '?'} {'\u2192'} {tr.destination || '?'}
                  </div>
                  <div style={{ color: theme.dim, fontSize: '12px', marginTop: '2px' }}>
                    {fmtDate(tr.created_at)} {'\u00b7'} {formatNumber(tr.distance_km || 0)} {distLabel}
                  </div>
                </div>
                <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                  +{formatNumber(tr.income || 0)} {cs}
                </div>
              </div>
            </div>
          ))
        )
      ) : vehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: theme.dim, fontSize: 13 }}>
          {t('trips.noVehicles')}
        </div>
      ) : (
        /* Company: grouped by vehicle */
        vehicles.map(v => {
          const vTrips = tripsByVeh[v.id] || []
          const isExp = expanded === v.id
          const vLabel = ((v.brand || '') + ' ' + (v.model || '')).trim()
          return (
            <div key={v.id} style={{ ...cardStyle, marginBottom: '8px' }}>
              <div
                onClick={() => setExpanded(isExp ? null : v.id)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: 700 }}>
                    {'\ud83d\udc64 '}{v.driver_name || '\u2014'}
                  </div>
                  <div style={{ color: theme.dim, fontSize: '12px', marginTop: '2px' }}>
                    {v.plate_number || ''}{vLabel ? ' \u00b7 ' + vLabel : ''} {'\u00b7'} {vTrips.length} {t('overview.fleetTrips').toLowerCase()}
                  </div>
                </div>
                <span style={{ color: '#f59e0b', fontSize: '16px', transition: 'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)' }}>{'\u25bc'}</span>
              </div>
              {isExp && (
                vTrips.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '8px 0', color: theme.dim, fontSize: 12 }}>
                    {t('trips.noTripsVehicle')}
                  </div>
                ) : (
                  vTrips.map(tr => (
                    <div key={tr.id} style={{ padding: '6px 0 6px 16px', borderTop: '1px solid ' + theme.border, marginTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: theme.text, fontSize: '13px', fontWeight: 600 }}>
                            {tr.origin || '?'} {'\u2192'} {tr.destination || '?'}
                          </div>
                          <div style={{ color: theme.dim, fontSize: '11px', marginTop: '2px' }}>
                            {fmtDate(tr.created_at)} {'\u00b7'} {formatNumber(tr.distance_km || 0)} {distLabel}
                          </div>
                        </div>
                        <div style={{ color: '#22c55e', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                          +{formatNumber(tr.income || 0)} {cs}
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
