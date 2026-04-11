// Truck Depreciation Calculator — Section 179 / MACRS 5-year / MACRS 7-year
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

const SECTION_179_LIMIT = 1160000 // 2024 limit

const MACRS_5 = [20, 32, 19.2, 11.52, 11.52, 5.76]
const MACRS_7 = [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildSchedule(method, purchasePrice, salvageValue, priorDepreciation, purchaseYear) {
  const depreciableBasis = Math.max(purchasePrice - salvageValue, 0)
  const rows = []

  if (method === 'section179') {
    const deduction = Math.min(depreciableBasis, SECTION_179_LIMIT) - priorDepreciation
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

export default function DepreciationTab({ userId, role, userVehicles, employmentType }) {
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

  // Load existing record
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
    return buildSchedule(method, priceNum, salvageNum, priorNum, purchaseYear)
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

  // W-2 driver stub
  if (role === 'driver' && employmentType === 'w2') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          background: theme.card, border: '1px solid ' + theme.border,
          borderRadius: '12px', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDE9B'}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px' }}>
            {t('depreciation.w2Notice')}
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

      {/* Title */}
      <div style={card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
          {'\uD83D\uDE9B '}{t('depreciation.title')}
        </div>
      </div>

      {/* Form */}
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Purchase Price */}
          <div>
            <label style={labelStyle}>{t('depreciation.purchasePrice')} ($)</label>
            <input
              type="number" inputMode="decimal"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>

          {/* Purchase Date */}
          <div>
            <label style={labelStyle}>{t('depreciation.purchaseDate')}</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Method */}
          <div>
            <label style={labelStyle}>{t('depreciation.method')}</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ ...inputStyle, fontWeight: 600 }}
            >
              <option value="section179">{t('depreciation.section179')}</option>
              <option value="macrs5">{t('depreciation.macrs5')}</option>
              <option value="macrs7">{t('depreciation.macrs7')}</option>
            </select>
          </div>

          {/* Salvage Value */}
          <div>
            <label style={labelStyle}>{t('depreciation.salvageValue')} ($)</label>
            <input
              type="number" inputMode="decimal"
              value={salvageValue}
              onChange={e => setSalvageValue(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>

          {/* Prior Depreciation */}
          <div>
            <label style={labelStyle}>{t('depreciation.priorDepreciation')} ($)</label>
            <input
              type="number" inputMode="decimal"
              value={priorDepreciation}
              onChange={e => setPriorDepreciation(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Current year deduction highlight */}
      {schedule.length > 0 && (
        <div style={{
          ...card, textAlign: 'center',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{
            color: theme.dim, fontSize: '10px', textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: '4px',
          }}>{t('depreciation.currentYearDeduction')} ({currentYear})</div>
          <div style={{
            color: '#f59e0b', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace',
          }}>${fmt(currentYearDeduction)}</div>
          {method === 'section179' && (
            <div style={{ color: theme.dim, fontSize: '11px', marginTop: '4px' }}>
              {t('depreciation.section179Limit')}: ${fmt(SECTION_179_LIMIT)}
            </div>
          )}
        </div>
      )}

      {/* Total deducted */}
      {schedule.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{
              color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('depreciation.totalDeducted')}</div>
            <div style={{
              color: '#ef4444', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
            }}>${fmt(totalDeducted)}</div>
          </div>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{
              color: theme.dim, fontSize: '9px', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '4px',
            }}>{t('depreciation.remainingCol')}</div>
            <div style={{
              color: '#3b82f6', fontSize: '17px', fontWeight: 700, fontFamily: 'monospace',
            }}>${fmt(Math.max(priceNum - salvageNum - totalDeducted, 0))}</div>
          </div>
        </div>
      )}

      {/* Schedule table */}
      {schedule.length > 0 && (
        <div style={card}>
          <div style={{
            fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '12px',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {t('depreciation.yearSchedule')}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: '4px', padding: '8px 0',
            borderBottom: '2px solid ' + theme.border,
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim }}>{t('depreciation.yearCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.rateCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.deductionCol')}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.dim, textAlign: 'right' }}>{t('depreciation.remainingCol')}</div>
          </div>

          {/* Table rows */}
          {schedule.map(row => {
            const isCurrent = row.year === currentYear
            return (
              <div key={row.year} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: '4px', padding: '8px 0',
                borderBottom: '1px solid ' + theme.border,
                background: isCurrent ? 'rgba(245,158,11,0.1)' : 'transparent',
                borderRadius: isCurrent ? '6px' : '0',
                marginLeft: isCurrent ? '-4px' : 0,
                marginRight: isCurrent ? '-4px' : 0,
                paddingLeft: isCurrent ? '4px' : 0,
                paddingRight: isCurrent ? '4px' : 0,
              }}>
                <div style={{
                  fontSize: '13px', fontWeight: isCurrent ? 700 : 400,
                  color: isCurrent ? '#f59e0b' : theme.text,
                }}>
                  {row.year} {isCurrent ? '\u2190' : ''}
                </div>
                <div style={{
                  fontSize: '13px', fontFamily: 'monospace', textAlign: 'right',
                  color: isCurrent ? '#f59e0b' : theme.text,
                  fontWeight: isCurrent ? 700 : 400,
                }}>{row.rate}%</div>
                <div style={{
                  fontSize: '13px', fontFamily: 'monospace', textAlign: 'right',
                  color: isCurrent ? '#f59e0b' : '#ef4444',
                  fontWeight: isCurrent ? 700 : 600,
                }}>${fmt(row.deduction)}</div>
                <div style={{
                  fontSize: '13px', fontFamily: 'monospace', textAlign: 'right',
                  color: isCurrent ? '#f59e0b' : theme.dim,
                  fontWeight: isCurrent ? 700 : 400,
                }}>${fmt(row.remaining)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* No data hint */}
      {schedule.length === 0 && (
        <div style={{
          ...card, textAlign: 'center', padding: '32px 16px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDE9B'}</div>
          <div style={{ fontSize: '13px', color: theme.dim }}>
            {t('depreciation.noData')}
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        disabled={saving || priceNum <= 0 || !purchaseDate}
        onClick={handleSave}
        style={{
          padding: '14px', borderRadius: '10px', border: 'none',
          background: (saving || priceNum <= 0 || !purchaseDate)
            ? theme.border
            : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: (saving || priceNum <= 0 || !purchaseDate) ? theme.dim : '#fff',
          fontSize: '14px', fontWeight: 600,
          cursor: (saving || priceNum <= 0 || !purchaseDate) ? 'default' : 'pointer',
          opacity: (saving || priceNum <= 0 || !purchaseDate) ? 0.7 : 1,
        }}
      >
        {t('depreciation.save')}
      </button>

      {/* Info note */}
      <div style={{
        fontSize: '11px', color: theme.dim, lineHeight: '1.5',
        padding: '8px 4px', textAlign: 'center',
      }}>
        {t('legal.taxDisclaimer')}
      </div>
    </div>
  )
}
