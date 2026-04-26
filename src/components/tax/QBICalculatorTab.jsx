// QBI Deduction Calculator (IRC §199A) — read-only UI for owner-operators.
// Session 2A: visualize calculation; no save, no history, no DB writes.
//
// Pulls Schedule C net profit + UBIA from existing helpers, then runs the
// pure calculator from src/utils/qbi/calculateQBI.js. Filing status defaults
// to profile.filing_status / estimated_tax_settings.filing_status when present.
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../../lib/theme'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { calculateScheduleCNetProfit } from '../../utils/scheduleC'
import { getTotalUBIAForYear } from '../../utils/vehicleAggregates'
import {
  calculateSETax,
  STANDARD_DEDUCTIONS,
  FILING_STATUS_OPTIONS,
} from '../../utils/taxCalculator'
import { calculateQBIDeduction } from '../../utils/qbi/calculateQBI'

const ORANGE = '#f59e0b'
const GREEN = '#10b981'
const RED = '#ef4444'

// App-wide filing_status codes use the verbose form ('married_jointly', ...).
// The QBI calculator uses the short IRS form ('mfj', 'single', 'mfs', 'hoh').
const STATUS_TO_QBI = {
  single: 'single',
  married_jointly: 'mfj',
  married_separately: 'mfs',
  head_of_household: 'hoh',
}

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmt2(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export default function QBICalculatorTab({ userId, role, profile }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [netProfit, setNetProfit] = useState(0)
  const [ubiaAuto, setUbiaAuto] = useState(0)

  // Parameters (local state — Session 2B will persist them)
  const [filingStatus, setFilingStatus] = useState(profile?.filing_status || 'single')
  const [isSSTB, setIsSSTB] = useState(false)
  const [priorYearLossInput, setPriorYearLossInput] = useState('')

  // Advanced parameters (collapsible)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [w2WagesInput, setW2WagesInput] = useState('')
  const [ubiaOverrideInput, setUbiaOverrideInput] = useState('')
  const [sehiInput, setSehiInput] = useState('')

  const yearOptions = useMemo(() => buildYearOptions(), [])

  // If profile didn't carry filing_status, fall back to estimated_tax_settings.
  useEffect(() => {
    if (!userId || profile?.filing_status) return
    supabase
      .from('estimated_tax_settings')
      .select('filing_status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.filing_status) setFilingStatus(data.filing_status)
      })
      .catch(() => {})
  }, [userId, profile?.filing_status])

  // Load Schedule C net profit + UBIA when year changes.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      calculateScheduleCNetProfit(supabase, userId, year, role || 'owner_operator'),
      getTotalUBIAForYear(supabase, userId, year).catch(() => 0),
    ])
      .then(([sched, ubia]) => {
        if (cancelled) return
        setNetProfit(sched?.netProfit || 0)
        setUbiaAuto(ubia || 0)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, year])

  const seResult = useMemo(() => calculateSETax(netProfit, filingStatus), [netProfit, filingStatus])
  const seTax = seResult.totalSETax
  const halfSE = seResult.deductibleHalfSE

  const sehiNum = Number(sehiInput) || 0
  const w2Num = Number(w2WagesInput) || 0
  const priorYearLossNum = Math.max(0, Number(priorYearLossInput) || 0)
  const ubiaOverrideNum = ubiaOverrideInput !== '' ? Number(ubiaOverrideInput) : null
  const ubiaUsed = ubiaOverrideNum != null && Number.isFinite(ubiaOverrideNum)
    ? Math.max(0, ubiaOverrideNum)
    : ubiaAuto

  const standardDeduction = STANDARD_DEDUCTIONS[filingStatus] ?? STANDARD_DEDUCTIONS.single

  // AGI proxy = NetProfit − ½ SE − SEHI. Approximation good enough for §199A
  // planning; ignores other above-the-line items (HSA, SEP-IRA, student loan).
  const agiProxy = Math.max(0, netProfit - halfSE - sehiNum)
  const taxableIncomeCap = Math.max(0, agiProxy - standardDeduction)

  // §199A(c)(2): a prior-year QBI loss reduces THIS year's QBI before the 20%.
  const qbiBase = Math.max(0, netProfit - halfSE - sehiNum - priorYearLossNum)

  const qbiFilingStatus = STATUS_TO_QBI[filingStatus] || 'single'

  const result = useMemo(() => {
    try {
      return calculateQBIDeduction({
        filingStatus: qbiFilingStatus,
        taxableIncomeBeforeQBI: taxableIncomeCap,
        qbi: qbiBase,
        isSSTB,
        w2Wages: w2Num,
        ubia: ubiaUsed,
        netCapitalGain: 0,
        taxYear: year,
      })
    } catch {
      return null
    }
  }, [qbiFilingStatus, taxableIncomeCap, qbiBase, isSSTB, w2Num, ubiaUsed, year])

  // Three-tier breakdown values (for display)
  const tier1 = 0.20 * qbiBase
  const tier2 = 0.20 * taxableIncomeCap
  const tier3Wage = 0.50 * w2Num
  const tier3WageUbia = 0.25 * w2Num + 0.025 * ubiaUsed
  const tier3 = Math.max(tier3Wage, tier3WageUbia)

  const phase = result?.phase || 'below'
  const sstbPhasedOut = isSSTB && phase === 'above'
  const tier3Applicable = phase !== 'below' && !sstbPhasedOut

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

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '14px',
    fontFamily: 'monospace',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    color: theme.dim,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  }

  const hintStyle = {
    fontSize: '11px',
    color: theme.dim,
    marginTop: '4px',
    lineHeight: 1.4,
  }

  // Tier display row builder.
  function tierRow(label, value, applicable, note) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '8px 0',
        borderBottom: '1px dashed ' + theme.border,
        opacity: applicable ? 1 : 0.55,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: theme.text, fontWeight: 600 }}>{label}</div>
          {note && (
            <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{note}</div>
          )}
        </div>
        <div style={{
          fontFamily: 'monospace',
          fontWeight: 700,
          color: applicable ? theme.text : theme.dim,
          marginLeft: '12px',
          whiteSpace: 'nowrap',
        }}>
          {applicable ? '$' + fmt2(value) : '—'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Title + year */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text }}>
            {'🏛️ '}{t('qbi.calculator.title')}
          </div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: '12px', color: theme.dim, marginTop: '8px', lineHeight: 1.5 }}>
          {t('qbi.calculator.description')}
        </div>
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

      {!loading && !error && (
        <>
          {/* SECTION 2 — YOUR DATA (read-only) */}
          <div style={card}>
            <div style={sectionTitle}>
              {interpolate(t('qbi.calculator.yourData'), { year })}
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.netProfit')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(netProfit)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.seTax')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(seTax)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.halfSE')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(halfSE)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.agiProxy')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(agiProxy)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.standardDeduction')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(standardDeduction)}
              </span>
            </div>
            <div style={{ ...lineRow, paddingTop: '10px', borderTop: '1px dashed ' + theme.border }}>
              <span style={{ color: theme.text, fontWeight: 600 }}>
                {t('qbi.calculator.taxableIncomeCap')}
              </span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 700 }}>
                ${fmt2(taxableIncomeCap)}
              </span>
            </div>
            <div style={lineRow}>
              <span style={{ color: theme.dim }}>{t('qbi.calculator.ubiaAuto')}</span>
              <span style={{ fontFamily: 'monospace', color: theme.text, fontWeight: 600 }}>
                ${fmt2(ubiaAuto)}
              </span>
            </div>
          </div>

          {/* SECTION 3 — PARAMETERS */}
          <div style={card}>
            <div style={sectionTitle}>{t('qbi.calculator.parameters')}</div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>{t('qbi.calculator.filingStatus')}</label>
              <select
                value={filingStatus}
                onChange={e => setFilingStatus(e.target.value)}
                style={{ ...selectStyle, width: '100%' }}
              >
                {FILING_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {t('taxSummary.' + opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>{t('qbi.calculator.isSSTB')}</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{
                  flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                  border: '1px solid ' + (isSSTB ? ORANGE : theme.border),
                  background: isSSTB ? 'rgba(245,158,11,0.08)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600, color: theme.text,
                }}>
                  <input
                    type="radio"
                    name="qbi-sstb"
                    checked={isSSTB === true}
                    onChange={() => setIsSSTB(true)}
                    style={{ accentColor: ORANGE }}
                  />
                  {t('qbi.calculator.yes')}
                </label>
                <label style={{
                  flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                  border: '1px solid ' + (!isSSTB ? ORANGE : theme.border),
                  background: !isSSTB ? 'rgba(245,158,11,0.08)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600, color: theme.text,
                }}>
                  <input
                    type="radio"
                    name="qbi-sstb"
                    checked={isSSTB === false}
                    onChange={() => setIsSSTB(false)}
                    style={{ accentColor: ORANGE }}
                  />
                  {t('qbi.calculator.no')}
                </label>
              </div>
              <div style={hintStyle}>{t('qbi.calculator.isSSTBHint')}</div>
            </div>

            <div>
              <label style={labelStyle}>{t('qbi.calculator.priorYearLoss')}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={priorYearLossInput}
                onChange={e => setPriorYearLossInput(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
              <div style={hintStyle}>{t('qbi.calculator.priorYearLossHint')}</div>
            </div>
          </div>

          {/* SECTION 4 — ADVANCED (collapsible) */}
          <div style={card}>
            <button
              onClick={() => setAdvancedOpen(v => !v)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '4px 0',
                color: theme.text,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{'⚙️ '}{t('qbi.calculator.advanced')}</span>
              <span style={{ fontSize: '11px', color: theme.dim }}>
                {advancedOpen ? '▲' : '▼'}
              </span>
            </button>

            {advancedOpen && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>{t('qbi.calculator.w2Wages')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={100}
                    value={w2WagesInput}
                    onChange={e => setW2WagesInput(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                  />
                  <div style={hintStyle}>{t('qbi.calculator.w2Hint')}</div>
                </div>

                <div>
                  <label style={labelStyle}>{t('qbi.calculator.ubiaOverride')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={100}
                    value={ubiaOverrideInput}
                    onChange={e => setUbiaOverrideInput(e.target.value)}
                    placeholder={t('qbi.calculator.ubiaPlaceholder')}
                    style={inputStyle}
                  />
                  <div style={hintStyle}>{t('qbi.calculator.ubiaHint')}</div>
                </div>

                <div>
                  <label style={labelStyle}>{t('qbi.calculator.sehi')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={100}
                    value={sehiInput}
                    onChange={e => setSehiInput(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                  />
                  <div style={hintStyle}>{t('qbi.calculator.sehiHint')}</div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5 — RESULT */}
          <div style={{
            ...card,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.30)',
          }}>
            <div style={{
              fontSize: '11px', color: theme.dim, textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '8px', textAlign: 'center',
            }}>
              {t('qbi.calculator.result')}
            </div>
            <div style={{
              fontSize: '32px', fontWeight: 800, color: GREEN,
              fontFamily: 'monospace', textAlign: 'center',
            }}>
              ${fmt2(result?.deduction || 0)}
            </div>
            <div style={{
              fontSize: '12px', color: theme.dim, textAlign: 'center', marginTop: '4px',
            }}>
              {t('qbi.calculator.resultSubtitle')}
            </div>

            {result?.appliedRule && (
              <div style={{
                marginTop: '12px',
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.10)',
                borderRadius: '8px',
                fontSize: '11px',
                color: theme.dim,
                lineHeight: 1.5,
                textAlign: 'center',
              }}>
                {result.appliedRule}
              </div>
            )}

            <div style={{ marginTop: '14px' }}>
              {tierRow(
                t('qbi.calculator.tier1'),
                tier1,
                true,
                interpolate('20% × ${qbi}', { qbi: fmt2(qbiBase) })
              )}
              {tierRow(
                t('qbi.calculator.tier2'),
                tier2,
                true,
                interpolate('20% × ${ti}', { ti: fmt2(taxableIncomeCap) })
              )}
              {tierRow(
                t('qbi.calculator.tier3'),
                tier3,
                tier3Applicable,
                phase === 'below'
                  ? t('qbi.calculator.tier3NotApplicable')
                  : sstbPhasedOut
                    ? t('qbi.calculator.tier3SSTBPhasedOut')
                    : interpolate('max(0.50×${w2}, 0.25×${w2} + 0.025×${ubia})', {
                        w2: fmt(w2Num),
                        ubia: fmt(ubiaUsed),
                      })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
