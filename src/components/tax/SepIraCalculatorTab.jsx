// SEP-IRA Retirement Calculator — interactive slider + tax-savings preview
// + contribution history. Owner-operator only. Mirrors TaxSummaryTab data load
// to derive net profit and SE tax, then feeds sepIraCalculator for savings.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../../lib/theme'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { calculatePerDiem } from '../../utils/perDiemCalculator'
import {
  calculateSETax,
  FILING_STATUS_OPTIONS,
} from '../../utils/taxCalculator'
import {
  calculateMaxSepIraContribution,
  calculateTaxSavings,
  projectRetirementGrowth,
  SEP_IRA_CAPS,
  DEFAULT_SEP_IRA_RATE,
} from '../../utils/sepIraCalculator'
import {
  fetchSepIraContributions,
  addSepIraContribution,
  deleteSepIraContribution,
} from '../../lib/api'
import { getCurrentYearDeduction } from '../../lib/tax/depreciationCalculator'

const ORANGE = '#f59e0b'
const GREEN = '#10b981'
const RED = '#ef4444'
const GREY = '#64748b'

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmt2(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function yearDateRange(year) {
  return [`${year}-01-01`, `${year}-12-31`]
}

function buildYearOptions() {
  const cur = new Date().getFullYear()
  return [cur, cur - 1, cur - 2]
}

function interpolate(template, values) {
  if (!template) return ''
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    values[key] != null ? values[key] : `{${key}}`
  )
}

export default function SepIraCalculatorTab({ userId, role, profile, stateOfResidence }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Schedule C inputs
  const [income, setIncome] = useState(0)
  const [totalDeductions, setTotalDeductions] = useState(0)

  // Tax settings
  const [filingStatus, setFilingStatus] = useState('single')
  const [sessionState, setSessionState] = useState(stateOfResidence || 'TX')

  // Slider / modal
  const [sliderAmount, setSliderAmount] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    contribution_date: new Date().toISOString().slice(0, 10),
    broker_name: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Contributions history
  const [contributions, setContributions] = useState([])

  const yearOptions = useMemo(() => buildYearOptions(), [])

  useEffect(() => {
    if (stateOfResidence) setSessionState(stateOfResidence)
  }, [stateOfResidence])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // Load filing status from shared settings table
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
      .catch(() => {})
  }, [userId])

  // Load Schedule C pipeline (mirror TaxSummaryTab)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const [start] = yearDateRange(year)
    const endPlusOne = `${year + 1}-01-01`

    const perDiemPromises = [1, 2, 3, 4].map(q =>
      calculatePerDiem({ supabase, userId, role, quarter: q, year })
        .catch(() => ({ totals: { total_amount: 0 } }))
    )

    Promise.all([
      supabase
        .from('trips')
        .select('income')
        .eq('user_id', userId)
        .gte('created_at', start + 'T00:00:00')
        .lt('created_at', endPlusOne + 'T00:00:00'),
      supabase
        .from('fuel_entries')
        .select('cost')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne),
      supabase
        .from('vehicle_expenses')
        .select('amount')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne)
        .then(r => r)
        .catch(() => ({ data: [] })),
      supabase
        .from('service_records')
        .select('cost')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne),
      supabase
        .from('vehicle_depreciation')
        .select('purchase_price, purchase_date, depreciation_type, salvage_value, prior_depreciation, asset_class, strategy, section_179_amount, bonus_rate, business_use_pct')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r)
        .catch(() => ({ data: null })),
      ...perDiemPromises,
    ])
      .then(([tripsRes, fuelRes, vehExpRes, serviceRes, depRes, ...perDiemResults]) => {
        if (cancelled) return

        const totalIncome = (tripsRes.data || []).reduce((s, r) => s + (r.income || 0), 0)
        const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const vehExpCost = (vehExpRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
        const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const pdTotal = perDiemResults.reduce((s, r) => s + (r?.totals?.total_amount || 0), 0)

        // Shared helper: mirrors Schedule C / Estimated Tax / Tax Meter.
        // Handles legacy (depreciation_type) and strategy-based records (MACRS 3-year
        // class 00.26 tractors, bonus, §179). Single source of truth with Schedule C.
        const depreciation = getCurrentYearDeduction(depRes?.data, year)

        const totalDed = fuelCost + vehExpCost + serviceCost + pdTotal + depreciation

        setIncome(totalIncome)
        setTotalDeductions(totalDed)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, year])

  // Load contributions history
  const reloadContributions = useCallback(() => {
    if (!userId) return
    fetchSepIraContributions(userId, year)
      .then(rows => setContributions(rows))
      .catch(() => setContributions([]))
  }, [userId, year])

  useEffect(() => {
    reloadContributions()
  }, [reloadContributions])

  // Derived values
  const netProfit = Math.max(income - totalDeductions, 0)
  const seResult = useMemo(() => calculateSETax(netProfit, filingStatus), [netProfit, filingStatus])
  const seTax = seResult.totalSETax
  const deductibleHalfSE = seResult.deductibleHalfSE

  const maxContribution = useMemo(
    () => calculateMaxSepIraContribution(netProfit, seTax, year),
    [netProfit, seTax, year]
  )

  // Uncapped max (what the formula would return without the $70k cap)
  const uncappedMax = useMemo(() => {
    const adj = Math.max(netProfit - seTax / 2, 0)
    return Math.floor((adj * DEFAULT_SEP_IRA_RATE) / 100) * 100
  }, [netProfit, seTax])

  const totalContributed = useMemo(
    () => contributions.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [contributions]
  )

  // Clamp slider to [totalContributed, maxContribution]. Also used to initialize
  // the slider to the already-contributed amount on first load so the "savings"
  // calculation reflects actual history, not a hypothetical $0.
  useEffect(() => {
    setSliderAmount(prev => {
      const floor = Math.min(totalContributed, maxContribution)
      const ceil = maxContribution
      if (prev < floor) return floor
      if (prev > ceil) return ceil
      return prev
    })
  }, [totalContributed, maxContribution])

  const savings = useMemo(
    () => calculateTaxSavings({
      contributionAmount: sliderAmount,
      netProfit,
      seTax,
      deductibleHalfSE,
      filingStatus,
      state: sessionState,
    }),
    [sliderAmount, netProfit, seTax, deductibleHalfSE, filingStatus, sessionState]
  )

  const maxSavings = useMemo(
    () => calculateTaxSavings({
      contributionAmount: maxContribution,
      netProfit,
      seTax,
      deductibleHalfSE,
      filingStatus,
      state: sessionState,
    }),
    [maxContribution, netProfit, seTax, deductibleHalfSE, filingStatus, sessionState]
  )

  const retirementProjection = useMemo(
    () => projectRetirementGrowth(maxContribution, 20, 0.07),
    [maxContribution]
  )

  // ---------- Handlers ----------

  const handleAdd = async () => {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) {
      setToast({ type: 'error', text: t('sepIra.errAmountZero') })
      return
    }
    const projected = totalContributed + amt
    if (maxContribution > 0 && projected > maxContribution) {
      setToast({ type: 'error', text: t('sepIra.errExceedsMax') })
      return
    }
    setSaving(true)
    try {
      await addSepIraContribution(userId, {
        amount: amt,
        contribution_date: form.contribution_date,
        broker_name: form.broker_name || null,
        notes: form.notes || null,
        tax_year: year,
      })
      setShowAddModal(false)
      setForm({
        amount: '',
        contribution_date: new Date().toISOString().slice(0, 10),
        broker_name: '',
        notes: '',
      })
      setToast({ type: 'success', text: '\u2713' })
      reloadContributions()
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (typeof window !== 'undefined' && !window.confirm(t('sepIra.confirmDelete'))) return
    try {
      await deleteSepIraContribution(id)
      reloadContributions()
      setToast({ type: 'success', text: '\u2713' })
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Error' })
    }
  }

  // ---------- Styles ----------

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

  const sectionTitle = {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.dim,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  }

  const lineRow = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: '13px',
  }

  // ---------- Render ----------

  // Owner-operator only
  if (role !== 'owner_operator') {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>{'\uD83C\uDFE6'}</div>
        <div style={{ fontSize: '14px', color: theme.dim }}>
          {t('sepIra.subtitle')}
        </div>
      </div>
    )
  }

  const progressPct = maxContribution > 0
    ? Math.min((totalContributed / maxContribution) * 100, 100)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          color: '#fff', background: toast.type === 'success' ? GREEN : RED,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
          {toast.type === 'success' ? '\u2713 ' : '\u2717 '}{toast.text}
        </div>
      )}

      {/* Title */}
      <div style={card}>
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text }}>
            {'\uD83C\uDFE6 '}{t('sepIra.title')}
          </div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: '12px', color: theme.dim, marginTop: '8px', lineHeight: 1.5 }}>
          {t('sepIra.subtitle')}
        </div>
      </div>

      {/* Filing status selector */}
      <div style={card}>
        <label style={sectionTitle}>{t('sepIra.filingStatusLabel')}</label>
        <select
          value={filingStatus}
          onChange={e => setFilingStatus(e.target.value)}
          style={{ ...selectStyle, width: '100%' }}
        >
          {FILING_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t('taxSummary.' + opt.labelKey)}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{t('common.loading')}</div>
        </div>
      )}

      {!loading && error && (
        <div style={{
          background: '#ef444422', border: '1px solid #ef444466',
          borderRadius: '12px', padding: '16px', color: RED, fontSize: '13px',
        }}>{error}</div>
      )}

      {!loading && !error && netProfit <= 0 && (
        <div style={{
          ...card, textAlign: 'center', padding: '24px 16px',
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCC8'}</div>
          <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>
            {t('sepIra.needNetProfit')}
          </div>
        </div>
      )}

      {!loading && !error && netProfit > 0 && (
        <>
          {/* YOUR DATA */}
          <div style={card}>
            <div style={sectionTitle}>
              {interpolate(t('sepIra.yourData'), { year })}
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('sepIra.netProfit')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(netProfit)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('sepIra.seTax')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(seTax)}
              </span>
            </div>
            <div style={{ ...lineRow, paddingTop: '10px', borderTop: '1px dashed ' + theme.border }}>
              <span style={{ color: theme.text, fontWeight: 600 }}>{t('sepIra.maxContribution')}</span>
              <span style={{ fontFamily: 'monospace', color: ORANGE, fontWeight: 700, fontSize: '15px' }}>
                ${fmt(maxContribution)}
              </span>
            </div>
            {maxContribution < uncappedMax && (
              <div style={{ fontSize: '11px', color: theme.dim, marginTop: '4px', lineHeight: 1.4 }}>
                {interpolate(t('sepIra.capNote'), { uncapped: fmt(uncappedMax) })}
              </div>
            )}
          </div>

          {/* SLIDER */}
          <div style={card}>
            <div style={sectionTitle}>{t('sepIra.howMuch')}</div>
            <div style={{
              textAlign: 'center',
              fontSize: '28px',
              fontWeight: 800,
              color: ORANGE,
              fontFamily: 'monospace',
              marginBottom: '8px',
            }}>
              ${fmt(sliderAmount)}
            </div>
            <input
              type="range"
              min={Math.min(totalContributed, maxContribution)}
              max={maxContribution}
              step={500}
              value={sliderAmount}
              onChange={e => {
                const raw = parseInt(e.target.value, 10) || 0
                const floor = Math.min(totalContributed, maxContribution)
                setSliderAmount(Math.max(raw, floor))
              }}
              style={{
                width: '100%',
                accentColor: ORANGE,
                cursor: 'pointer',
              }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '11px', color: theme.dim, marginTop: '4px',
            }}>
              <span>${fmt(Math.min(totalContributed, maxContribution))}</span>
              <span>${fmt(maxContribution)}</span>
            </div>
            <div style={{
              marginTop: '12px', fontSize: '12px', color: theme.dim, textAlign: 'center',
            }}>
              {t('sepIra.effectiveRate')}: <span style={{
                color: ORANGE, fontWeight: 700, fontFamily: 'monospace',
              }}>{savings.marginalRate.toFixed(1)}%</span>
            </div>

            {/* Contribution context: already contributed + room left */}
            {totalContributed > 0 && (
              <div style={{
                marginTop: '10px',
                padding: '10px 12px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '8px',
                fontSize: '12px',
                color: theme.text,
                lineHeight: 1.5,
              }}>
                <div>
                  {interpolate(t('sepIra.alreadyContributedInfo'), {
                    total: fmt(totalContributed),
                    pct: progressPct.toFixed(0),
                    cap: fmt(maxContribution),
                    remaining: fmt(Math.max(maxContribution - totalContributed, 0)),
                  })}
                </div>
                {sliderAmount > totalContributed && (
                  <div style={{ marginTop: '4px', color: ORANGE, fontWeight: 600 }}>
                    {interpolate(t('sepIra.planningAddMore'), {
                      extra: fmt(sliderAmount - totalContributed),
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SAVINGS COMPARISON */}
          <div style={card}>
            <div style={sectionTitle}>{t('sepIra.yourSavings')}</div>

            <div style={{
              padding: '10px 12px',
              background: 'rgba(100,116,139,0.08)',
              border: '1px solid ' + theme.border,
              borderRadius: '8px',
              marginBottom: '8px',
            }}>
              <div style={{ fontSize: '12px', color: theme.dim, marginBottom: '4px' }}>
                {t('sepIra.withoutSepIra')}
              </div>
              <div style={{ ...lineRow, padding: '2px 0' }}>
                <span style={{ fontSize: '12px', color: theme.dim }}>{t('sepIra.federalTax')}</span>
                <span style={{ fontFamily: 'monospace', color: theme.text }}>
                  ${fmt2(savings.baselineIncomeTax)}
                </span>
              </div>
              {savings.baselineStateTax > 0 && (
                <div style={{ ...lineRow, padding: '2px 0' }}>
                  <span style={{ fontSize: '12px', color: theme.dim }}>{t('sepIra.stateTax')}</span>
                  <span style={{ fontFamily: 'monospace', color: theme.text }}>
                    ${fmt2(savings.baselineStateTax)}
                  </span>
                </div>
              )}
            </div>

            <div style={{
              padding: '10px 12px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '8px',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '12px', color: GREEN, marginBottom: '4px', fontWeight: 600 }}>
                {interpolate(t('sepIra.withSepIra'), { amount: fmt(sliderAmount) })}
              </div>
              <div style={{ ...lineRow, padding: '2px 0' }}>
                <span style={{ fontSize: '12px', color: theme.dim }}>{t('sepIra.federalTax')}</span>
                <span style={{ fontFamily: 'monospace', color: theme.text }}>
                  ${fmt2(savings.withIncomeTax)}
                </span>
              </div>
              {savings.withStateTax > 0 && (
                <div style={{ ...lineRow, padding: '2px 0' }}>
                  <span style={{ fontSize: '12px', color: theme.dim }}>{t('sepIra.stateTax')}</span>
                  <span style={{ fontFamily: 'monospace', color: theme.text }}>
                    ${fmt2(savings.withStateTax)}
                  </span>
                </div>
              )}
            </div>

            <div style={{
              padding: '14px',
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: '10px',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '11px', color: theme.dim, textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>
                {'\uD83D\uDCB0 '}{t('sepIra.savings')}
              </div>
              <div style={{
                fontSize: '28px', fontWeight: 800, color: ORANGE, fontFamily: 'monospace',
              }}>
                ${fmt2(savings.taxSavings)}
              </div>
              {sliderAmount < maxContribution && maxSavings.taxSavings > savings.taxSavings && (
                <div style={{ fontSize: '11px', color: theme.dim, marginTop: '6px' }}>
                  {interpolate(t('sepIra.maxSavingsHint'), {
                    max: fmt(maxContribution),
                    maxSavings: fmt2(maxSavings.taxSavings),
                  })}
                </div>
              )}
            </div>

            {retirementProjection > 0 && (
              <div style={{
                marginTop: '12px', padding: '10px', textAlign: 'center',
                fontSize: '12px', color: theme.dim, lineHeight: 1.5,
              }}>
                {'\uD83D\uDCC8 '}
                {interpolate(t('sepIra.retirementProjection'), { amount: fmt(retirementProjection) })}
              </div>
            )}
          </div>

          {/* ADD CONTRIBUTION + HISTORY */}
          <div style={card}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: '16px',
              }}
            >
              {t('sepIra.addContribution')}
            </button>

            <div style={sectionTitle}>
              {interpolate(t('sepIra.contributionHistory'), { year })}
            </div>

            {contributions.length === 0 && (
              <div style={{
                fontSize: '13px', color: theme.dim, textAlign: 'center',
                padding: '20px 10px',
              }}>
                {t('sepIra.noContributionsYet')}
              </div>
            )}

            {contributions.map(c => (
              <div key={c.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px dashed ' + theme.border,
                gap: '10px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', color: theme.text, fontWeight: 600,
                    display: 'flex', gap: '8px', alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: 'monospace' }}>{c.contribution_date}</span>
                    <span style={{
                      fontFamily: 'monospace', color: ORANGE, fontWeight: 700,
                    }}>${fmt2(c.amount)}</span>
                  </div>
                  {(c.broker_name || c.notes) && (
                    <div style={{
                      fontSize: '11px', color: theme.dim, marginTop: '2px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.broker_name}{c.broker_name && c.notes ? ' \u00b7 ' : ''}{c.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: RED, fontSize: '18px', padding: '4px 8px',
                  }}
                  title={t('sepIra.deleteBtn')}
                >
                  {'\uD83D\uDDD1'}
                </button>
              </div>
            ))}

            {/* Progress bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '16px', fontSize: '12px', color: theme.dim,
            }}>
              <span>{interpolate(t('sepIra.totalContributed'), {
                total: fmt2(totalContributed),
                max: fmt(maxContribution),
              })}</span>
              <span style={{ fontFamily: 'monospace', color: ORANGE, fontWeight: 700 }}>
                {progressPct.toFixed(0)}%
              </span>
            </div>
            <div style={{
              marginTop: '6px',
              height: '8px',
              background: theme.border,
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: progressPct + '%',
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                transition: 'width 0.3s ease',
              }}/>
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{
            fontSize: '11px', color: theme.dim, lineHeight: 1.6,
            padding: '8px 4px',
          }}>
            {t('sepIra.disclaimerNote')}
          </div>
        </>
      )}

      {/* Add modal */}
      {showAddModal && (
        <div
          onClick={() => !saving && setShowAddModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.card,
              width: '100%',
              maxWidth: '480px',
              borderRadius: '16px 16px 0 0',
              padding: '20px',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{
              fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '16px',
            }}>
              {'\uD83C\uDFE6 '}{t('sepIra.modalTitle')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block', fontSize: '11px', color: theme.dim,
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                }}>{t('sepIra.amountLabel')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px',
                    border: '1px solid ' + theme.border,
                    background: theme.bg, color: theme.text, fontSize: '16px',
                    fontFamily: 'monospace', fontWeight: 600,
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block', fontSize: '11px', color: theme.dim,
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                }}>{t('sepIra.dateLabel')}</label>
                <input
                  type="date"
                  value={form.contribution_date}
                  onChange={e => setForm({ ...form, contribution_date: e.target.value })}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px',
                    border: '1px solid ' + theme.border,
                    background: theme.bg, color: theme.text, fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block', fontSize: '11px', color: theme.dim,
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                }}>{t('sepIra.brokerLabel')}</label>
                <input
                  type="text"
                  value={form.broker_name}
                  onChange={e => setForm({ ...form, broker_name: e.target.value })}
                  placeholder={t('sepIra.brokerPlaceholder')}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px',
                    border: '1px solid ' + theme.border,
                    background: theme.bg, color: theme.text, fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block', fontSize: '11px', color: theme.dim,
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
                }}>{t('sepIra.notesLabel')}</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px',
                    border: '1px solid ' + theme.border,
                    background: theme.bg, color: theme.text, fontSize: '14px',
                    resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
              <button
                disabled={saving}
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '14px', borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.bg, color: theme.text,
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >{t('sepIra.cancel')}</button>
              <button
                disabled={saving}
                onClick={handleAdd}
                style={{
                  padding: '14px', borderRadius: '10px', border: 'none',
                  background: saving ? GREY : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: '14px', fontWeight: 700,
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >{t('sepIra.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
