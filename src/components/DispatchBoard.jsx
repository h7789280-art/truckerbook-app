import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getUnits } from '../lib/i18n'
import { fetchDispatchBoard } from '../lib/api'

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

export default function DispatchBoard({ userId }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const unitSys = getUnits()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    fetchDispatchBoard(userId).then(result => {
      if (!cancelled) setData(result)
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: theme.dim, padding: '20px' }}>
        {t('common.loading')}
      </div>
    )
  }

  if (!data || data.vehicles.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: theme.dim, padding: '20px' }}>
        {t('overview.noData')}
      </div>
    )
  }

  const onDutyCount = data.vehicles.filter(v => v.isOnDuty).length
  const availableCount = data.vehicles.length - onDutyCount
  const distLabel = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '14px',
    padding: '14px',
  }

  const sorted = [...data.vehicles].sort((a, b) => {
    if (a.isOnDuty && !b.isOnDuty) return -1
    if (!a.isOnDuty && b.isOnDuty) return 1
    const nameA = (a.driver_name || '').toLowerCase()
    const nameB = (b.driver_name || '').toLowerCase()
    return nameA.localeCompare(nameB)
  })

  return (
    <>
      {/* Summary row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '12px',
      }}>
        {[
          { label: t('dispatch.totalVehicles'), value: data.vehicles.length, color: '#3b82f6', icon: '\ud83d\ude9b' },
          { label: t('dispatch.onDuty'), value: onDutyCount, color: '#22c55e', icon: '\ud83d\udfe2' },
          { label: t('dispatch.available'), value: availableCount, color: '#64748b', icon: '\u26aa' },
        ].map((item, i) => (
          <div key={i} style={{
            ...cardStyle,
            textAlign: 'center',
            padding: '12px 8px',
          }}>
            <div style={{ fontSize: '18px', marginBottom: '2px' }}>{item.icon}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Desktop table (hidden on small screens via media query workaround) */}
      <div className="dispatch-table-wrap" style={{ overflowX: 'auto', marginBottom: '12px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          color: theme.text,
        }}>
          <thead>
            <tr style={{ borderBottom: '2px solid ' + theme.border }}>
              {[
                t('dispatch.vehicle'),
                t('dispatch.plate'),
                t('dispatch.driver'),
                t('dispatch.status'),
                t('dispatch.mileage'),
                t('dispatch.lastActivity'),
              ].map((h, i) => (
                <th key={i} style={{
                  padding: '8px 10px',
                  textAlign: 'left',
                  color: theme.dim,
                  fontWeight: 600,
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid ' + theme.border }}>
                <td style={{ padding: '10px' }}>
                  {(v.brand || '') + ' ' + (v.model || '')}
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                  {v.plate_number || '\u2014'}
                </td>
                <td style={{ padding: '10px' }}>
                  {v.driver_name || <span style={{ color: theme.dim }}>{t('overview.fleetNoDriver')}</span>}
                </td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: v.isOnDuty ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                    color: v.isOnDuty ? '#22c55e' : '#64748b',
                  }}>
                    {v.isOnDuty ? t('dispatch.onDutyBadge') : t('dispatch.availableBadge')}
                  </span>
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                  {formatNumber(v.odometer || 0)} {distLabel}
                </td>
                <td style={{ padding: '10px', fontSize: '12px', color: theme.dim }}>
                  {v.lastActivity || '\u2014'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (visible only on small screens) */}
      <div className="dispatch-cards-wrap">
        {sorted.map(v => (
          <div key={v.id} style={{
            ...cardStyle,
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                {(v.brand || '') + ' ' + (v.model || '')}
              </div>
              <div style={{ fontSize: '12px', color: theme.dim, fontFamily: 'monospace', marginBottom: '4px' }}>
                {v.plate_number || '\u2014'}
              </div>
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                {v.driver_name || <span style={{ color: theme.dim }}>{t('overview.fleetNoDriver')}</span>}
              </div>
              <div style={{ fontSize: '12px', color: theme.dim }}>
                {formatNumber(v.odometer || 0)} {distLabel}
                {v.lastActivity ? (' \u00b7 ' + v.lastActivity) : ''}
              </div>
            </div>
            <span style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: v.isOnDuty ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              color: v.isOnDuty ? '#22c55e' : '#64748b',
            }}>
              {v.isOnDuty ? t('dispatch.onDutyBadge') : t('dispatch.availableBadge')}
            </span>
          </div>
        ))}
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 640px) {
          .dispatch-table-wrap { display: none !important; }
          .dispatch-cards-wrap { display: block !important; }
        }
        @media (min-width: 641px) {
          .dispatch-table-wrap { display: block !important; }
          .dispatch-cards-wrap { display: none !important; }
        }
      `}</style>
    </>
  )
}
