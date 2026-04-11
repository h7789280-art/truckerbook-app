// Per Diem Tracker Tab
// Roles: owner_operator (own data), company (all drivers), driver/job_seeker (hidden at BookkeepingHome level)

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { calculatePerDiem } from '../utils/perDiemCalculator'

function getCurrentQuarter() {
  return Math.ceil((new Date().getMonth() + 1) / 3)
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function buildQuarterOptions() {
  const curYear = new Date().getFullYear()
  const options = []
  for (let q = 1; q <= 4; q++) {
    options.push({ quarter: q, year: curYear, label: `Q${q} ${curYear}` })
  }
  options.push({ quarter: 4, year: curYear - 1, label: `Q4 ${curYear - 1}` })
  return options
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PerDiemTab({ userId, role, userVehicles, employmentType }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [quarter, setQuarter] = useState(getCurrentQuarter())
  const [year, setYear] = useState(getCurrentYear())
  const [vehicleId, setVehicleId] = useState(
    role === 'company' ? 'all' : (userVehicles?.[0]?.id || 'all')
  )
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [dailyRate, setDailyRate] = useState(69.00)
  const [partialPercent, setPartialPercent] = useState(75)
  const [savingSettings, setSavingSettings] = useState(false)
  const [toast, setToast] = useState(null)

  const quarterOptions = useMemo(() => buildQuarterOptions(), [])

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // Load settings once
  useEffect(() => {
    if (!userId) return
    supabase
      .from('per_diem_settings')
      .select('daily_rate, partial_day_percent')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data: s }) => {
        if (s) {
          if (s.daily_rate != null) setDailyRate(s.daily_rate)
          if (s.partial_day_percent != null) setPartialPercent(s.partial_day_percent)
        }
      })
  }, [userId])

  // Load data when quarter/year/vehicleId changes
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    calculatePerDiem({
      supabase,
      userId,
      role,
      vehicleId: vehicleId === 'all' ? undefined : vehicleId,
      quarter,
      year,
    })
      .then(result => {
        if (!cancelled) setData(result)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load per diem data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, vehicleId, quarter, year])

  // Save settings handler
  const handleSaveSettings = async () => {
    if (savingSettings) return
    setSavingSettings(true)

    const { error: saveErr } = await supabase
      .from('per_diem_settings')
      .upsert({
        user_id: userId,
        daily_rate: Number(dailyRate) || 69.00,
        partial_day_percent: Number(partialPercent) || 75,
      }, { onConflict: 'user_id' })

    setSavingSettings(false)

    if (saveErr) {
      setToast({ text: saveErr.message, type: 'error' })
    } else {
      setToast({ text: t('perDiem.settingsSaved'), type: 'success' })
    }
  }

  const getVehicleLabel = (vId) => {
    if (!vId) return t('ifta.allVehicles')
    const v = userVehicles?.find(x => x.id === vId)
    if (!v) return vId.slice(0, 8)
    return v.brand ? `${v.brand} ${v.model || ''}`.trim() : (v.plate_number || vId.slice(0, 8))
  }

  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const selectStyle = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '14px',
    fontWeight: 600,
  }

  const cellMono = {
    padding: '10px 4px',
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: theme.text,
    whiteSpace: 'nowrap',
  }

  // W-2 driver: show stub instead of data
  if (role === 'driver' && employmentType === 'w2') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          background: theme.card, border: '1px solid ' + theme.border,
          borderRadius: '12px', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDCBC'}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px' }}>
            {t('perDiem.w2Notice')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>

      {/* Employment type badge for drivers */}
      {role === 'driver' && employmentType === '1099' && (
        <div style={{
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '13px', color: '#22c55e', fontWeight: 600,
        }}>
          {'\u2705 ' + t('perDiem.contractor1099Notice')}
        </div>
      )}
      {role === 'driver' && !employmentType && (
        <div style={{
          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '13px', color: '#f59e0b', fontWeight: 600,
        }}>
          {'\u26A0\uFE0F ' + t('perDiem.unknownStatus')}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#fff',
          background: toast.type === 'success' ? '#22c55e' : '#ef4444',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'success' ? '\u2713 ' : '\u2717 '}{toast.text}
        </div>
      )}

      {/* Controls */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={`${quarter}-${year}`}
            onChange={e => {
              const [q, y] = e.target.value.split('-').map(Number)
              setQuarter(q)
              setYear(y)
            }}
            style={selectStyle}
          >
            {quarterOptions.map(o => (
              <option key={o.label} value={`${o.quarter}-${o.year}`}>{o.label}</option>
            ))}
          </select>

          {/* Vehicle selector for company */}
          {role === 'company' && userVehicles && userVehicles.length > 0 && (
            <select
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value)}
              style={selectStyle}
            >
              <option value="all">{t('ifta.allVehicles')}</option>
              {userVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.brand ? `${v.brand} ${v.model || ''}` : v.plate_number || v.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{t('common.loading')}</div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{
          background: '#ef444422',
          border: '1px solid #ef444466',
          borderRadius: '12px',
          padding: '16px',
          color: '#ef4444',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.trips.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCC5'}</div>
          <div style={{ color: theme.dim, fontSize: '13px', lineHeight: '1.6' }}>
            {t('perDiem.emptyState')}
          </div>
        </div>
      )}

      {/* Trips table + totals */}
      {!loading && !error && data && data.trips.length > 0 && (
        <>
          <div style={{ ...card, padding: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid ' + theme.border }}>
                  {[
                    t('perDiem.colRoute'),
                    t('perDiem.colDateStart'),
                    t('perDiem.colDateEnd'),
                    t('perDiem.fullDays'),
                    t('perDiem.partialDays'),
                    t('perDiem.colAmount'),
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '8px 4px',
                      textAlign: i === 0 ? 'left' : 'right',
                      color: theme.dim,
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.trips.map(trip => (
                  <tr key={trip.trip_id} style={{ borderBottom: '1px solid ' + theme.border }}>
                    <td style={{ padding: '10px 4px', color: theme.text, fontWeight: 600, fontSize: '12px' }}>
                      {trip.origin && trip.destination
                        ? `${trip.origin} \u2192 ${trip.destination}`
                        : trip.origin || trip.destination || '\u2014'
                      }
                    </td>
                    <td style={cellMono}>{formatShortDate(trip.date_start)}</td>
                    <td style={cellMono}>{formatShortDate(trip.date_end)}</td>
                    <td style={cellMono}>{trip.full_days}</td>
                    <td style={cellMono}>{trip.partial_days}</td>
                    <td style={{ ...cellMono, fontWeight: 700, color: '#22c55e' }}>
                      ${trip.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: t('perDiem.totalTrips'), value: String(data.totals.total_trips), color: theme.text },
              { label: t('perDiem.totalDays'), value: String(data.totals.total_days), color: theme.text },
              { label: t('perDiem.dailyRate'), value: '$' + data.totals.daily_rate.toFixed(2), color: '#3b82f6' },
              {
                label: t('perDiem.totalDeduction'),
                value: '$' + data.totals.total_amount.toFixed(2),
                color: '#22c55e',
                large: true,
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: theme.card,
                border: '1px solid ' + theme.border,
                borderRadius: '12px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{
                  color: theme.dim,
                  fontSize: '9px',
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>{item.label}</div>
                <div style={{
                  color: item.color,
                  fontSize: item.large ? '20px' : '16px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}>{item.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Settings toggle */}
      <div
        onClick={() => setShowSettings(!showSettings)}
        style={{
          textAlign: 'center',
          color: '#f59e0b',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '8px',
          userSelect: 'none',
        }}
      >
        {showSettings ? '\u25B2' : '\u25BC'} {t('perDiem.settings')}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Daily Rate */}
            <div>
              <label style={{ fontSize: '12px', color: theme.dim, display: 'block', marginBottom: '4px' }}>
                {t('perDiem.dailyRate')} ($)
              </label>
              <input
                type="number"
                value={dailyRate}
                onChange={e => setDailyRate(e.target.value)}
                step="0.01"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid ' + theme.border,
                  background: theme.bg,
                  color: theme.text,
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Partial Day Percent */}
            <div>
              <label style={{ fontSize: '12px', color: theme.dim, display: 'block', marginBottom: '4px' }}>
                {t('perDiem.partialDayPercent')} (%)
              </label>
              <input
                type="number"
                value={partialPercent}
                onChange={e => setPartialPercent(e.target.value)}
                step="1"
                min="0"
                max="100"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid ' + theme.border,
                  background: theme.bg,
                  color: theme.text,
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* IRS note */}
            <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.5' }}>
              {t('perDiem.irsNote')}
            </div>

            {/* Save button */}
            <button
              disabled={savingSettings}
              onClick={handleSaveSettings}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: savingSettings ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: savingSettings ? theme.dim : '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: savingSettings ? 'default' : 'pointer',
                opacity: savingSettings ? 0.7 : 1,
              }}
            >
              {savingSettings ? t('common.saving') : '\uD83D\uDCBE ' + t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
