// Annual Tax Summary (Schedule C) — yearly income/expense report for owner-operators
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { calculatePerDiem } from '../utils/perDiemCalculator'

const SE_TAX_RATE = 15.3
const DEFAULT_INCOME_TAX_RATE = 22

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildYearOptions() {
  const cur = new Date().getFullYear()
  return [cur, cur - 1, cur - 2]
}

function yearDateRange(year) {
  return [`${year}-01-01`, `${year}-12-31`]
}

export default function TaxSummaryTab({ userId, role, userVehicles, employmentType }) {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()

  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState(null)

  // Data
  const [income, setIncome] = useState(0)
  const [fuelExpenses, setFuelExpenses] = useState(0)
  const [repairsExpenses, setRepairsExpenses] = useState(0)
  const [insuranceExpenses, setInsuranceExpenses] = useState(0)
  const [leaseExpenses, setLeaseExpenses] = useState(0)
  const [tollExpenses, setTollExpenses] = useState(0)
  const [parkingExpenses, setParkingExpenses] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  const [perDiemTotal, setPerDiemTotal] = useState(0)
  const [depreciation, setDepreciation] = useState('')

  // Tax settings
  const [taxRate, setTaxRate] = useState(DEFAULT_INCOME_TAX_RATE)

  const yearOptions = useMemo(() => buildYearOptions(), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // Load tax rate from settings
  useEffect(() => {
    if (!userId) return
    supabase
      .from('estimated_tax_settings')
      .select('income_tax_rate')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data: s }) => {
        if (s && s.income_tax_rate != null) setTaxRate(s.income_tax_rate)
      })
      .catch(() => {})
  }, [userId])

  // Load annual data
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const [start] = yearDateRange(year)
    const endPlusOne = `${year + 1}-01-01`

    // Per diem for all 4 quarters
    const perDiemPromises = [1, 2, 3, 4].map(q =>
      calculatePerDiem({ supabase, userId, role, quarter: q, year })
        .catch(() => ({ totals: { total_amount: 0 } }))
    )

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

      // Vehicle expenses (with category)
      supabase
        .from('vehicle_expenses')
        .select('amount, category')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne)
        .then(r => r)
        .catch(() => ({ data: [] })),

      // Service records (repairs & maintenance)
      supabase
        .from('service_records')
        .select('cost')
        .eq('user_id', userId)
        .gte('date', start)
        .lt('date', endPlusOne),

      // Per diem all quarters
      ...perDiemPromises,
    ])
      .then(([tripsRes, fuelRes, vehExpRes, serviceRes, ...perDiemResults]) => {
        if (cancelled) return

        const totalIncome = (tripsRes.data || []).reduce((s, r) => s + (r.income || 0), 0)
        const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
        const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)

        // Break down vehicle_expenses by category
        const vehData = vehExpRes.data || []
        let insurance = 0, lease = 0, toll = 0, parking = 0, other = 0
        for (const e of vehData) {
          const amt = e.amount || 0
          const cat = (e.category || '').toLowerCase()
          if (cat === 'insurance') insurance += amt
          else if (cat === 'lease' || cat === 'truck_payment') lease += amt
          else if (cat === 'toll') toll += amt
          else if (cat === 'parking') parking += amt
          else other += amt
        }

        // Sum per diem across all quarters
        const pdTotal = perDiemResults.reduce((s, r) => s + (r?.totals?.total_amount || 0), 0)

        setIncome(totalIncome)
        setFuelExpenses(fuelCost)
        setRepairsExpenses(serviceCost)
        setInsuranceExpenses(insurance)
        setLeaseExpenses(lease)
        setTollExpenses(toll)
        setParkingExpenses(parking)
        setOtherExpenses(other)
        setPerDiemTotal(pdTotal)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId, role, year])

  // Calculations
  const depreciationNum = Number(depreciation) || 0
  const totalExpenses = fuelExpenses + repairsExpenses + insuranceExpenses + leaseExpenses + tollExpenses + parkingExpenses + otherExpenses
  const totalDeductions = totalExpenses + perDiemTotal + depreciationNum
  const netProfit = income - totalDeductions
  const positiveNet = Math.max(netProfit, 0)
  const seTax = positiveNet * (SE_TAX_RATE / 100)
  const incomeTax = positiveNet * (taxRate / 100)
  const totalTax = seTax + incomeTax

  const expenseLines = [
    { key: 'fuel', label: t('taxSummary.fuel'), value: fuelExpenses },
    { key: 'repairs', label: t('taxSummary.repairs'), value: repairsExpenses },
    { key: 'insurance', label: t('taxSummary.insurance'), value: insuranceExpenses },
    { key: 'lease', label: t('taxSummary.lease'), value: leaseExpenses },
    { key: 'tolls', label: t('taxSummary.tolls'), value: tollExpenses },
    { key: 'parking', label: t('taxSummary.parking'), value: parkingExpenses },
    { key: 'other', label: t('taxSummary.otherExpenses'), value: otherExpenses },
  ]

  // Export PDF
  const handleExportPdf = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { generateTaxSummaryPdf } = await import('../utils/taxSummaryPdfExport.js')
      await generateTaxSummaryPdf({
        year,
        income,
        expenses: expenseLines,
        perDiem: perDiemTotal,
        depreciation: depreciationNum,
        totalExpenses,
        totalDeductions,
        netProfit,
        seTax,
        seTaxRate: SE_TAX_RATE,
        incomeTax,
        incomeTaxRate: taxRate,
        totalTax,
        language: lang,
        companyName: null,
      })
      setToast({ text: 'PDF \u2713', type: 'success' })
    } catch (err) {
      setToast({ text: err.message, type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  // Export Excel
  const handleExportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { exportTaxSummaryExcel } = await import('../utils/taxSummaryPdfExport.js')
      exportTaxSummaryExcel({
        year,
        income,
        expenses: expenseLines,
        perDiem: perDiemTotal,
        depreciation: depreciationNum,
        totalExpenses,
        totalDeductions,
        netProfit,
        seTax,
        seTaxRate: SE_TAX_RATE,
        incomeTax,
        incomeTaxRate: taxRate,
        totalTax,
        language: lang,
      })
      setToast({ text: 'Excel \u2713', type: 'success' })
    } catch (err) {
      setToast({ text: err.message, type: 'error' })
    } finally {
      setExporting(false)
    }
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
            {t('taxSummary.w2Notice')}
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

      {/* Title + Year selector */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
            {'\uD83D\uDCCA '}{t('taxSummary.title')}
          </div>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={selectStyle}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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

      {!loading && !error && (
        <>
          {/* INCOME */}
          <div style={{
            ...card, textAlign: 'center',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}>
            <div style={{
              color: theme.dim, fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('taxSummary.grossIncome')}</div>
            <div style={{
              color: '#22c55e', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace',
            }}>${fmt(income)}</div>
          </div>

          {/* EXPENSES — Schedule C breakdown */}
          <div style={card}>
            <div style={{
              fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '12px',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {t('taxSummary.expensesScheduleC')}
            </div>
            {expenseLines.map(line => (
              <div key={line.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid ' + theme.border,
              }}>
                <span style={{ fontSize: '13px', color: theme.text }}>{line.label}</span>
                <span style={{
                  fontSize: '14px', fontWeight: 600, fontFamily: 'monospace',
                  color: line.value > 0 ? '#ef4444' : theme.dim,
                }}>${fmt(line.value)}</span>
              </div>
            ))}
            {/* Total expenses */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0 0',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text }}>
                {t('taxSummary.totalExpenses')}
              </span>
              <span style={{
                fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444',
              }}>${fmt(totalExpenses)}</span>
            </div>
          </div>

          {/* Per Diem + Depreciation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>Per Diem</div>
              <div style={{
                color: '#3b82f6', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(perDiemTotal)}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '6px',
              }}>{t('taxSummary.depreciation')}</div>
              <input
                type="number"
                inputMode="decimal"
                value={depreciation}
                onChange={e => setDepreciation(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 8px', borderRadius: '8px',
                  border: '1px solid ' + theme.border,
                  background: theme.bg, color: '#f59e0b',
                  fontSize: '15px', fontWeight: 700, fontFamily: 'monospace',
                  textAlign: 'center', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* NET PROFIT */}
          <div style={{
            ...card, textAlign: 'center',
            background: netProfit >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: '1px solid ' + (netProfit >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'),
          }}>
            <div style={{
              color: theme.dim, fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('taxSummary.netProfit')}</div>
            <div style={{
              color: netProfit >= 0 ? '#22c55e' : '#ef4444',
              fontSize: '24px', fontWeight: 700, fontFamily: 'monospace',
            }}>
              {netProfit < 0 ? '-' : ''}${fmt(Math.abs(netProfit))}
            </div>
            <div style={{ color: theme.dim, fontSize: '11px', marginTop: '4px' }}>
              {t('taxSummary.netFormula')}
            </div>
          </div>

          {/* Tax breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('taxSummary.seTax')} (15.3%)</div>
              <div style={{
                color: '#f59e0b', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(seTax)}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{
                color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '4px',
              }}>{t('taxSummary.incomeTax')} ({taxRate}%)</div>
              <div style={{
                color: '#f59e0b', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
              }}>${fmt(incomeTax)}</div>
            </div>
          </div>

          {/* Total estimated tax */}
          <div style={{
            ...card, textAlign: 'center',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
          }}>
            <div style={{
              color: theme.dim, fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('taxSummary.estimatedTotalTax')}</div>
            <div style={{
              color: '#f59e0b', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace',
            }}>${fmt(totalTax)}</div>
          </div>

          {/* Export buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              disabled={exporting}
              onClick={handleExportPdf}
              style={{
                padding: '14px', borderRadius: '10px', border: 'none',
                background: exporting ? theme.border : 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: exporting ? theme.dim : '#fff',
                fontSize: '13px', fontWeight: 600,
                cursor: exporting ? 'default' : 'pointer',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {'\uD83D\uDCC4 '}{t('taxSummary.exportPdf')}
            </button>
            <button
              disabled={exporting}
              onClick={handleExportExcel}
              style={{
                padding: '14px', borderRadius: '10px', border: 'none',
                background: exporting ? theme.border : 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: exporting ? theme.dim : '#fff',
                fontSize: '13px', fontWeight: 600,
                cursor: exporting ? 'default' : 'pointer',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {'\uD83D\uDCCA '}{t('taxSummary.exportExcel')}
            </button>
          </div>

          {/* Info note */}
          <div style={{
            fontSize: '11px', color: theme.dim, lineHeight: '1.5',
            padding: '8px 4px', textAlign: 'center',
          }}>
            {t('taxSummary.note')}
          </div>
        </>
      )}
    </div>
  )
}
