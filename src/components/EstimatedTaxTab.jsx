// Quarterly Estimated Tax Payments (IRS Form 1040-ES)
// Annual-tax-based quarterly payment tracker: takes totalTax from Tax Summary,
// splits into 4 quarterly installments aligned to IRS deadlines, tracks paid status.

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { calculatePerDiem } from '../utils/perDiemCalculator'
import { calculateTotalTax } from '../utils/taxCalculator'
import { sendNotification, isPermissionGranted, requestPermission } from '../lib/notifications'
import { getCurrentYearDeduction } from '../lib/tax/depreciationCalculator'

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// IRS 1040-ES deadlines (Q4 is Jan 15 of NEXT year)
function getQuarterDeadline(quarter, year) {
  if (quarter === 1) return new Date(year, 3, 15)        // April 15
  if (quarter === 2) return new Date(year, 5, 15)        // June 15
  if (quarter === 3) return new Date(year, 8, 15)        // September 15
  if (quarter === 4) return new Date(year + 1, 0, 15)    // January 15 next year
  return null
}

function getQuarterIncomePeriod(quarter, year) {
  if (quarter === 1) return { start: new Date(year, 0, 1), end: new Date(year, 2, 31) }
  if (quarter === 2) return { start: new Date(year, 3, 1), end: new Date(year, 4, 31) }
  if (quarter === 3) return { start: new Date(year, 5, 1), end: new Date(year, 7, 31) }
  if (quarter === 4) return { start: new Date(year, 8, 1), end: new Date(year, 11, 31) }
  return null
}

function daysBetween(a, b) {
  const msPerDay = 1000 * 60 * 60 * 24
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((db - da) / msPerDay)
}

function getQuarterStatus(quarter, year, today, paidAmount) {
  if (paidAmount != null && Number(paidAmount) > 0) return 'paid'
  const deadline = getQuarterDeadline(quarter, year)
  const diff = daysBetween(today, deadline)
  if (diff < 0) return 'overdue'
  if (diff <= 14) return 'due_soon'
  return 'upcoming'
}

function computeQuarterlyAmounts(totalTax) {
  const base = Math.round((totalTax / 4) * 100) / 100
  const q1 = base, q2 = base, q3 = base
  const q4 = Math.round((totalTax - q1 - q2 - q3) * 100) / 100
  return [q1, q2, q3, q4]
}

function formatLocalDate(date, lang) {
  const localeMap = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', tr: 'tr-TR', pl: 'pl-PL' }
  return date.toLocaleDateString(localeMap[lang] || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShortRange(start, end, lang) {
  const localeMap = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', tr: 'tr-TR', pl: 'pl-PL' }
  const fmtOpts = { day: 'numeric', month: 'short' }
  const locale = localeMap[lang] || 'en-US'
  return start.toLocaleDateString(locale, fmtOpts) + ' \u2013 ' + end.toLocaleDateString(locale, fmtOpts)
}

const PAYMENT_METHODS = ['direct_pay', 'eftps', 'check', 'other']

export default function EstimatedTaxTab({ userId, role, userVehicles, employmentType, stateOfResidence }) {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()

  const today = useMemo(() => new Date(), [])
  const taxYear = today.getFullYear()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const [totalTax, setTotalTax] = useState(0)
  const [filingStatus, setFilingStatus] = useState('single')
  const [stateCode, setStateCode] = useState(stateOfResidence || 'TX')
  const [payments, setPayments] = useState([])   // 4 rows Q1..Q4
  const [payModal, setPayModal] = useState(null)   // { quarter, estimated }

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (stateOfResidence) setStateCode(stateOfResidence)
  }, [stateOfResidence])

  // Load filing status
  useEffect(() => {
    if (!userId) return
    supabase
      .from('estimated_tax_settings')
      .select('filing_status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.filing_status) setFilingStatus(data.filing_status)
      })
      .catch(() => {})
  }, [userId])

  // Load annual financials + compute totalTax
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const start = `${taxYear}-01-01`
    const endPlusOne = `${taxYear + 1}-01-01`

    const perDiemPromises = [1, 2, 3, 4].map(q =>
      calculatePerDiem({ supabase, userId, role, quarter: q, year: taxYear })
        .catch(() => ({ totals: { total_amount: 0 } }))
    )

    Promise.all([
      supabase.from('trips').select('income').eq('user_id', userId)
        .gte('created_at', start + 'T00:00:00').lt('created_at', endPlusOne + 'T00:00:00'),
      supabase.from('fuel_entries').select('cost').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne),
      supabase.from('vehicle_expenses').select('amount').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne).then(r => r).catch(() => ({ data: [] })),
      supabase.from('service_records').select('cost').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne),
      supabase.from('vehicle_depreciation').select('purchase_price, purchase_date, depreciation_type, salvage_value, prior_depreciation, asset_class, strategy, section_179_amount, bonus_rate, business_use_pct')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        .then(r => r).catch(() => ({ data: null })),
      ...perDiemPromises,
    ])
      .then(([tripsRes, fuelRes, vehExpRes, serviceRes, depRes, ...perDiems]) => {
        if (cancelled) return

        const income = (tripsRes.data || []).reduce((s, r) => s + (r.income || 0), 0)
        const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const vehExp = (vehExpRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
        const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        // Schedule C uses the 80% DOT HOS deductible — single source of truth
        // shared with TaxSummaryTab and the export pipeline.
        const perDiem = perDiems.reduce((s, r) => s + (r?.totals?.total_deductible || 0), 0)

        // Shared helper: handles both legacy depreciation_type records and new
        // strategy-based records (asset_class + strategy + section_179_amount + bonus_rate).
        const depreciation = getCurrentYearDeduction(depRes.data, taxYear)

        const netProfit = Math.max(income - fuelCost - vehExp - serviceCost - perDiem - depreciation, 0)
        const result = calculateTotalTax(netProfit, filingStatus, stateCode)
        setTotalTax(result.totalTax || 0)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load tax data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, taxYear, filingStatus, stateCode])

  // Load / seed quarterly payments
  useEffect(() => {
    if (!userId || loading) return
    let cancelled = false

    supabase
      .from('quarterly_tax_payments')
      .select('*')
      .eq('user_id', userId)
      .eq('tax_year', taxYear)
      .order('quarter', { ascending: true })
      .then(async ({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          return
        }

        const amounts = computeQuarterlyAmounts(totalTax)
        const existing = data || []

        if (existing.length === 0 && totalTax > 0) {
          // Seed 4 records
          const rows = [1, 2, 3, 4].map(q => ({
            user_id: userId,
            tax_year: taxYear,
            quarter: q,
            estimated_amount: amounts[q - 1],
          }))
          const { data: inserted, error: insErr } = await supabase
            .from('quarterly_tax_payments')
            .insert(rows)
            .select()
          if (!cancelled && !insErr && inserted) {
            setPayments(inserted.sort((a, b) => a.quarter - b.quarter))
          }
          return
        }

        // Update estimated_amount on unpaid quarters if totalTax changed
        const updates = []
        const merged = []
        for (let q = 1; q <= 4; q++) {
          const row = existing.find(r => r.quarter === q)
          if (!row) {
            if (totalTax > 0) {
              const { data: newRow, error: insErr } = await supabase
                .from('quarterly_tax_payments')
                .insert({ user_id: userId, tax_year: taxYear, quarter: q, estimated_amount: amounts[q - 1] })
                .select()
                .single()
              if (!insErr && newRow) merged.push(newRow)
            }
            continue
          }
          const isPaid = row.paid_amount != null && Number(row.paid_amount) > 0
          const newAmt = amounts[q - 1]
          if (!isPaid && Math.abs(Number(row.estimated_amount) - newAmt) > 0.01 && totalTax > 0) {
            updates.push(
              supabase.from('quarterly_tax_payments')
                .update({ estimated_amount: newAmt, updated_at: new Date().toISOString() })
                .eq('id', row.id)
                .select()
                .single()
            )
            merged.push({ ...row, estimated_amount: newAmt })
          } else {
            merged.push(row)
          }
        }
        if (updates.length) await Promise.all(updates)
        if (!cancelled) setPayments(merged.sort((a, b) => a.quarter - b.quarter))
      })

    return () => { cancelled = true }
  }, [userId, taxYear, totalTax, loading])

  const totalPaid = payments.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0)
  const remaining = Math.max(totalTax - totalPaid, 0)
  const quarterlyAmount = totalTax / 4

  // Handle mark-as-paid
  const handleSavePayment = async ({ amount, date, method, notes }) => {
    if (!payModal || saving) return
    setSaving(true)
    const row = payments.find(p => p.quarter === payModal.quarter)
    if (!row) { setSaving(false); return }

    const { data, error: err } = await supabase
      .from('quarterly_tax_payments')
      .update({
        paid_amount: amount,
        paid_date: date,
        payment_method: method,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single()

    setSaving(false)
    if (err) {
      setToast({ text: err.message, type: 'error' })
      return
    }
    setPayments(prev => prev.map(p => p.id === data.id ? data : p).sort((a, b) => a.quarter - b.quarter))
    setPayModal(null)
    setToast({ text: t('quarterlyTax.paymentSaved'), type: 'success' })
  }

  const handleClearPayment = async (quarter) => {
    const row = payments.find(p => p.quarter === quarter)
    if (!row) return
    setSaving(true)
    const { data, error: err } = await supabase
      .from('quarterly_tax_payments')
      .update({
        paid_amount: null,
        paid_date: null,
        payment_method: null,
        notes: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single()
    setSaving(false)
    if (err) { setToast({ text: err.message, type: 'error' }); return }
    setPayments(prev => prev.map(p => p.id === data.id ? data : p).sort((a, b) => a.quarter - b.quarter))
    setToast({ text: t('quarterlyTax.paymentCleared'), type: 'success' })
  }

  const handleToggleReminder = async (quarter) => {
    const row = payments.find(p => p.quarter === quarter)
    if (!row) return
    const newVal = !row.reminder_set

    if (newVal && !isPermissionGranted()) {
      await requestPermission()
    }

    const { data, error: err } = await supabase
      .from('quarterly_tax_payments')
      .update({ reminder_set: newVal, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select()
      .single()
    if (err) { setToast({ text: err.message, type: 'error' }); return }
    setPayments(prev => prev.map(p => p.id === data.id ? data : p).sort((a, b) => a.quarter - b.quarter))
    setToast({ text: newVal ? t('quarterlyTax.reminderOn') : t('quarterlyTax.reminderOff'), type: 'success' })

    if (newVal) {
      const deadline = getQuarterDeadline(quarter, taxYear)
      const days = daysBetween(today, deadline)
      if (days <= 3 && days >= 0) {
        sendNotification(
          t('quarterlyTax.reminderTitle'),
          t('quarterlyTax.reminderBody').replace('{q}', quarter).replace('{d}', days),
          'qtp-' + taxYear + '-q' + quarter
        )
      }
    }
  }

  // Styles
  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  // Role guard
  const isOwner = role === 'owner_operator'
  const is1099 = role === 'driver' && employmentType === '1099'
  if (!isOwner && !is1099) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '24px' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDCBC'}</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text }}>
          {t('quarterlyTax.roleNotice')}
        </div>
      </div>
    )
  }

  const noData = !loading && totalTax <= 0

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

      {/* Title */}
      <div style={card}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text }}>
          {'\uD83D\uDCC5\uD83D\uDCB2 '}{t('quarterlyTax.title').replace('{year}', taxYear)}
        </div>
        <div style={{ fontSize: '12px', color: theme.dim, marginTop: '4px' }}>
          {t('quarterlyTax.subtitle')}
        </div>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{t('common.loading')}</div>
        </div>
      )}

      {error && (
        <div style={{
          background: '#ef444422', border: '1px solid #ef444466',
          borderRadius: '12px', padding: '16px', color: '#ef4444', fontSize: '13px',
        }}>{error}</div>
      )}

      {noData && !error && (
        <div style={{ ...card, textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDCCA'}</div>
          <div style={{ fontSize: '14px', color: theme.text, marginBottom: '12px' }}>
            {t('quarterlyTax.noDataPlaceholder')}
          </div>
        </div>
      )}

      {!loading && !error && !noData && (
        <>
          {/* Block 1 — Annual overview */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed ' + theme.border }}>
              <div>
                <div style={{ fontSize: '12px', color: theme.dim }}>{t('quarterlyTax.annualTax')}</div>
                <div style={{ fontSize: '10px', color: theme.dim, marginTop: '2px' }}>
                  {t('quarterlyTax.filingAndState').replace('{status}', t('taxSummary.filing' + (filingStatus === 'married_jointly' ? 'MarriedJointly' : filingStatus === 'married_separately' ? 'MarriedSeparately' : filingStatus === 'head_of_household' ? 'HeadOfHousehold' : 'Single'))).replace('{state}', stateCode)}
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                ${fmt(totalTax)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed ' + theme.border }}>
              <div>
                <div style={{ fontSize: '12px', color: theme.dim }}>{t('quarterlyTax.quarterlyInstallment')}</div>
                <div style={{ fontSize: '10px', color: theme.dim, marginTop: '2px' }}>{t('quarterlyTax.annualDiv4')}</div>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, fontFamily: 'monospace' }}>
                ${fmt(quarterlyAmount)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed ' + theme.border }}>
              <div style={{ fontSize: '12px', color: theme.dim }}>{t('quarterlyTax.alreadyPaid')}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
                ${fmt(totalPaid)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <div style={{ fontSize: '12px', color: theme.dim }}>{t('quarterlyTax.remaining')}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>
                ${fmt(remaining)}
              </div>
            </div>
          </div>

          {/* Block 2 — Four quarter cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {payments.map(p => {
              const q = p.quarter
              const deadline = getQuarterDeadline(q, taxYear)
              const income = getQuarterIncomePeriod(q, taxYear)
              const status = getQuarterStatus(q, taxYear, today, p.paid_amount)
              const days = daysBetween(today, deadline)

              const bg =
                status === 'paid' ? 'rgba(34,197,94,0.10)'
                : status === 'overdue' ? 'rgba(239,68,68,0.10)'
                : status === 'due_soon' ? 'rgba(245,158,11,0.12)'
                : theme.card
              const border =
                status === 'paid' ? 'rgba(34,197,94,0.35)'
                : status === 'overdue' ? 'rgba(239,68,68,0.35)'
                : status === 'due_soon' ? 'rgba(245,158,11,0.35)'
                : theme.border
              const badgeColor =
                status === 'paid' ? '#22c55e'
                : status === 'overdue' ? '#ef4444'
                : status === 'due_soon' ? '#f59e0b'
                : theme.dim

              const deadlineText =
                status === 'paid' ? t('quarterlyTax.statusPaid')
                : status === 'overdue' ? t('quarterlyTax.statusOverdue').replace('{n}', Math.abs(days))
                : days === 0 ? t('quarterlyTax.statusToday')
                : t('quarterlyTax.statusUpcoming').replace('{n}', days)

              return (
                <div key={q} style={{ background: bg, border: '1px solid ' + border, borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>Q{q} {taxYear}</div>
                    {status === 'paid' && <div style={{ fontSize: '18px' }}>{'\u2705'}</div>}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '10px' }}>
                    {t('quarterlyTax.incomePeriod')}: {formatShortRange(income.start, income.end, lang)}
                  </div>
                  <div style={{
                    fontSize: '22px', fontWeight: 700,
                    color: status === 'paid' ? '#22c55e' : '#f59e0b',
                    fontFamily: 'monospace', marginBottom: '8px',
                  }}>
                    {'\uD83D\uDCB0 $'}{fmt(status === 'paid' ? p.paid_amount : p.estimated_amount)}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.text, marginBottom: '2px' }}>
                    {'\u23F0 '}{t('quarterlyTax.dueBy')}: {formatLocalDate(deadline, lang)}
                  </div>
                  <div style={{ fontSize: '11px', color: badgeColor, fontWeight: 600, marginBottom: '10px' }}>
                    {deadlineText}
                  </div>

                  {status === 'paid' && p.paid_date && (
                    <div style={{
                      fontSize: '11px', color: theme.dim, padding: '6px 10px',
                      background: 'rgba(34,197,94,0.08)', borderRadius: '6px', marginBottom: '8px',
                    }}>
                      {t('quarterlyTax.paidOn').replace('{date}', formatLocalDate(new Date(p.paid_date), lang))}
                      {p.payment_method ? ' \u00B7 ' + t('quarterlyTax.method_' + p.payment_method) : ''}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {status !== 'paid' ? (
                      <button
                        onClick={() => setPayModal({ quarter: q, estimated: p.estimated_amount })}
                        style={{
                          padding: '10px', borderRadius: '8px', border: 'none',
                          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                          color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {'\u2713 '}{t('quarterlyTax.markPaid')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleClearPayment(q)}
                        disabled={saving}
                        style={{
                          padding: '10px', borderRadius: '8px',
                          border: '1px solid ' + theme.border,
                          background: 'transparent', color: theme.text,
                          fontSize: '12px', fontWeight: 500, cursor: saving ? 'default' : 'pointer',
                        }}
                      >
                        {t('quarterlyTax.clearPayment')}
                      </button>
                    )}
                    {status !== 'paid' && (
                      <button
                        onClick={() => handleToggleReminder(q)}
                        style={{
                          padding: '9px', borderRadius: '8px',
                          border: '1px solid ' + (p.reminder_set ? '#f59e0b' : theme.border),
                          background: p.reminder_set ? 'rgba(245,158,11,0.12)' : 'transparent',
                          color: p.reminder_set ? '#f59e0b' : theme.text,
                          fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        {'\uD83D\uDCC5 '}{p.reminder_set ? t('quarterlyTax.reminderActive') : t('quarterlyTax.remind3Days')}
                      </button>
                    )}
                    <a
                      href="https://www.irs.gov/payments/direct-pay"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '9px', borderRadius: '8px', textDecoration: 'none', textAlign: 'center',
                        border: '1px solid ' + theme.border,
                        background: 'transparent', color: theme.text,
                        fontSize: '12px', fontWeight: 500,
                      }}
                    >
                      {t('quarterlyTax.payOnIrs')}{' \u2197'}
                    </a>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Block 3 — Safe Harbor */}
          <div style={{
            ...card,
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.25)',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '6px' }}>
              {'\uD83D\uDCA1 '}Safe Harbor {t('quarterlyTax.rule')}
            </div>
            <div style={{ fontSize: '12px', color: theme.dim, lineHeight: '1.5', marginBottom: '6px' }}>
              {t('quarterlyTax.safeHarborIntro')}
            </div>
            <div style={{ fontSize: '12px', color: theme.text, marginBottom: '4px' }}>
              {'\u2022 '}{t('quarterlyTax.safeHarbor90').replace('{v}', '$' + fmt(totalTax * 0.9))}
            </div>
            <div style={{ fontSize: '12px', color: theme.text, marginBottom: '8px' }}>
              {'\u2022 '}{t('quarterlyTax.safeHarbor100')}
            </div>
            <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.5' }}>
              {t('quarterlyTax.safeHarborNote')}
            </div>
          </div>

          {/* Block 4 — How to pay */}
          <div style={card}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '10px' }}>
              {t('quarterlyTax.howToPayTitle')}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '4px' }}>
                {t('quarterlyTax.method1Title')}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {t('quarterlyTax.method1Body')}
              </div>
              <a
                href="https://www.irs.gov/payments/direct-pay"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: '#f59e0b', textDecoration: 'underline' }}
              >
                irs.gov/payments/direct-pay
              </a>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '4px' }}>
                {t('quarterlyTax.method2Title')}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {t('quarterlyTax.method2Body')}
              </div>
              <a
                href="https://www.eftps.gov"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: '#f59e0b', textDecoration: 'underline' }}
              >
                eftps.gov
              </a>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '4px' }}>
                {t('quarterlyTax.method3Title')}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {t('quarterlyTax.method3Body')}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '4px' }}>
                {t('quarterlyTax.method4Title')}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {t('quarterlyTax.method4Body')}
              </div>
              <a
                href="https://www.irs.gov/forms-pubs/about-form-1040-es"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: '#f59e0b', textDecoration: 'underline' }}
              >
                Form 1040-ES
              </a>
            </div>
          </div>

          {/* Block 5 — Disclaimer */}
          <div style={{ ...card, background: theme.card2 || theme.bg }}>
            <div style={{ fontSize: '11px', color: theme.dim, lineHeight: '1.6', whiteSpace: 'pre-line' }}>
              {t('quarterlyTax.disclaimer')}
            </div>
          </div>
        </>
      )}

      {/* Mark-paid modal */}
      {payModal && (
        <MarkPaidModal
          theme={theme}
          t={t}
          quarter={payModal.quarter}
          estimated={payModal.estimated}
          saving={saving}
          onCancel={() => setPayModal(null)}
          onSave={handleSavePayment}
        />
      )}
    </div>
  )
}

function MarkPaidModal({ theme, t, quarter, estimated, saving, onCancel, onSave }) {
  const [amount, setAmount] = useState(String(estimated || 0))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('direct_pay')
  const [notes, setNotes] = useState('')

  const input = {
    padding: '10px', borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg, color: theme.text,
    fontSize: '14px', width: '100%', boxSizing: 'border-box',
  }
  const label = { fontSize: '11px', color: theme.dim, marginBottom: '4px', display: 'block' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9998, padding: '16px',
    }} onClick={onCancel}>
      <div
        style={{
          background: theme.card, borderRadius: '14px', padding: '18px',
          maxWidth: '420px', width: '100%',
          border: '1px solid ' + theme.border,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '14px' }}>
          {t('quarterlyTax.modalTitle').replace('{q}', quarter)}
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label}>{t('quarterlyTax.modalAmount')}</label>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={input} />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label}>{t('quarterlyTax.modalDate')}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label}>{t('quarterlyTax.modalMethod')}</label>
          <select value={method} onChange={e => setMethod(e.target.value)} style={input}>
            {PAYMENT_METHODS.map(m => (
              <option key={m} value={m}>{t('quarterlyTax.method_' + m)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={label}>{t('quarterlyTax.modalNotes')}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px',
              border: '1px solid ' + theme.border, background: 'transparent',
              color: theme.text, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={saving || !amount || Number(amount) <= 0}
            onClick={() => onSave({ amount: Number(amount), date, method, notes })}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
              background: saving ? theme.border : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
