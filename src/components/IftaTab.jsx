// IFTA Quarterly Report Tab
// Roles: owner_operator (own data), company (all drivers), driver (notice only), job_seeker (hidden)
// Test role switching: UPDATE profiles SET role='company' WHERE id='<your-id>';

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { buildQuarterlyReport } from '../utils/iftaReport'
import { generateIftaPdf } from '../utils/iftaPdfExport'

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
  const options = []
  // Current year quarters
  for (let q = 1; q <= 4; q++) {
    options.push({ quarter: q, year: curYear, label: `Q${q} ${curYear}` })
  }
  // Previous year Q4
  options.push({ quarter: 4, year: curYear - 1, label: `Q4 ${curYear - 1}` })
  return options
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
          {t('ifta.reporting')}
        </div>
        <div>
          {t('ifta.driverNotice')}
        </div>
      </div>
    )
  }

  // --- Full mode: owner_operator or company ---
  return <IftaFullReport userId={userId} role={role} userVehicles={userVehicles} />
}

function IftaFullReport({ userId, role, userVehicles }) {
  const { theme } = useTheme()
  const { t, language } = useLanguage()

  const now = new Date()
  const [quarter, setQuarter] = useState(getCurrentQuarter())
  const [year, setYear] = useState(getCurrentYear())
  const [vehicleId, setVehicleId] = useState(
    role === 'company' ? 'all' : (userVehicles?.[0]?.id || 'all')
  )
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState(null) // { text, type: 'success' | 'error' }
  const [existingReport, setExistingReport] = useState(null) // saved report for current q/y/vehicle
  const [profileName, setProfileName] = useState('')

  // Fetch profile name for PDF header (once)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('full_name, name, company_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfileName(data.company_name || data.full_name || data.name || '')
      })
  }, [userId])

  // Saved reports list
  const [showSavedReports, setShowSavedReports] = useState(false)
  const [allSavedReports, setAllSavedReports] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(false)

  const quarterOptions = useMemo(() => buildQuarterOptions(), [])

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

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
        if (!cancelled) setError(err.message || t('ifta.errorLoad'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, vehicleId, quarter, year])

  // Check for existing saved report when quarter/year/vehicleId changes
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const vId = vehicleId === 'all' ? null : vehicleId
    let query = supabase
      .from('ifta_reports')
      .select('id, status, created_at, submitted_at')
      .eq('user_id', userId)
      .eq('quarter', quarter)
      .eq('year', year)

    if (vId) {
      query = query.eq('vehicle_id', vId)
    } else {
      query = query.is('vehicle_id', null)
    }

    query.maybeSingle().then(({ data }) => {
      if (!cancelled) setExistingReport(data || null)
    })

    return () => { cancelled = true }
  }, [userId, quarter, year, vehicleId])

  // Load all saved reports (when expanded)
  const loadAllSavedReports = useCallback(async () => {
    setLoadingSaved(true)
    const { data } = await supabase
      .from('ifta_reports')
      .select('id, vehicle_id, quarter, year, status, total_miles, total_tax_due, created_at, submitted_at')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
    setAllSavedReports(data || [])
    setLoadingSaved(false)
  }, [userId])

  useEffect(() => {
    if (showSavedReports) loadAllSavedReports()
  }, [showSavedReports, loadAllSavedReports])

  const isPreliminary = isCurrentOrFutureQuarter(quarter, year)
  const filingDeadline = getFilingDeadline(quarter, year)
  const showDeadline = !isPreliminary && filingDeadline > now && now.getDate() <= 30

  // Save handler
  const handleSave = async () => {
    if (!report || saving) return

    // If existing report, confirm overwrite
    if (existingReport) {
      const ok = window.confirm(t('ifta.overwriteConfirm'))
      if (!ok) return
    }

    setSaving(true)
    const isDraft = isPreliminary
    const status = isDraft ? 'draft' : 'filed'
    const vId = vehicleId === 'all' ? null : vehicleId

    const row = {
      user_id: userId,
      vehicle_id: vId,
      quarter,
      year,
      status,
      total_miles: report.totals.total_miles,
      total_gallons: report.totals.total_gallons,
      total_tax_due: report.totals.net_balance,
      report_data: report,
      submitted_at: isDraft ? null : new Date().toISOString(),
    }

    const { error: saveErr } = await supabase
      .from('ifta_reports')
      .upsert(row, { onConflict: 'user_id,vehicle_id,quarter,year' })

    setSaving(false)

    if (saveErr) {
      setToast({ text: saveErr.message, type: 'error' })
    } else {
      setToast({ text: isDraft ? t('ifta.draftSaved') : t('ifta.filingSaved'), type: 'success' })
      // Refresh existing report badge
      const rq = supabase
        .from('ifta_reports')
        .select('id, status, created_at, submitted_at')
        .eq('user_id', userId)
        .eq('quarter', quarter)
        .eq('year', year)
      const query = vId ? rq.eq('vehicle_id', vId) : rq.is('vehicle_id', null)
      const { data } = await query.maybeSingle()
      setExistingReport(data || null)
      // Refresh saved reports list if open
      if (showSavedReports) loadAllSavedReports()
    }
  }

  // PDF export handler
  const handleExportPdf = async () => {
    if (!report || exporting) return
    setExporting(true)
    try {
      const vLabel = vehicleId === 'all' ? null : getVehicleLabel(vehicleId)
      await generateIftaPdf({
        report,
        quarter,
        year,
        vehicleName: vLabel,
        companyName: profileName,
        language,
      })
      setToast({ text: 'PDF \u2713', type: 'success' })
    } catch (err) {
      setToast({ text: err.message || 'PDF export failed', type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  // Navigate to a saved report
  const navigateToSaved = (r) => {
    setQuarter(r.quarter)
    setYear(r.year)
    if (r.vehicle_id) {
      setVehicleId(r.vehicle_id)
    } else {
      setVehicleId('all')
    }
    setShowSavedReports(false)
  }

  // Find vehicle label
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>

      {/* Toast notification */}
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
            {isPreliminary ? '\u26A0 ' + t('ifta.preliminaryRates') : '\u2713 ' + t('ifta.finalRates')}
          </span>

          {/* Saved report status badge */}
          {existingReport && (
            <span style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              background: existingReport.status === 'filed' ? '#22c55e18' : theme.card2 || theme.bg,
              color: existingReport.status === 'filed' ? '#22c55e' : theme.dim,
              border: '1px solid ' + (existingReport.status === 'filed' ? '#22c55e33' : theme.border),
            }}>
              {existingReport.status === 'filed'
                ? '\u2713 ' + t('ifta.statusFiled') + ' ' + formatShortDate(existingReport.submitted_at)
                : t('ifta.statusDraft') + ' ' + formatShortDate(existingReport.created_at)
              }
            </span>
          )}

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

        {/* Filing deadline hint */}
        {showDeadline && (
          <div style={{ marginTop: '8px', color: theme.dim, fontSize: '12px' }}>
            {t('ifta.filingDeadline')}: {filingDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{t('ifta.loading')}</div>
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
            {t('ifta.emptyState')}
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
                  {[t('ifta.colState'), t('ifta.colMiles'), t('ifta.colGalPurch'), t('ifta.colGalCons'), t('ifta.colTaxRate'), t('ifta.colTaxDue'), t('ifta.colSurcharge'), t('ifta.colNetDue')].map((h, i) => (
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
                        <span title={t('ifta.noRateTooltip')}>{'\u2014'}</span>
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
              { label: t('ifta.totalMiles'), value: report.totals.total_miles.toFixed(1), color: theme.text },
              { label: t('ifta.totalGallons'), value: report.totals.total_gallons.toFixed(1), color: theme.text },
              { label: t('ifta.averageMpg'), value: report.totals.average_mpg !== null ? report.totals.average_mpg.toFixed(1) : '\u2014', color: '#3b82f6' },
              {
                label: t('ifta.netBalance'),
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

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={saving}
              onClick={handleSave}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                border: 'none',
                background: saving ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: saving ? theme.dim : '#fff',
                fontSize: '13px', fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? t('common.saving')
                : isPreliminary
                  ? '\uD83D\uDCBE ' + t('ifta.saveDraft')
                  : '\uD83D\uDCBE ' + t('ifta.saveFiling')
              }
            </button>
            <button
              disabled={exporting}
              onClick={handleExportPdf}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                border: 'none',
                background: exporting ? theme.border : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: exporting ? theme.dim : '#fff',
                fontSize: '13px', fontWeight: 600,
                cursor: exporting ? 'default' : 'pointer',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting
                ? '\u23F3 ' + t('common.loading')
                : '\uD83D\uDCC4 ' + t('ifta.exportPdf')
              }
            </button>
          </div>
        </>
      )}

      {/* Saved reports toggle */}
      <div
        onClick={() => setShowSavedReports(!showSavedReports)}
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
        {showSavedReports ? '\u25B2' : '\u25BC'} {t('ifta.savedReports')}
      </div>

      {/* Saved reports list */}
      {showSavedReports && (
        <div style={card}>
          {loadingSaved ? (
            <div style={{ textAlign: 'center', color: theme.dim, fontSize: '13px', padding: '16px' }}>
              {t('common.loading')}
            </div>
          ) : allSavedReports.length === 0 ? (
            <div style={{ textAlign: 'center', color: theme.dim, fontSize: '13px', padding: '16px' }}>
              {t('ifta.noSavedReports')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {allSavedReports.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigateToSaved(r)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: theme.bg,
                    border: '1px solid ' + theme.border,
                    cursor: 'pointer',
                    fontSize: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 700, color: theme.text, minWidth: '60px' }}>
                    Q{r.quarter} {r.year}
                  </span>
                  <span style={{ color: theme.dim, flex: 1, minWidth: '80px' }}>
                    {getVehicleLabel(r.vehicle_id)}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: r.status === 'filed' ? '#22c55e22' : theme.card,
                    color: r.status === 'filed' ? '#22c55e' : theme.dim,
                    border: '1px solid ' + (r.status === 'filed' ? '#22c55e44' : theme.border),
                  }}>
                    {r.status === 'filed' ? t('ifta.statusFiled') : t('ifta.statusDraft')}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: theme.text, minWidth: '60px', textAlign: 'right' }}>
                    {r.total_miles != null ? r.total_miles.toFixed(0) + ' mi' : '\u2014'}
                  </span>
                  <span style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    minWidth: '70px',
                    textAlign: 'right',
                    color: r.total_tax_due != null && r.total_tax_due <= 0 ? '#22c55e' : '#ef4444',
                  }}>
                    {r.total_tax_due != null
                      ? (r.total_tax_due <= 0 ? '-' : '') + '$' + Math.abs(r.total_tax_due).toFixed(2)
                      : '\u2014'
                    }
                  </span>
                  <span style={{ color: theme.dim, fontSize: '11px' }}>
                    {formatShortDate(r.submitted_at || r.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
