// Truck Depreciation:
//   - Owner-Operator (owner_operator): new flow with asset classification,
//     Section 179, Bonus Depreciation, 4-strategy comparison table, Form 3115 banner.
//   - Company (company): legacy flow, unchanged from pre-2026-04-21 behavior.
//   - W-2 driver: informational stub.
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { calculateTotalTax } from '../utils/taxCalculator'
import {
  ASSET_CLASS,
  ASSET_CLASS_TO_RECOVERY_PERIOD,
  SECTION_179_2026,
  STRATEGY,
  getBonusRate,
  getSection179Limit,
  suggestAssetClass,
} from '../lib/tax/macrs-constants'
import {
  buildStrategySchedule,
  compareStrategies,
  recommendStrategy,
  needsMidQuarterConvention,
  checkSection179Eligibility,
} from '../lib/tax/depreciationCalculator'

const LEGACY_SECTION_179_LIMIT = 1160000
const MACRS_5 = [20, 32, 19.2, 11.52, 11.52, 5.76]
const MACRS_7 = [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtInt(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// =============================================================================
// Legacy (company) depreciation — unchanged behavior.
// =============================================================================
function buildLegacySchedule(method, purchasePrice, salvageValue, priorDepreciation, purchaseYear) {
  const depreciableBasis = Math.max(purchasePrice - salvageValue, 0)
  const rows = []
  if (method === 'section179') {
    const deduction = Math.min(depreciableBasis, LEGACY_SECTION_179_LIMIT) - priorDepreciation
    const actualDeduction = Math.max(deduction, 0)
    rows.push({
      year: purchaseYear,
      rate: 100,
      deduction: actualDeduction,
      remaining: Math.max(purchasePrice - salvageValue - actualDeduction - priorDepreciation, 0),
    })
    return rows
  }
  const rates = method === 'macrs5' ? MACRS_5 : MACRS_7
  let totalDeducted = priorDepreciation
  for (let i = 0; i < rates.length; i++) {
    const yearDeduction = depreciableBasis * (rates[i] / 100)
    const remaining = Math.max(depreciableBasis - totalDeducted - yearDeduction, 0)
    rows.push({
      year: purchaseYear + i,
      rate: rates[i],
      deduction: yearDeduction,
      remaining,
    })
    totalDeducted += yearDeduction
  }
  return rows
}

function LegacyDepreciation({ userId, role, employmentType }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [method, setMethod] = useState('macrs5')
  const [salvageValue, setSalvageValue] = useState('')
  const [priorDepreciation, setPriorDepreciation] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadedId, setLoadedId] = useState(null)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('vehicle_depreciation')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPurchasePrice(String(data.purchase_price || ''))
          setPurchaseDate(data.purchase_date || '')
          setMethod(data.depreciation_type || 'macrs5')
          setSalvageValue(String(data.salvage_value || ''))
          setPriorDepreciation(String(data.prior_depreciation || ''))
          setLoadedId(data.id)
        }
      })
      .catch(() => {})
  }, [userId])

  const priceNum = Number(purchasePrice) || 0
  const salvageNum = Number(salvageValue) || 0
  const priorNum = Number(priorDepreciation) || 0
  const purchaseYear = purchaseDate ? new Date(purchaseDate).getFullYear() : currentYear

  const schedule = useMemo(() => {
    if (priceNum <= 0) return []
    return buildLegacySchedule(method, priceNum, salvageNum, priorNum, purchaseYear)
  }, [method, priceNum, salvageNum, priorNum, purchaseYear])

  const currentYearRow = schedule.find(r => r.year === currentYear)
  const currentYearDeduction = currentYearRow ? currentYearRow.deduction : 0
  const totalDeducted = schedule.reduce((s, r) => s + r.deduction, 0)

  const handleSave = async () => {
    if (!userId || priceNum <= 0 || !purchaseDate) return
    setSaving(true)
    try {
      const record = {
        user_id: userId,
        purchase_price: priceNum,
        purchase_date: purchaseDate,
        depreciation_type: method,
        salvage_value: salvageNum,
        prior_depreciation: priorNum,
      }
      if (loadedId) {
        record.id = loadedId
        record.updated_at = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('vehicle_depreciation')
        .upsert(record, { onConflict: 'id' })
        .select()
        .maybeSingle()
      if (error) throw error
      if (data) setLoadedId(data.id)
      setToast({ text: t('depreciation.saved'), type: 'success' })
    } catch (err) {
      setToast({ text: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg, color: theme.text,
    fontSize: '14px', outline: 'none',
  }
  const labelStyle = {
    fontSize: '12px', fontWeight: 600, color: theme.dim,
    marginBottom: '6px', display: 'block',
  }

  if (role === 'driver' && employmentType === 'w2') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          background: theme.card, border: '1px solid ' + theme.border,
          borderRadius: '12px', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'🚛'}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px' }}>
            {t('depreciation.w2Notice')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          color: '#fff', background: toast.type === 'success' ? '#22c55e' : '#ef4444',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.text}
        </div>
      )}
      <div style={card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
          {'🚛 '}{t('depreciation.title')}
        </div>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('depreciation.purchasePrice')} ($)</label>
            <input type="number" inputMode="decimal" value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.purchaseDate')}</label>
            <input type="date" value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.method')}</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
              <option value="section179">{t('depreciation.section179')}</option>
              <option value="macrs5">{t('depreciation.macrs5')}</option>
              <option value="macrs7">{t('depreciation.macrs7')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.salvageValue')} ($)</label>
            <input type="number" inputMode="decimal" value={salvageValue}
              onChange={e => setSalvageValue(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.priorDepreciation')} ($)</label>
            <input type="number" inputMode="decimal" value={priorDepreciation}
              onChange={e => setPriorDepreciation(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </div>
      </div>
      {schedule.length > 0 && (
        <div style={{
          ...card, textAlign: 'center',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ color: theme.dim, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {t('depreciation.currentYearDeduction')} ({currentYear})
          </div>
          <div style={{ color: '#f59e0b', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            ${fmt(currentYearDeduction)}
          </div>
          {method === 'section179' && (
            <div style={{ color: theme.dim, fontSize: '11px', marginTop: '4px' }}>
              {t('depreciation.section179Limit')}: ${fmt(LEGACY_SECTION_179_LIMIT)}
            </div>
          )}
        </div>
      )}
      {schedule.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {t('depreciation.totalDeducted')}
            </div>
            <div style={{ color: '#ef4444', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace' }}>
              ${fmt(totalDeducted)}
            </div>
          </div>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {t('depreciation.remainingCol')}
            </div>
            <div style={{ color: '#3b82f6', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace' }}>
              ${fmt(Math.max(priceNum - salvageNum - totalDeducted, 0))}
            </div>
          </div>
        </div>
      )}
      {schedule.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t('depreciation.yearSchedule')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', padding: '8px 0', borderBottom: '2px solid ' + theme.border }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim }}>{t('depreciation.yearCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.rateCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.deductionCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.remainingCol')}</div>
          </div>
          {schedule.map(row => {
            const isCurrent = row.year === currentYear
            return (
              <div key={row.year} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', padding: '8px 0',
                borderBottom: '1px solid ' + theme.border,
                background: isCurrent ? 'rgba(245,158,11,0.1)' : 'transparent',
              }}>
                <div style={{ fontSize: '13px', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#f59e0b' : theme.text }}>
                  {row.year} {isCurrent ? '←' : ''}
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : theme.text, fontWeight: isCurrent ? 700 : 400 }}>
                  {row.rate}%
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : '#ef4444', fontWeight: isCurrent ? 700 : 600 }}>
                  ${fmt(row.deduction)}
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : theme.dim, fontWeight: isCurrent ? 700 : 400 }}>
                  ${fmt(row.remaining)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {schedule.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'🚛'}</div>
          <div style={{ fontSize: '13px', color: theme.dim }}>{t('depreciation.noData')}</div>
        </div>
      )}
      <button
        disabled={saving || priceNum <= 0 || !purchaseDate}
        onClick={handleSave}
        style={{
          padding: '14px', borderRadius: '10px', border: 'none',
          background: (saving || priceNum <= 0 || !purchaseDate) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: (saving || priceNum <= 0 || !purchaseDate) ? theme.dim : '#fff',
          fontSize: '14px', fontWeight: 600,
          cursor: (saving || priceNum <= 0 || !purchaseDate) ? 'default' : 'pointer',
          opacity: (saving || priceNum <= 0 || !purchaseDate) ? 0.7 : 1,
        }}
      >
        {t('depreciation.save')}
      </button>
    </div>
  )
}

// =============================================================================
// Owner-Operator depreciation — new flow with Section 179, Bonus, comparison table.
// =============================================================================
const STRATEGY_LABELS = {
  [STRATEGY.STANDARD_MACRS]: { titleKey: 'strategyStandardMacrs', descKey: 'strategyStandardMacrsDesc' },
  [STRATEGY.SECTION_179]: { titleKey: 'strategySection179', descKey: 'strategySection179Desc' },
  [STRATEGY.SECTION_179_BONUS]: { titleKey: 'strategyS179Bonus', descKey: 'strategyS179BonusDesc' },
  [STRATEGY.BONUS_ONLY]: { titleKey: 'strategyBonusOnly', descKey: 'strategyBonusOnlyDesc' },
}

function OwnerDepreciation({ userId, stateOfResidence }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  // Classification fields.
  const [gvwr, setGvwr] = useState('80000')
  const [vehicleType, setVehicleType] = useState('tractor_unit')
  const [primaryUse, setPrimaryUse] = useState('otr')
  const [assetClass, setAssetClass] = useState(ASSET_CLASS.SEMI_TRACTOR_OTR)
  const [assetClassTouched, setAssetClassTouched] = useState(false)

  // Core inputs.
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [salvageValue, setSalvageValue] = useState('0')
  const [businessUsePct, setBusinessUsePct] = useState('100')
  const [estimatedTaxableIncome, setEstimatedTaxableIncome] = useState('')
  const [filingStatus, setFilingStatus] = useState('single')

  // Strategy inputs.
  const [strategy, setStrategy] = useState(STRATEGY.STANDARD_MACRS)
  const [section179Amount, setSection179Amount] = useState('')

  // Persistence state.
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [showForm3115Banner, setShowForm3115Banner] = useState(false)

  const currentYear = new Date().getFullYear()
  const placedInServiceDate = purchaseDate ? new Date(purchaseDate + 'T00:00:00Z') : null
  const autoBonusRate = placedInServiceDate ? getBonusRate(placedInServiceDate) : 0

  // Auto-suggest asset class unless user explicitly picked one.
  useEffect(() => {
    if (assetClassTouched) return
    const suggested = suggestAssetClass({ gvwrLbs: Number(gvwr), vehicleType, primaryUse })
    setAssetClass(suggested)
  }, [gvwr, vehicleType, primaryUse, assetClassTouched])

  // Load filing status from user settings.
  useEffect(() => {
    if (!userId) return
    supabase
      .from('estimated_tax_settings')
      .select('filing_status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.filing_status) setFilingStatus(data.filing_status)
      })
      .catch(() => {})
  }, [userId])

  // Load existing depreciation record (if any).
  useEffect(() => {
    if (!userId) return
    supabase
      .from('vehicle_depreciation')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setPurchasePrice(String(data.purchase_price || ''))
        setPurchaseDate(data.purchase_date || '')
        setSalvageValue(String(data.salvage_value || 0))
        setLoadedId(data.id)
        if (data.asset_class) {
          setAssetClass(data.asset_class)
          setAssetClassTouched(true)
        }
        if (data.gvwr_lbs != null) setGvwr(String(data.gvwr_lbs))
        if (data.vehicle_type) setVehicleType(data.vehicle_type)
        if (data.primary_use) setPrimaryUse(data.primary_use)
        if (data.business_use_pct != null) setBusinessUsePct(String(data.business_use_pct))
        if (data.estimated_taxable_income != null) setEstimatedTaxableIncome(String(data.estimated_taxable_income))
        if (data.strategy) setStrategy(data.strategy)
        if (data.section_179_amount != null) setSection179Amount(String(data.section_179_amount))

        // Form 3115 banner: show if this is a legacy record (no strategy yet) but might
        // benefit from reclassification. Existing asset — user cannot just change method.
        const hasLegacyMethod = !data.strategy && data.depreciation_type
        const placedYearsAgo = data.purchase_date
          ? currentYear - new Date(data.purchase_date).getUTCFullYear()
          : 0
        if (hasLegacyMethod && placedYearsAgo >= 1) {
          setShowForm3115Banner(true)
        }
      })
      .catch(() => {})
  }, [userId, currentYear])

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const priceNum = Number(purchasePrice) || 0
  const salvageNum = Number(salvageValue) || 0
  const businessUseNum = Math.min(Math.max(Number(businessUsePct) || 0, 0), 100)
  const taxableIncomeNum = Number(estimatedTaxableIncome) || 0
  const s179Input = Math.max(Number(section179Amount) || 0, 0)

  // Section 179 phase-out applies if total qualifying purchases > $4.09M.
  // For a solo OP buying one truck this is the truck's own cost.
  const s179Cap = Math.min(
    priceNum,
    getSection179Limit(priceNum),
  )
  const s179Effective = Math.min(s179Input, s179Cap)
  const s179IncomeLimited = Math.min(s179Effective, Math.max(taxableIncomeNum, 0))
  const s179ExceedsIncome = s179Effective > s179IncomeLimited && taxableIncomeNum > 0

  const businessUseEligible = businessUseNum >= SECTION_179_2026.businessUseMinPct
  const midQuarter = needsMidQuarterConvention(placedInServiceDate)

  // Tax helper: compute (federal + SE + state) tax on a given net profit.
  const taxOfNet = useMemo(() => (
    (net) => calculateTotalTax(Math.max(net, 0), filingStatus, stateOfResidence || null)
  ), [filingStatus, stateOfResidence])

  // User's current marginal federal rate (highest bracket entered on estimated taxable income).
  const marginalFederalRate = useMemo(() => {
    if (taxableIncomeNum <= 0) return 0
    const res = taxOfNet(taxableIncomeNum)
    const last = res.bracketBreakdown?.[res.bracketBreakdown.length - 1]
    return last ? last.rate : 0
  }, [taxableIncomeNum, taxOfNet])

  // Comparison of all 4 strategies.
  const comparison = useMemo(() => {
    if (priceNum <= 0 || !purchaseDate) return []
    return compareStrategies({
      assetClass,
      costBasis: priceNum,
      salvageValue: salvageNum,
      section179Amount: s179Effective,
      bonusRate: autoBonusRate,
      placedInServiceDate,
      businessUsePct: businessUseNum,
      taxOfNet,
      netProfitBeforeDeduction: taxableIncomeNum,
    })
  }, [priceNum, purchaseDate, salvageNum, s179Effective, autoBonusRate, placedInServiceDate, businessUseNum, assetClass, taxOfNet, taxableIncomeNum])

  // Recommended strategy (honest heuristic — not financial advice).
  const recommended = useMemo(() => recommendStrategy({
    costBasis: priceNum,
    estimatedTaxableIncome: taxableIncomeNum,
    placedInServiceDate,
    businessUsePct: businessUseNum,
  }), [priceNum, taxableIncomeNum, placedInServiceDate, businessUseNum])

  // Active strategy schedule (what the user has selected).
  const activeSchedule = useMemo(() => {
    if (priceNum <= 0 || !purchaseDate) return { schedule: [], year1: 0, totalOverLife: 0 }
    return buildStrategySchedule({
      strategy,
      assetClass,
      costBasis: priceNum,
      salvageValue: salvageNum,
      section179Amount: strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS ? s179Effective : 0,
      bonusRate: strategy === STRATEGY.BONUS_ONLY || strategy === STRATEGY.SECTION_179_BONUS ? autoBonusRate : 0,
      placedInServiceDate,
      businessUsePct: businessUseNum,
    })
  }, [strategy, assetClass, priceNum, purchaseDate, salvageNum, s179Effective, autoBonusRate, placedInServiceDate, businessUseNum])

  const deductedToDate = activeSchedule.schedule
    .filter(r => r.year < currentYear)
    .reduce((s, r) => s + r.deduction, 0)
  const plannedFuture = activeSchedule.schedule
    .filter(r => r.year > currentYear)
    .reduce((s, r) => s + r.deduction, 0)
  const currentYearRow = activeSchedule.schedule.find(r => r.year === currentYear)
  const currentYearDeduction = currentYearRow?.deduction || 0

  // Validation.
  const s179Blocked = !businessUseEligible && (strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS)
  const s179TooMuch = s179Input > priceNum && priceNum > 0
  const canSave = priceNum > 0 && purchaseDate && !s179TooMuch && !s179Blocked

  const handleSave = async () => {
    if (!userId || !canSave) return
    setSaving(true)
    try {
      // Map the chosen strategy back to a legacy depreciation_type for any downstream
      // code still reading that column. Helpers introduced alongside this flow prefer
      // the `strategy` column when present.
      const legacyType = strategy === STRATEGY.STANDARD_MACRS
        ? (ASSET_CLASS_TO_RECOVERY_PERIOD[assetClass] === 3 ? 'macrs3' : 'macrs5')
        : 'section179'
      const record = {
        user_id: userId,
        purchase_price: priceNum,
        purchase_date: purchaseDate,
        salvage_value: salvageNum,
        prior_depreciation: 0,
        depreciation_type: legacyType,
        asset_class: assetClass,
        strategy,
        section_179_amount: strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS ? s179Effective : 0,
        bonus_rate: strategy === STRATEGY.BONUS_ONLY || strategy === STRATEGY.SECTION_179_BONUS ? autoBonusRate : 0,
        business_use_pct: businessUseNum,
        gvwr_lbs: Number(gvwr) || null,
        vehicle_type: vehicleType,
        primary_use: primaryUse,
        estimated_taxable_income: taxableIncomeNum || null,
      }
      if (loadedId) {
        record.id = loadedId
        record.updated_at = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('vehicle_depreciation')
        .upsert(record, { onConflict: 'id' })
        .select()
        .maybeSingle()
      if (error) throw error
      if (data) setLoadedId(data.id)
      setToast({ text: t('depreciation.saved'), type: 'success' })
    } catch (err) {
      setToast({ text: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg, color: theme.text,
    fontSize: '14px', outline: 'none',
  }
  const labelStyle = {
    fontSize: '12px', fontWeight: 600, color: theme.dim,
    marginBottom: '6px', display: 'block',
  }
  const hintStyle = { fontSize: '11px', color: theme.dim, marginTop: '4px' }
  const sectionTitle = {
    fontSize: '13px', fontWeight: 700, color: theme.text,
    marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          color: '#fff', background: toast.type === 'success' ? '#22c55e' : '#ef4444',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.text}
        </div>
      )}

      {/* Title */}
      <div style={card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
          {'🚛 '}{t('depreciation.title')}
        </div>
      </div>

      {/* Form 3115 banner — existing asset reclassification warning */}
      {showForm3115Banner && (
        <div style={{
          ...card,
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.3)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', marginBottom: '6px' }}>
            {'ℹ️ '}{t('depreciation.form3115Title')}
          </div>
          <div style={{ fontSize: '12px', color: theme.text, lineHeight: '1.5' }}>
            {t('depreciation.form3115Banner')}
          </div>
        </div>
      )}

      {/* Asset classification */}
      <div style={card}>
        <div style={sectionTitle}>{t('depreciation.classificationTitle')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('depreciation.gvwrLabel')}</label>
            <input type="number" inputMode="numeric" value={gvwr}
              onChange={e => setGvwr(e.target.value)} placeholder="80000" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.vehicleTypeLabel')}</label>
            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
              <option value="tractor_unit">{t('depreciation.vehicleTypeTractor')}</option>
              <option value="straight_truck">{t('depreciation.vehicleTypeStraightTruck')}</option>
              <option value="trailer">{t('depreciation.vehicleTypeTrailer')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.primaryUseLabel')}</label>
            <select value={primaryUse} onChange={e => setPrimaryUse(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
              <option value="otr">{t('depreciation.primaryUseOtr')}</option>
              <option value="regional">{t('depreciation.primaryUseRegional')}</option>
              <option value="local">{t('depreciation.primaryUseLocal')}</option>
              <option value="other">{t('depreciation.primaryUseOther')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.assetClassLabel')}</label>
            <select value={assetClass} onChange={e => { setAssetClass(e.target.value); setAssetClassTouched(true) }} style={{ ...inputStyle, fontWeight: 600 }}>
              <option value={ASSET_CLASS.SEMI_TRACTOR_OTR}>{t('depreciation.assetClassSemiTractorOtr')}</option>
              <option value={ASSET_CLASS.LIGHT_TRUCK}>{t('depreciation.assetClassLightTruck')}</option>
              <option value={ASSET_CLASS.HEAVY_TRUCK_NON_TRACTOR}>{t('depreciation.assetClassHeavyTruckNonTractor')}</option>
              <option value={ASSET_CLASS.TRAILER}>{t('depreciation.assetClassTrailer')}</option>
            </select>
            {assetClass === ASSET_CLASS.SEMI_TRACTOR_OTR && (
              <div style={hintStyle}>{t('depreciation.assetClassSuggestion')}</div>
            )}
          </div>
        </div>
      </div>

      {/* Core inputs */}
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('depreciation.purchasePrice')} ($)</label>
            <input type="number" inputMode="decimal" value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.purchaseDate')}</label>
            <input type="date" value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
            {autoBonusRate > 0 && purchaseDate && (
              <div style={hintStyle}>
                {t('depreciation.bonusRateLabel')}: <strong>{Math.round(autoBonusRate * 100)}%</strong> — {t('depreciation.bonusRateExplained')}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.salvageValue')} ($)</label>
            <input type="number" inputMode="decimal" value={salvageValue}
              onChange={e => setSalvageValue(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.businessUsePct')}</label>
            <input type="number" inputMode="decimal" min="0" max="100" value={businessUsePct}
              onChange={e => setBusinessUsePct(e.target.value)} placeholder="100" style={inputStyle} />
            <div style={hintStyle}>{t('depreciation.businessUseHint')}</div>
          </div>
          <div>
            <label style={labelStyle}>{t('depreciation.taxableIncomeLabel')}</label>
            <input type="number" inputMode="decimal" value={estimatedTaxableIncome}
              onChange={e => setEstimatedTaxableIncome(e.target.value)} placeholder="0" style={inputStyle} />
            <div style={hintStyle}>
              {t('depreciation.taxableIncomeHint')}
              {marginalFederalRate > 0 && (
                <> — {Math.round(marginalFederalRate)}% {t('depreciation.filingStatusLabel').toLowerCase()}</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {!businessUseEligible && (
        <div style={{
          ...card,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
            {'⚠ '}{t('depreciation.errorSection179BusinessUse')}
          </div>
        </div>
      )}
      {midQuarter && (
        <div style={{
          ...card,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>
            {'⚠ '}{t('depreciation.warnMidQuarter')}
          </div>
        </div>
      )}
      {s179ExceedsIncome && (strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS) && (
        <div style={{
          ...card,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>
            {'⚠ '}{t('depreciation.warnSection179OverIncome')}
          </div>
        </div>
      )}

      {/* Strategy selector */}
      {priceNum > 0 && purchaseDate && (
        <div style={card}>
          <div style={sectionTitle}>{t('depreciation.strategyTitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
            {Object.keys(STRATEGY_LABELS).map(key => {
              const isActive = strategy === key
              const isRecommended = recommended.key === key
              const locked = (key === STRATEGY.SECTION_179 || key === STRATEGY.SECTION_179_BONUS) && !businessUseEligible
              return (
                <button
                  key={key}
                  disabled={locked}
                  onClick={() => setStrategy(key)}
                  style={{
                    textAlign: 'left',
                    padding: '14px',
                    borderRadius: '10px',
                    border: isActive ? '2px solid #f59e0b' : '1px solid ' + theme.border,
                    background: isActive ? 'rgba(245,158,11,0.08)' : theme.bg,
                    color: theme.text,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.5 : 1,
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>
                      {t('depreciation.' + STRATEGY_LABELS[key].titleKey)}
                    </div>
                    {isRecommended && (
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e' }}>
                        {t('depreciation.recommended')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.dim }}>
                    {t('depreciation.' + STRATEGY_LABELS[key].descKey)}
                  </div>
                </button>
              )
            })}
          </div>
          {recommended && (
            <div style={{ ...hintStyle, marginTop: '12px' }}>
              {t('depreciation.' + recommended.reasonKey)}
            </div>
          )}
        </div>
      )}

      {/* Section 179 amount slider */}
      {priceNum > 0 && (strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS) && businessUseEligible && (
        <div style={card}>
          <label style={labelStyle}>
            {t('depreciation.section179Amount')}: <strong style={{ color: theme.text }}>${fmtInt(s179Effective)}</strong>
          </label>
          <input
            type="range"
            min="0"
            max={Math.floor(Math.min(priceNum, SECTION_179_2026.maxDeduction))}
            step="1000"
            value={Math.min(s179Input, priceNum)}
            onChange={e => setSection179Amount(e.target.value)}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
          <div style={{ ...hintStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('depreciation.section179Max2026')}</span>
            <span>{t('depreciation.section179PhaseOut')}</span>
          </div>
          {s179TooMuch && (
            <div style={{ ...hintStyle, color: '#ef4444', marginTop: '8px' }}>
              {'✗ '}{t('depreciation.errorSection179TooMuch')}
            </div>
          )}
        </div>
      )}

      {/* Comparison table */}
      {comparison.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>{t('depreciation.compareTitle')}</div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr',
            gap: '4px', padding: '8px 0',
            borderBottom: '2px solid ' + theme.border,
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: theme.dim }}>
              {t('depreciation.compareStrategy')}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>
              {t('depreciation.compareYear1')}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>
              {t('depreciation.compareYear1Savings')}
            </div>
          </div>
          {comparison.map(item => {
            const isRecommended = recommended.key === item.key
            const isActive = strategy === item.key
            return (
              <div key={item.key} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr',
                gap: '4px', padding: '10px 0',
                borderBottom: '1px solid ' + theme.border,
                background: isActive ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}>
                <div style={{ fontSize: '12px', color: theme.text, fontWeight: isRecommended ? 700 : 400 }}>
                  {t('depreciation.' + STRATEGY_LABELS[item.key].titleKey)}
                  {isRecommended && <span style={{ color: '#22c55e', marginLeft: '6px' }}>★</span>}
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', textAlign: 'right', color: '#ef4444' }}>
                  ${fmtInt(item.year1)}
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', textAlign: 'right', color: '#22c55e' }}>
                  ${fmtInt(item.year1TaxSavings)}
                </div>
              </div>
            )
          })}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr',
            gap: '4px', padding: '8px 0',
            borderTop: '2px solid ' + theme.border,
            marginTop: '6px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: theme.dim }}>
              {t('depreciation.compareY3Cumulative')} / {t('depreciation.compareY3Savings')}
            </div>
          </div>
          {comparison.map(item => (
            <div key={'y3-' + item.key} style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr',
              gap: '4px', padding: '6px 0',
              borderBottom: '1px solid ' + theme.border,
            }}>
              <div style={{ fontSize: '11px', color: theme.dim }}>
                {t('depreciation.' + STRATEGY_LABELS[item.key].titleKey)}
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', color: theme.text }}>
                ${fmtInt(item.year3Cumulative)}
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', color: '#22c55e' }}>
                ${fmtInt(item.year3TaxSavings)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deduction breakdown (Bug #2 fix): today vs future vs total */}
      {activeSchedule.schedule.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {t('depreciation.deductedToDate')}
            </div>
            <div style={{ color: '#ef4444', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
              ${fmtInt(deductedToDate)}
            </div>
          </div>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {t('depreciation.plannedFutureDeductions')}
            </div>
            <div style={{ color: '#3b82f6', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
              ${fmtInt(plannedFuture)}
            </div>
          </div>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {t('depreciation.totalOverLife')}
            </div>
            <div style={{ color: theme.text, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
              ${fmtInt(activeSchedule.totalOverLife)}
            </div>
          </div>
        </div>
      )}

      {/* Current-year callout */}
      {activeSchedule.schedule.length > 0 && currentYearDeduction > 0 && (
        <div style={{
          ...card, textAlign: 'center',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ color: theme.dim, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {t('depreciation.currentYearDeduction')} ({currentYear})
          </div>
          <div style={{ color: '#f59e0b', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            ${fmt(currentYearDeduction)}
          </div>
        </div>
      )}

      {/* Schedule table */}
      {activeSchedule.schedule.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>{t('depreciation.yearSchedule')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', padding: '8px 0', borderBottom: '2px solid ' + theme.border }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim }}>{t('depreciation.yearCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.rateCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.deductionCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.remainingCol')}</div>
          </div>
          {activeSchedule.schedule.map(row => {
            const isCurrent = row.year === currentYear
            return (
              <div key={row.year} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', padding: '8px 0',
                borderBottom: '1px solid ' + theme.border,
                background: isCurrent ? 'rgba(245,158,11,0.1)' : 'transparent',
              }}>
                <div style={{ fontSize: '13px', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#f59e0b' : theme.text }}>
                  {row.year} {isCurrent ? '←' : ''}
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : theme.text, fontWeight: isCurrent ? 700 : 400 }}>
                  {row.rate.toFixed(2)}%
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : '#ef4444', fontWeight: isCurrent ? 700 : 600 }}>
                  ${fmt(row.deduction)}
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', textAlign: 'right', color: isCurrent ? '#f59e0b' : theme.dim, fontWeight: isCurrent ? 700 : 400 }}>
                  ${fmt(row.remaining)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* No-data hint */}
      {activeSchedule.schedule.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'🚛'}</div>
          <div style={{ fontSize: '13px', color: theme.dim }}>{t('depreciation.noData')}</div>
        </div>
      )}

      {/* Disclaimer + trade-in note */}
      <div style={{ ...card, fontSize: '11px', color: theme.dim, lineHeight: '1.5' }}>
        <div style={{ marginBottom: '8px' }}>{t('depreciation.warnTradeIn')}</div>
        <div>{'⚠ '}{t('depreciation.disclaimer')}</div>
      </div>

      {/* Save */}
      <button
        disabled={saving || !canSave}
        onClick={handleSave}
        style={{
          padding: '14px', borderRadius: '10px', border: 'none',
          background: (saving || !canSave) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: (saving || !canSave) ? theme.dim : '#fff',
          fontSize: '14px', fontWeight: 600,
          cursor: (saving || !canSave) ? 'default' : 'pointer',
          opacity: (saving || !canSave) ? 0.7 : 1,
        }}
      >
        {t('depreciation.save')}
      </button>
    </div>
  )
}

// =============================================================================
// Router — branch by role. Owner-Operator gets the new flow; everyone else keeps
// the legacy flow exactly as it was.
// =============================================================================
export default function DepreciationTab({ userId, role, userVehicles, employmentType, profile, stateOfResidence }) {
  if (role === 'owner_operator') {
    const state = stateOfResidence || profile?.state_of_residence || null
    return <OwnerDepreciation userId={userId} stateOfResidence={state} />
  }
  return <LegacyDepreciation userId={userId} role={role} userVehicles={userVehicles} employmentType={employmentType} />
}
