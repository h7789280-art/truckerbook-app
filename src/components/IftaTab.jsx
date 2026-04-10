// IFTA Quarterly Report Tab
// Roles: owner_operator (own data), company (all drivers), driver (notice only), job_seeker (hidden)
// Test role switching: UPDATE profiles SET role='company' WHERE id='<your-id>';

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { buildQuarterlyReport } from '../utils/iftaReport'

function getCurrentQuarter() {
  return Math.ceil((new Date().getMonth() + 1) / 3)
}

function getCurrentYear() {
  return new Date().getFullYear()
}

/**
 * IFTA filing deadlines: last day of the month following quarter end.
 * Q1 (Jan-Mar) -> Apr 30, Q2 (Apr-Jun) -> Jul 31, Q3 (Jul-Sep) -> Oct 31, Q4 (Oct-Dec) -> Jan 31 next year
 */
function getFilingDeadline(quarter, year) {
  if (quarter === 4) {
    return new Date(year + 1, 0, 31) // Jan 31 next year
  }
  const deadlineMonth = quarter * 3 // 0-based: Q1->3(Apr), Q2->6(Jul), Q3->9(Oct)
  const lastDay = new Date(year, deadlineMonth + 1, 0).getDate()
  return new Date(year, deadlineMonth, lastDay)
}

function isCurrentOrFutureQuarter(quarter, year) {
  const now = new Date()
  const curYear = now.getFullYear()
  const curQ = getCurrentQuarter()
  return year > curYear || (year === curYear && quarter >= curQ)
}

function buildQuarterOptions() {
  const now = new Date()
  const curYear = now.getFullYear()
  const curQ = getCurrentQuarter()
  const options = []
  // Current year quarters
  for (let q = 1; q <= 4; q++) {
    options.push({ quarter: q, year: curYear, label: `Q${q} ${curYear}` })
  }
  // Previous year Q4
  options.push({ quarter: 4, year: curYear - 1, label: `Q4 ${curYear - 1}` })
  return options
}

export default function IftaTab({ userId, role, userVehicles }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  // --- Role gates ---
  if (role === 'job_seeker') return null

  if (role === 'driver') {
    return (
      <div style={{
        background: theme.card,
        border: '1px solid ' + theme.border,
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        color: theme.dim,
        fontSize: '14px',
        lineHeight: '1.6',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>{'\uD83D\uDCCB'}</div>
        <div style={{ color: theme.text, fontWeight: 600, marginBottom: '8px' }}>
          IFTA Reporting
        </div>
        <div>
          IFTA \u043e\u0442\u0447\u0451\u0442\u043d\u043e\u0441\u0442\u044c \u0432\u0435\u0434\u0451\u0442 \u0432\u0430\u0448 \u0440\u0430\u0431\u043e\u0442\u043e\u0434\u0430\u0442\u0435\u043b\u044c.
          {' '}\u0412\u0441\u0435 \u0432\u0430\u0448\u0438 \u0437\u0430\u043f\u0440\u0430\u0432\u043a\u0438 \u0438 \u0440\u0435\u0439\u0441\u044b \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u043e\u043f\u0430\u0434\u0430\u044e\u0442 \u0432 \u0435\u0433\u043e \u043a\u0432\u0430\u0440\u0442\u0430\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0447\u0451\u0442.
          {' '}\u0415\u0441\u043b\u0438 \u0443 \u0432\u0430\u0441 \u0432\u043e\u043f\u0440\u043e\u0441\u044b \u2014 \u043e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u043a \u0434\u0438\u0441\u043f\u0435\u0442\u0447\u0435\u0440\u0443.
        </div>
      </div>
    )
  }

  // --- Full mode: owner_operator or company ---
  return <IftaFullReport userId={userId} role={role} userVehicles={userVehicles} />
}

function IftaFullReport({ userId, role, userVehicles }) {
  const { theme } = useTheme()

  const now = new Date()
  const [quarter, setQuarter] = useState(getCurrentQuarter())
  const [year, setYear] = useState(getCurrentYear())
  const [vehicleId, setVehicleId] = useState(
    role === 'company' ? 'all' : (userVehicles?.[0]?.id || 'all')
  )
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const quarterOptions = useMemo(() => buildQuarterOptions(), [])

  // Load report when quarter/year/vehicleId changes
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    buildQuarterlyReport({
      supabase,
      userId,
      role,
      vehicleId: vehicleId === 'all' ? undefined : vehicleId,
      quarter,
      year,
    })
      .then(data => {
        if (!cancelled) setReport(data)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load IFTA data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, vehicleId, quarter, year])

  const isPreliminary = isCurrentOrFutureQuarter(quarter, year)
  const filingDeadline = getFilingDeadline(quarter, year)
  const showDeadline = !isPreliminary && filingDeadline > now && now.getDate() <= 30

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

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

          {/* Badge: Preliminary vs Final */}
          <span style={{
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            background: isPreliminary ? '#f59e0b22' : '#22c55e22',
            color: isPreliminary ? '#f59e0b' : '#22c55e',
            border: '1px solid ' + (isPreliminary ? '#f59e0b44' : '#22c55e44'),
          }}>
            {isPreliminary ? '\u26A0 Preliminary rates' : '\u2713 Final rates'}
          </span>

          {/* Vehicle selector for company */}
          {role === 'company' && userVehicles && userVehicles.length > 0 && (
            <select
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All vehicles</option>
              {userVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.brand ? `${v.brand} ${v.model || ''}` : v.plate_number || v.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Filing deadline hint */}
        {showDeadline && (
          <div style={{ marginTop: '8px', color: theme.dim, fontSize: '12px' }}>
            Filing deadline: {filingDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>Loading IFTA data...</div>
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
      {!loading && !error && report && report.states.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCC1'}</div>
          <div style={{ color: theme.dim, fontSize: '13px', lineHeight: '1.6' }}>
            {'\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0437\u0430 \u044d\u0442\u043e\u0442 \u043a\u0432\u0430\u0440\u0442\u0430\u043b.'}
            {' '}{'\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u0440\u0435\u0439\u0441 \u0441 GPS-\u0442\u0440\u0435\u043a\u0438\u043d\u0433\u043e\u043c, \u0447\u0442\u043e\u0431\u044b \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043b\u0430 \u043c\u0438\u043b\u0438 \u043f\u043e \u0448\u0442\u0430\u0442\u0430\u043c.'}
          </div>
        </div>
      )}

      {/* Data table */}
      {!loading && !error && report && report.states.length > 0 && (
        <>
          <div style={{ ...card, padding: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid ' + theme.border }}>
                  {['State', 'Miles', 'Gal Purch', 'Gal Cons', 'Tax Rate', 'Tax Due', 'Surcharge', 'Net Due'].map((h, i) => (
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
                {report.states.map(row => (
                  <tr key={row.state_code} style={{ borderBottom: '1px solid ' + theme.border }}>
                    <td style={{ padding: '10px 4px', color: theme.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {row.state_code}
                      <span style={{ color: theme.dim, fontWeight: 400, fontSize: '11px', marginLeft: '4px' }}>
                        {row.state_name !== row.state_code ? row.state_name : ''}
                      </span>
                    </td>
                    <td style={cellMono(theme)}>{row.miles.toFixed(1)}</td>
                    <td style={cellMono(theme)}>{row.gallons_purchased.toFixed(1)}</td>
                    <td style={cellMono(theme)}>{row.gallons_consumed.toFixed(1)}</td>
                    <td style={cellMono(theme)}>
                      {row.tax_rate !== null ? '$' + row.tax_rate.toFixed(4) : (
                        <span title="No IFTA rate for this jurisdiction">{'\u2014'}</span>
                      )}
                    </td>
                    <td style={cellMono(theme)}>
                      {row.tax_due !== null ? '$' + row.tax_due.toFixed(2) : '\u2014'}
                    </td>
                    <td style={cellMono(theme)}>
                      {row.surcharge_due !== null ? '$' + row.surcharge_due.toFixed(2) : '\u2014'}
                    </td>
                    <td style={{
                      ...cellMono(theme),
                      fontWeight: 700,
                      color: row.net_due === null ? theme.dim
                        : row.net_due < 0 ? '#22c55e'
                        : theme.text,
                    }}>
                      {row.net_due !== null
                        ? (row.net_due < 0 ? '-' : '') + '$' + Math.abs(row.net_due).toFixed(2)
                        : '\u2014'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Total Miles', value: report.totals.total_miles.toFixed(1), color: theme.text },
              { label: 'Total Gallons', value: report.totals.total_gallons.toFixed(1), color: theme.text },
              { label: 'Average MPG', value: report.totals.average_mpg !== null ? report.totals.average_mpg.toFixed(1) : '\u2014', color: '#3b82f6' },
              {
                label: 'Net Balance',
                value: (report.totals.net_balance <= 0 ? '-' : '') + '$' + Math.abs(report.totals.net_balance).toFixed(2),
                color: report.totals.net_balance <= 0 ? '#22c55e' : '#ef4444',
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

          {/* Action buttons (disabled placeholders) */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                border: '1px solid ' + theme.border, background: theme.card,
                color: theme.dim, fontSize: '13px', fontWeight: 600,
                cursor: 'default', opacity: 0.5,
              }}
            >
              {'\uD83D\uDCBE Save Report'}
            </button>
            <button
              disabled
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                border: '1px solid ' + theme.border, background: theme.card,
                color: theme.dim, fontSize: '13px', fontWeight: 600,
                cursor: 'default', opacity: 0.5,
              }}
            >
              {'\uD83D\uDCC4 Export PDF'}
            </button>
          </div>
          <div style={{ textAlign: 'center', color: theme.dim, fontSize: '11px' }}>
            Save and export coming in next update
          </div>
        </>
      )}
    </div>
  )
}

function cellMono(theme) {
  return {
    padding: '10px 4px',
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: theme.text,
    whiteSpace: 'nowrap',
  }
}
