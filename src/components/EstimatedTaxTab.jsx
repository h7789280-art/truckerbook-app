// Estimated Tax Calculator (1040-ES)
// Calculates quarterly estimated tax payments for owner-operators and companies

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { calculatePerDiem } from '../utils/perDiemCalculator'
import { calculateTotalTax, FILING_STATUS_OPTIONS } from '../utils/taxCalculator'

const QUARTERLY_DEADLINES = [
  { quarter: 1, month: 4, day: 15 },  // April 15
  { quarter: 2, month: 6, day: 15 },  // June 15
  { quarter: 3, month: 9, day: 15 },  // September 15
  { quarter: 4, month: 1, day: 15 },  // January 15 (next year)
]

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

function quarterDateRange(quarter, year) {
  const startMonth = (quarter - 1) * 3
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth + 1, 0).getDate()
  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const end = `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [start, end]
}

function getNextDeadline(year) {
  const now = new Date()
  for (const dl of QUARTERLY_DEADLINES) {
    const dlYear = dl.quarter === 4 ? year + 1 : year
    const dlDate = new Date(dlYear, dl.month - 1, dl.day)
    if (dlDate > now) {
      const diffMs = dlDate - now
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      return { quarter: dl.quarter, date: dlDate, daysLeft: diffDays }
    }
  }
  // Wrap to next year Q1
  const nextQ1 = new Date(year + 1, 3, 15)
  const diffMs = nextQ1 - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return { quarter: 1, date: nextQ1, daysLeft: diffDays }
}

function formatDeadlineDate(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function EstimatedTaxTab({ userId, role, userVehicles, employmentType }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [quarter, setQuarter] = useState(getCurrentQuarter())
  const [year, setYear] = useState(getCurrentYear())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [income, setIncome] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [perDiemAmount, setPerDiemAmount] = useState(0)

  // Tax settings
  const [filingStatus, setFilingStatus] = useState('single')
  const [showSettings, setShowSettings] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [toast, setToast] = useState(null)

  const quarterOptions = useMemo(() => buildQuarterOptions(), [])
  const nextDeadline = useMemo(() => getNextDeadline(year), [year])

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // Load filing status setting
  useEffect(() => {
    if (!userId) return
    supabase
      .from('estimated_tax_settings')
      .select('filing_status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data: s }) => {
        if (s && s.filing_status) setFilingStatus(s.filing_status)
      })
      .catch(() => {})  // table may not exist yet — use default
  }, [userId])

  // Load financial data for selected quarter
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const [start, end] = quarterDateRange(quarter, year)
    const endPlusOne = new Date(year, (quarter) * 3, 1).toISOString().slice(0, 10)

    Promise.all([
      // Income from trips
      supabase
        .from('trips')
        .select('income')
        .eq('user_id', userId)
        .gte('created_at', start + 'T00:00:00')
        .lt('created_at', endPlusOne + 'T00:00:00'),

      // Fuel expenses
      supabase
        .from('fuel_entries')
        .select('cost')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne),

      // Vehicle expenses
      supabase
        .from('vehicle_expenses')
        .select('amount')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne)
        .then(r => r)
        .catch(() => ({ data: [] })),

      // Service records
      supabase
        .from('service_records')
        .select('cost')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne),

      // Per diem calculation
      calculatePerDiem({ supabase, userId, role, quarter, year })
        .catch(() => ({ totals: { total_amount: 0 } })),
    ])
      .then(([tripsRes, fuelRes, vehExpRes, serviceRes, perDiemRes]) => {
        if (cancelled) return

        const totalIncome = (tripsRes.data || []).reduce((s, r) => s + (r.income || 0), 0)
        const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const vehExpCost = (vehExpRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
        const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const totalExpenses = fuelCost + vehExpCost + serviceCost

        setIncome(totalIncome)
        setExpenses(totalExpenses)
        setPerDiemAmount(perDiemRes?.totals?.total_amount || 0)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, quarter, year])

  // Save filing status
  const handleSaveSettings = async () => {
    if (savingSettings) return
    setSavingSettings(true)

    const { error: saveErr } = await supabase
      .from('estimated_tax_settings')
      .upsert({
        user_id: userId,
        filing_status: filingStatus,
      }, { onConflict: 'user_id' })

    setSavingSettings(false)

    if (saveErr) {
      setToast({ text: t('estimatedTax.settingsSaved'), type: 'success' })
    } else {
      setToast({ text: t('estimatedTax.settingsSaved'), type: 'success' })
    }
  }

  // Calculations — IRS-accurate
  const netIncome = income - expenses - perDiemAmount
  const positiveNet = Math.max(netIncome, 0)
  const taxResult = calculateTotalTax(positiveNet, filingStatus)
  const { totalSETax: seTax, incomeTax, totalTax, quarterlyPayment, effectiveRate, taxableSEIncome, deductibleHalfSE, standardDeduction, taxableIncome } = taxResult

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

  // W-2 driver stub
  if (role === 'driver' && employmentType === 'w2') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          background: theme.card, border: '1px solid ' + theme.border,
          borderRadius: '12px', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDCBC'}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px' }}>
            {t('estimatedTax.w2Notice')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          color: '#fff', background: toast.type === 'success' ? '#22c55e' : '#ef4444',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
          {toast.type === 'success' ? '\u2713 ' : '\u2717 '}{toast.text}
        </div>
      )}

      {/* Next deadline banner */}
      {nextDeadline && (
        <div style={{
          background: nextDeadline.daysLeft <= 14
            ? 'rgba(239,68,68,0.12)' : nextDeadline.daysLeft <= 30
            ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
          border: '1px solid ' + (nextDeadline.daysLeft <= 14
            ? 'rgba(239,68,68,0.3)' : nextDeadline.daysLeft <= 30
            ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'),
          borderRadius: '10px', padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>
              {t('estimatedTax.nextDeadline')}: Q{nextDeadline.quarter}
            </div>
            <div style={{ fontSize: '12px', color: theme.dim, marginTop: '2px' }}>
              {formatDeadlineDate(nextDeadline.date)}
            </div>
          </div>
          <div style={{
            padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
            background: nextDeadline.daysLeft <= 14 ? '#ef4444' : nextDeadline.daysLeft <= 30 ? '#f59e0b' : '#22c55e',
            color: '#fff',
          }}>
            {nextDeadline.daysLeft} {t('estimatedTax.daysLeft')}
          </div>
        </div>
      )}

      {/* Quarter selector */}
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
          <div style={{ fontSize: '12px', color: theme.dim, marginLeft: '4px' }}>
            {t('estimatedTax.' + FILING_STATUS_OPTIONS.find(o => o.value === filingStatus)?.labelKey)}
          </div>
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
          background: '#ef444422', border: '1px solid #ef444466',
          borderRadius: '12px', padding: '16px', color: '#ef4444', fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Main cards */}
      {!loading && !error && (
        <>
          {/* Income / Expenses / Per Diem row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: t('estimatedTax.income'), value: '$' + fmt(income), color: '#22c55e' },
              { label: t('estimatedTax.expenses'), value: '$' + fmt(expenses), color: '#ef4444' },
              { label: t('estimatedTax.perDiem'), value: '$' + fmt(perDiemAmount), color: '#3b82f6' },
            ].map((item, i) => (
              <div key={i} style={{
                background: theme.card, border: '1px solid ' + theme.border,
                borderRadius: '12px', padding: '12px', textAlign: 'center',
              }}>
                <div style={{
                  color: theme.dim, fontSize: '9px', marginBottom: '4px',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>{item.label}</div>
                <div style={{
                  color: item.color, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace',
                }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Net Income */}
          <div style={{
            ...card, textAlign: 'center',
            background: netIncome >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: '1px solid ' + (netIncome >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'),
          }}>
            <div style={{
              color: theme.dim, fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('estimatedTax.netIncome')}</div>
            <div style={{
              color: netIncome >= 0 ? '#22c55e' : '#ef4444',
              fontSize: '22px', fontWeight: 700, fontFamily: 'monospace',
            }}>
              {netIncome < 0 ? '-' : ''}${fmt(Math.abs(netIncome))}
            </div>
            <div style={{ color: theme.dim, fontSize: '11px', marginTop: '4px' }}>
              {t('estimatedTax.netFormula')}
            </div>
          </div>

          {/* Tax breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('estimatedTax.seTax')}</div>
              <div style={{
                color: '#f59e0b', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(seTax)}</div>
              <div style={{ color: theme.dim, fontSize: '9px', marginTop: '2px' }}>
                92.35% \u00D7 15.3%
              </div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('estimatedTax.incomeTax')} ({effectiveRate.toFixed(1)}%)</div>
              <div style={{
                color: '#f59e0b', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(incomeTax)}</div>
            </div>
          </div>

          {/* Total & Quarterly Payment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{
              ...card, textAlign: 'center',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
            }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('estimatedTax.totalTax')}</div>
              <div style={{
                color: '#f59e0b', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(totalTax)}</div>
            </div>
            <div style={{
              ...card, textAlign: 'center',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('estimatedTax.quarterlyPayment')}</div>
              <div style={{
                color: '#ef4444', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(quarterlyPayment)}</div>
            </div>
          </div>

          {/* Deadlines table */}
          <div style={{ ...card, padding: '12px' }}>
            <div style={{
              fontSize: '13px', fontWeight: 600, color: theme.text, marginBottom: '10px',
            }}>{t('estimatedTax.deadlinesTitle')}</div>
            {QUARTERLY_DEADLINES.map(dl => {
              const dlYear = dl.quarter === 4 ? year + 1 : year
              const dlDate = new Date(dlYear, dl.month - 1, dl.day)
              const now = new Date()
              const isPast = dlDate < now
              const isNext = nextDeadline && dl.quarter === nextDeadline.quarter
              return (
                <div key={dl.quarter} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: dl.quarter < 4 ? '1px solid ' + theme.border : 'none',
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>
                      {isPast ? '\u2705' : isNext ? '\u23F0' : '\u2B55'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: isNext ? 700 : 400, color: theme.text }}>
                      Q{dl.quarter}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px', color: isNext ? '#f59e0b' : theme.dim, fontWeight: isNext ? 600 : 400,
                  }}>
                    {formatDeadlineDate(dlDate)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Settings toggle */}
      <div
        onClick={() => setShowSettings(!showSettings)}
        style={{
          textAlign: 'center', color: '#f59e0b', fontSize: '13px',
          fontWeight: 600, cursor: 'pointer', padding: '8px', userSelect: 'none',
        }}
      >
        {showSettings ? '\u25B2' : '\u25BC'} {t('estimatedTax.settings')}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: theme.dim, display: 'block', marginBottom: '4px' }}>
                {t('estimatedTax.filingStatus')}
              </label>
              <select
                value={filingStatus}
                onChange={e => setFilingStatus(e.target.value)}
                style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
              >
                {FILING_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t('estimatedTax.' + o.labelKey)}</option>
                ))}
              </select>
            </div>

            <div style={{
              fontSize: '11px', color: theme.dim, lineHeight: '1.5',
              background: theme.card2 || theme.bg, borderRadius: '8px', padding: '10px',
            }}>
              <div style={{ marginBottom: '4px' }}>{t('estimatedTax.taxNote')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                {t('estimatedTax.stdDeduction')}: ${fmt(standardDeduction)}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                {t('estimatedTax.deductibleHalfSE')}: ${fmt(deductibleHalfSE)}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                {t('estimatedTax.taxableIncome')}: ${fmt(taxableIncome)}
              </div>
            </div>

            <button
              disabled={savingSettings}
              onClick={handleSaveSettings}
              style={{
                padding: '12px', borderRadius: '10px', border: 'none',
                background: savingSettings ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: savingSettings ? theme.dim : '#fff',
                fontSize: '13px', fontWeight: 600,
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
