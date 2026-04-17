import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { fetchTrips, fetchBytExpenses } from '../lib/api'
import { exportToExcel, exportToPDF } from '../utils/export'

function fmt(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(Number(n)).toLocaleString('en-US')
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtShortDate(ds) {
  if (!ds) return ''
  const s = ds.slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return s
  return `${parts[2]}.${parts[1]}`
}

export default function MySalary({ userId, profile, onBack, onOpenProfile }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const units = getUnits()
  const isImperial = units === 'imperial'
  const distLabel = isImperial ? 'mi' : 'km'

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')
  const [trips, setTrips] = useState([])
  const [bytExps, setBytExps] = useState([])

  const getDateRange = useCallback(() => {
    const now = new Date()
    if (period === 'custom' && customFrom && customTo) {
      return { start: customFrom, end: customTo }
    }
    if (period === 'week') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      return { start: toLocalDate(start), end: toLocalDate(now) }
    }
    const months = { month: 1, '3m': 3, '6m': 6, year: 12 }[period] || 1
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    return { start: toLocalDate(start), end: toLocalDate(now) }
  }, [period, customFrom, customTo])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [_trips, _byt] = await Promise.all([
        fetchTrips(userId),
        fetchBytExpenses(userId),
      ])
      const { start, end } = getDateRange()
      const inRange = (d) => {
        if (!d) return false
        const s = d.slice(0, 10)
        return s >= start && s <= end
      }
      setTrips(_trips.filter(x => inRange(x.created_at)))
      setBytExps(_byt.filter(x => inRange(x.date)))
    } catch (err) {
      console.error('MySalary load error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, getDateRange])

  useEffect(() => { load() }, [load])

  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)

  const totalIncome = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const totalDriverPay = trips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
  const totalDist = trips.reduce((s, tr) => s + convDist(tr.distance_km || 0), 0)
  const personalCost = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const netToMe = totalDriverPay - personalCost

  const payType = profile?.pay_type || 'none'
  const payRate = profile?.pay_rate != null ? profile.pay_rate : null

  const paymentTypeLabel = (() => {
    if (payType === 'percent' && payRate != null) {
      return t('mySalary.paymentPercent').replace('{rate}', String(payRate))
    }
    if (payType === 'per_mile' && payRate != null) {
      const tpl = isImperial ? t('mySalary.paymentPerMile') : t('mySalary.paymentPerKm')
      return tpl.replace('{rate}', String(payRate))
    }
    if (payType === 'fixed' && payRate != null) {
      return t('mySalary.paymentFixed').replace('{rate}', String(payRate))
    }
    return null
  })()

  const tripsRows = trips.map(tr => ({
    date: (tr.created_at || '').slice(0, 10),
    from: tr.origin || '',
    to: tr.destination || '',
    distance: convDist(tr.distance_km || 0),
    income: tr.income || 0,
    driverPay: tr.driver_pay || 0,
  }))

  const tripsColumns = [
    { header: t('excel.date') || 'Date', key: 'date' },
    { header: t('trips.from') || 'From', key: 'from' },
    { header: t('trips.to') || 'To', key: 'to' },
    { header: `${t('trips.distance') || 'Distance'} (${distLabel})`, key: 'distance' },
    { header: `${t('mySalary.tripIncome') || 'Trip income'} (${cs})`, key: 'income' },
    { header: `${t('mySalary.mySalary') || 'My salary'} (${cs})`, key: 'driverPay' },
  ]

  const runExport = async (key, fn) => {
    if (exporting) return
    setExporting(key)
    try {
      await fn()
    } catch (err) {
      console.error('Export error:', err)
      alert(t('common.error') || 'Error')
    } finally {
      setExporting('')
    }
  }

  const doSalaryExcel = () => runExport('salary_excel', () => exportToExcel(
    tripsRows, tripsColumns,
    `my_salary_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doSalaryPdf = () => runExport('salary_pdf', () => exportToPDF(
    tripsRows.map(r => ({ ...r, distance: String(r.distance), income: fmt(r.income), driverPay: fmt(r.driverPay) })),
    tripsColumns,
    t('mySalary.title') || 'My salary',
    `my_salary_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  const cardStyle = {
    background: theme.card,
    borderRadius: 16,
    padding: 14,
    border: `1px solid ${theme.border}`,
    marginBottom: 10,
  }

  const periods = [
    { key: 'week', label: t('overview.periodWeek') },
    { key: 'month', label: t('overview.periodMonth') },
    { key: '3m', label: '3 ' + t('overview.financeMonths') },
    { key: '6m', label: '6 ' + t('overview.financeMonths') },
    { key: 'year', label: t('overview.financeYear') },
    { key: 'custom', label: t('overview.customPeriod') },
  ]

  const salaryEmpty = trips.length === 0

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: theme.text,
            fontSize: 22, cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
          }}
        >
          {'\u2190'}
        </button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{'\ud83d\udcb0'} {t('mySalary.title')}</div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: period === 'custom' ? 8 : 12 }}>
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              flex: 1, minWidth: 48, padding: '8px 4px', border: 'none', borderRadius: 10,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: period === p.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.bg,
              color: period === p.key ? '#fff' : theme.dim,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: theme.dim, marginBottom: 4 }}>{t('overview.dateFrom')}</div>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: theme.dim, marginBottom: 4 }}>{t('overview.dateTo')}</div>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* 3-card summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: theme.dim }}>{t('pay.earnedMonth')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>
                {fmt(totalDriverPay)}
              </div>
              <div style={{ fontSize: 11, color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: theme.dim }}>{t('byt.personalExpenses')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
                {fmt(personalCost)}
              </div>
              <div style={{ fontSize: 11, color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: theme.dim }}>{t('pay.netToMe')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: netToMe >= 0 ? '#22c55e' : '#ef4444', marginTop: 4 }}>
                {netToMe >= 0 ? '+' : ''}{fmt(netToMe)}
              </div>
              <div style={{ fontSize: 11, color: theme.dim }}>{cs}</div>
            </div>
          </div>

          {/* Payment type block */}
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: theme.dim, marginBottom: 6 }}>{t('mySalary.paymentType')}</div>
            {paymentTypeLabel ? (
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{paymentTypeLabel}</div>
            ) : (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.dim, marginBottom: 8 }}>
                  {t('mySalary.paymentNotSet')}
                </div>
                {onOpenProfile && (
                  <button
                    onClick={onOpenProfile}
                    style={{
                      padding: '8px 14px', border: '1px solid ' + theme.border, borderRadius: 10,
                      background: 'transparent', color: '#f59e0b',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('mySalary.configureInProfile')} {'\u2192'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Breakdown by trips */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 10 }}>
              {t('mySalary.detailsByTrip')}
            </div>
            {salaryEmpty ? (
              <div style={{ textAlign: 'center', color: theme.dim, fontSize: 13, padding: '16px 0' }}>
                {t('mySalary.noTrips')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 4px', color: theme.dim, fontWeight: 600 }}>{t('excel.date') || 'Date'}</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', color: theme.dim, fontWeight: 600 }}>{t('excel.route') || 'Route'}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: theme.dim, fontWeight: 600 }}>{distLabel}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: theme.dim, fontWeight: 600 }}>{t('mySalary.tripIncome')}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: theme.dim, fontWeight: 600 }}>{t('mySalary.mySalary')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripsRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '8px 4px', color: theme.text, whiteSpace: 'nowrap' }}>{fmtShortDate(r.date)}</td>
                        <td style={{ padding: '8px 4px', color: theme.text }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: 130 }}>
                            {r.from || '\u2014'} {'\u2192'} {r.to || '\u2014'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 4px', color: theme.text, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.distance)}</td>
                        <td style={{ padding: '8px 4px', color: '#22c55e', textAlign: 'right', fontFamily: 'monospace' }}>{cs}{fmt(r.income)}</td>
                        <td style={{ padding: '8px 4px', color: '#f59e0b', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{cs}{fmt(r.driverPay)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${theme.border}` }}>
                      <td style={{ padding: '10px 4px', color: theme.text, fontWeight: 700 }} colSpan={2}>{t('excel.total') || 'TOTAL'}</td>
                      <td style={{ padding: '10px 4px', color: theme.text, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(totalDist)}</td>
                      <td style={{ padding: '10px 4px', color: '#22c55e', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{cs}{fmt(totalIncome)}</td>
                      <td style={{ padding: '10px 4px', color: '#f59e0b', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{cs}{fmt(totalDriverPay)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={doSalaryExcel}
              disabled={!!exporting || salaryEmpty}
              style={{
                flex: 1, padding: '12px 6px', border: 'none', borderRadius: 12,
                background: (exporting || salaryEmpty) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: (salaryEmpty && !exporting) ? theme.dim : '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: (exporting || salaryEmpty) ? 'default' : 'pointer',
                opacity: exporting === 'salary_excel' ? 0.7 : 1,
              }}
            >
              {exporting === 'salary_excel' ? '\u23f3' : '\ud83d\udcca'} Excel
            </button>
            <button
              onClick={doSalaryPdf}
              disabled={!!exporting || salaryEmpty}
              style={{
                flex: 1, padding: '12px 6px', border: 'none', borderRadius: 12,
                background: (exporting || salaryEmpty) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: (salaryEmpty && !exporting) ? theme.dim : '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: (exporting || salaryEmpty) ? 'default' : 'pointer',
                opacity: exporting === 'salary_pdf' ? 0.7 : 1,
              }}
            >
              {exporting === 'salary_pdf' ? '\u23f3' : '\ud83d\udcc4'} PDF
            </button>
          </div>

          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}
