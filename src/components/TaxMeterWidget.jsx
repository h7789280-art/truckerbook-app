// Real-time Tax Meter widget — Overview card for owner_operator.
// Shows: YTD accrued tax, savings bucket vs. user's withhold %,
// and the next 1040-ES quarterly deadline with amount due.
// Tap → parent's onOpenTaxSummary (Service → Bookkeeping → Tax Summary).

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { calculatePerDiem } from '../utils/perDiemCalculator'
import {
  calculateYTDGrossIncome,
  calculateAccruedTax,
  calculateSavingsBucket,
  getNextQuarterDeadline,
} from '../utils/taxMeterCalculator'

const GOLD = '#f59e0b'
const GREEN = '#22c55e'
const YELLOW = '#eab308'
const RED = '#ef4444'

// Cyrillic labels as Unicode escapes (per CLAUDE.md)
const L = {
  title: '\u041D\u0410\u041B\u041E\u0413\u0418',                           // НАЛОГИ
  accrued: '\u041D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043E \u043D\u0430\u043B\u043E\u0433\u0430',   // Накоплено налога
  reserved: '\u041E\u0442\u043B\u043E\u0436\u0435\u043D\u043E',            // Отложено
  dueBy: '\u043A',                                                          // к (due by)
  loading: '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026',       // Загрузка…
  settingsTitle: '\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u043E\u0442\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043D\u0430 \u043D\u0430\u043B\u043E\u0433\u0438', // Процент отложения на налоги
  settingsHint: '\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u043C\u043E: 25\u201330% \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0435\u0432-\u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u043E\u0432', // Рекомендуемо: 25–30% для владельцев-операторов
  cancel: '\u041E\u0442\u043C\u0435\u043D\u0430',                           // Отмена
  save: '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C',           // Сохранить
}

const EMOJI = {
  building: '\uD83C\uDFDB\uFE0F',  // 🏛️
  money: '\uD83D\uDCB0',           // 💰
  bank: '\uD83C\uDFE6',            // 🏦
  calendar: '\uD83D\uDCC5',        // 📅
  gear: '\u2699\uFE0F',            // ⚙️
  check: '\u2705',                 // ✅
  warning: '\u26A0\uFE0F',         // ⚠️
}

function daysWord(n) {
  const abs = Math.abs(Math.trunc(n))
  const n10 = abs % 10
  const n100 = abs % 100
  if (n100 >= 11 && n100 <= 19) return '\u0434\u043D\u0435\u0439' // дней
  if (n10 === 1) return '\u0434\u0435\u043D\u044C'                 // день
  if (n10 >= 2 && n10 <= 4) return '\u0434\u043D\u044F'            // дня
  return '\u0434\u043D\u0435\u0439'
}

function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
}

function formatDueShort(dueDate) {
  // "2026-06-15" -> "06-15"
  if (!dueDate || typeof dueDate !== 'string') return ''
  const parts = dueDate.split('-')
  if (parts.length !== 3) return dueDate
  return parts[1] + '-' + parts[2]
}

function daysLeftColor(days) {
  if (days > 14) return GREEN
  if (days >= 7) return YELLOW
  return RED
}

function computeDepreciation(row, year) {
  if (!row) return 0
  const price = Number(row.purchase_price) || 0
  const salvage = Number(row.salvage_value) || 0
  const prior = Number(row.prior_depreciation) || 0
  const basis = Math.max(price - salvage, 0)
  const purchaseYear = row.purchase_date ? new Date(row.purchase_date).getFullYear() : year
  if (row.depreciation_type === 'section179') {
    return purchaseYear === year ? Math.max(Math.min(basis, 1160000) - prior, 0) : 0
  }
  const rates = row.depreciation_type === 'macrs7'
    ? [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]
    : [20, 32, 19.2, 11.52, 11.52, 5.76]
  const idx = year - purchaseYear
  if (idx >= 0 && idx < rates.length) return basis * (rates[idx] / 100)
  return 0
}

export default function TaxMeterWidget({ userId, profile, onOpenTaxSummary }) {
  const { theme } = useTheme()

  const today = useMemo(() => new Date(), [])
  const year = today.getFullYear()

  const [loading, setLoading] = useState(true)
  const [ytdGross, setYtdGross] = useState(0)
  const [ytdExpenses, setYtdExpenses] = useState(0)
  const [ytdPerDiem, setYtdPerDiem] = useState(0)
  const [depreciation, setDepreciation] = useState(0)
  const [filingStatus, setFilingStatus] = useState('single')
  const [paidByQuarter, setPaidByQuarter] = useState({})
  const [paidTotalYTD, setPaidTotalYTD] = useState(0)

  // Local mirror of profile.tax_withhold_pct so the slider reflects saves immediately.
  const initialPct = Number(profile?.tax_withhold_pct ?? 25)
  const [withholdPct, setWithholdPct] = useState(
    Number.isFinite(initialPct) ? initialPct : 25
  )

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingPct, setPendingPct] = useState(withholdPct)
  const [savingPct, setSavingPct] = useState(false)

  const stateCode = profile?.state_of_residence || 'TX'

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)

    const start = `${year}-01-01`
    const endPlusOne = `${year + 1}-01-01`

    const perDiemPromises = [1, 2, 3, 4].map(q =>
      calculatePerDiem({ supabase, userId, role: 'owner_operator', quarter: q, year })
        .catch(() => ({ totals: { total_amount: 0 } }))
    )

    Promise.all([
      supabase.from('trips').select('income, created_at').eq('user_id', userId)
        .gte('created_at', start + 'T00:00:00').lt('created_at', endPlusOne + 'T00:00:00'),
      supabase.from('fuel_entries').select('cost').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne),
      supabase.from('vehicle_expenses').select('amount').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne).then(r => r).catch(() => ({ data: [] })),
      supabase.from('service_records').select('cost').eq('user_id', userId)
        .gte('date', start).lt('date', endPlusOne),
      supabase.from('vehicle_depreciation')
        .select('purchase_price, purchase_date, depreciation_type, salvage_value, prior_depreciation')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        .then(r => r).catch(() => ({ data: null })),
      supabase.from('estimated_tax_settings').select('filing_status').eq('user_id', userId).maybeSingle()
        .then(r => r).catch(() => ({ data: null })),
      supabase.from('quarterly_tax_payments').select('quarter, paid_amount')
        .eq('user_id', userId).eq('tax_year', year)
        .then(r => r).catch(() => ({ data: [] })),
      ...perDiemPromises,
    ])
      .then(results => {
        if (cancelled) return
        const [tripsRes, fuelRes, vehExpRes, serviceRes, depRes, settingsRes, paymentsRes, ...perDiems] = results

        const gross = calculateYTDGrossIncome(tripsRes.data || [], year)
        const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (Number(r.cost) || 0), 0)
        const vehExp = (vehExpRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (Number(r.cost) || 0), 0)
        const totalExp = fuelCost + vehExp + serviceCost

        const perDiemTotal = perDiems.reduce((s, r) => s + (Number(r?.totals?.total_amount) || 0), 0)
        const dep = computeDepreciation(depRes.data, year)
        const fs = settingsRes.data?.filing_status || 'single'

        const pByQ = {}
        let paidSum = 0
        for (const p of paymentsRes.data || []) {
          const amt = Number(p.paid_amount) || 0
          pByQ[p.quarter] = amt
          paidSum += amt
        }

        setYtdGross(gross)
        setYtdExpenses(totalExp)
        setYtdPerDiem(perDiemTotal)
        setDepreciation(dep)
        setFilingStatus(fs)
        setPaidByQuarter(pByQ)
        setPaidTotalYTD(paidSum)
      })
      .catch(() => { /* swallow — widget shows zeros if load fails */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [userId, year])

  const accrued = calculateAccruedTax({
    ytdGross, ytdExpenses, ytdPerDiem, depreciation,
    filingStatus, state: stateCode, currentDate: today,
  })

  const savingsBucketDue = calculateSavingsBucket(ytdGross, withholdPct, paidTotalYTD)
  const reservedGross = ytdGross * (withholdPct / 100)

  // Reserved indicator: ✅ if reserved (minus paid) covers accrued tax,
  // ⚠ if reserved covers < 80% of accrued tax.
  const coverage = accrued.ytdAccruedTax > 0 ? reservedGross / accrued.ytdAccruedTax : 1
  const reservedIcon = reservedGross >= accrued.ytdAccruedTax
    ? EMOJI.check
    : coverage < 0.8 ? EMOJI.warning : null

  const nextQ = getNextQuarterDeadline(today, {
    safeHarborTotal: accrued.projectedAnnualTax,
    paidByQuarter,
  })

  const daysColor = nextQ ? daysLeftColor(nextQ.daysUntil) : theme.dim

  // Handle card click (but not gear)
  const handleCardClick = () => {
    if (onOpenTaxSummary) onOpenTaxSummary()
  }

  const handleOpenSettings = (e) => {
    e.stopPropagation()
    setPendingPct(withholdPct)
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    if (savingPct) return
    const pct = Math.max(15, Math.min(40, Math.round(Number(pendingPct) || 25)))
    setSavingPct(true)
    try {
      await supabase.from('profiles').update({ tax_withhold_pct: pct }).eq('id', userId)
      setWithholdPct(pct)
      setSettingsOpen(false)
    } catch {
      // Keep modal open on error so user can retry.
    } finally {
      setSavingPct(false)
    }
  }

  // --- Styles (match БИЗНЕС/ЛИЧНОЕ blocks: theme.card, 12px radius, 16px padding) ---

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    cursor: onOpenTaxSummary ? 'pointer' : 'default',
    transition: 'opacity 0.15s',
  }

  const row = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
  }

  const labelStyle = {
    fontSize: '13px',
    color: theme.dim,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }

  const amountStyle = {
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'monospace',
    color: GOLD,
    whiteSpace: 'nowrap',
  }

  const headerRow = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  }

  const headerTitle = {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text,
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

  const gearBtn = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '6px',
    fontSize: '16px',
    color: theme.dim,
    lineHeight: 1,
  }

  return (
    <>
      <div
        style={cardStyle}
        onClick={handleCardClick}
        onPointerDown={e => { e.currentTarget.style.opacity = '0.85' }}
        onPointerUp={e => { e.currentTarget.style.opacity = '1' }}
        onPointerLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        <div style={headerRow}>
          <div style={headerTitle}>
            <span>{EMOJI.building}</span>
            <span>{L.title} ({year})</span>
          </div>
          <button style={gearBtn} onClick={handleOpenSettings} aria-label="settings">
            {EMOJI.gear}
          </button>
        </div>

        {loading ? (
          <div style={{ color: theme.dim, fontSize: '13px', padding: '8px 0' }}>
            {L.loading}
          </div>
        ) : (
          <>
            {/* Row 1 — Accrued */}
            <div style={row}>
              <div style={labelStyle}>
                <span>{EMOJI.money}</span>
                <span>{L.accrued}:</span>
              </div>
              <div style={amountStyle}>{fmtMoney(accrued.ytdAccruedTax)}</div>
            </div>

            {/* Row 2 — Reserved */}
            <div style={row}>
              <div style={labelStyle}>
                <span>{EMOJI.bank}</span>
                <span>{L.reserved} ({withholdPct}%):</span>
                {reservedIcon && (
                  <span style={{ fontSize: '13px' }}>{reservedIcon}</span>
                )}
              </div>
              <div style={amountStyle}>{fmtMoney(reservedGross)}</div>
            </div>

            {/* Row 3 — Next quarter */}
            {nextQ && (
              <div style={{ ...row, alignItems: 'flex-start' }}>
                <div style={labelStyle}>
                  <span>{EMOJI.calendar}</span>
                  <span>{nextQ.quarter} {nextQ.year} {L.dueBy} {formatDueShort(nextQ.dueDate)}:</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  <div style={amountStyle}>{fmtMoney(nextQ.amount)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: daysColor, fontFamily: 'monospace' }}>
                    {nextQ.daysUntil} {daysWord(nextQ.daysUntil)}
                  </div>
                </div>
              </div>
            )}

            {/* Subtle delta hint when savings bucket is short */}
            {!loading && savingsBucketDue > 0.5 && ytdGross > 0 && (
              <div style={{
                fontSize: '11px',
                color: theme.dim,
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px dashed ' + theme.border,
                textAlign: 'right',
                fontFamily: 'monospace',
              }}>
                {fmtMoney(savingsBucketDue)}
              </div>
            )}
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          theme={theme}
          value={pendingPct}
          onChange={setPendingPct}
          saving={savingPct}
          onCancel={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
    </>
  )
}

function SettingsModal({ theme, value, onChange, saving, onCancel, onSave }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9998, padding: '16px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: theme.card, borderRadius: '14px', padding: '20px',
          maxWidth: '380px', width: '100%',
          border: '1px solid ' + theme.border,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text, marginBottom: '6px' }}>
          {L.settingsTitle}
        </div>
        <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '20px', lineHeight: 1.5 }}>
          {L.settingsHint}
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{
            fontSize: '40px', fontWeight: 700, fontFamily: 'monospace', color: GOLD,
          }}>
            {Math.round(Number(value) || 25)}%
          </div>
        </div>

        <input
          type="range"
          min={15}
          max={40}
          step={1}
          value={Math.round(Number(value) || 25)}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: GOLD, marginBottom: '8px' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.dim, marginBottom: '20px' }}>
          <span>15%</span>
          <span>40%</span>
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
            {L.cancel}
          </button>
          <button
            disabled={saving}
            onClick={onSave}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
              background: saving ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {L.save}
          </button>
        </div>
      </div>
    </div>
  )
}
