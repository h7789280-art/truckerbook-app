import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol } from '../lib/i18n'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchVehicleExpenses } from '../lib/api'

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

const MONTH_NAMES_RU = [
  '\u042f\u043d\u0432', '\u0424\u0435\u0432', '\u041c\u0430\u0440',
  '\u0410\u043f\u0440', '\u041c\u0430\u0439', '\u0418\u044e\u043d',
  '\u0418\u044e\u043b', '\u0410\u0432\u0433', '\u0421\u0435\u043d',
  '\u041e\u043a\u0442', '\u041d\u043e\u044f', '\u0414\u0435\u043a',
]

const MONTH_NAMES_FULL_RU = [
  '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
  '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
  '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
  '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
]

export default function FinanceDetails({ userId, onBack }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [monthlyData, setMonthlyData] = useState([])
  const [expenseBreakdown, setExpenseBreakdown] = useState([])
  const [tooltip, setTooltip] = useState(null)
  const chartRef = useRef(null)

  const getMonthCount = () => {
    switch (period) {
      case 'month': return 1
      case '3m': return 3
      case '6m': return 6
      case 'year': return 12
      default: return 0
    }
  }

  const getDateRange = useCallback(() => {
    const now = new Date()
    if (period === 'custom' && customFrom && customTo) {
      return { start: customFrom, end: customTo }
    }
    const months = getMonthCount() || 12
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    return {
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    }
  }, [period, customFrom, customTo])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [fuels, trips, bytExps, serviceRecs, vehicleExps] = await Promise.all([
        fetchFuels(userId),
        fetchTrips(userId),
        fetchBytExpenses(userId),
        fetchServiceRecords(userId).catch(() => []),
        fetchVehicleExpenses(userId).catch(() => []),
      ])

      const { start, end } = getDateRange()

      const inRange = (dateStr) => {
        if (!dateStr) return false
        const d = dateStr.slice(0, 10)
        return d >= start && d <= end
      }

      const rangeFuels = fuels.filter(e => inRange(e.date))
      const rangeTrips = trips.filter(e => inRange(e.created_at))
      const rangeByt = bytExps.filter(e => inRange(e.date))
      const rangeService = serviceRecs.filter(e => inRange(e.date))
      const rangeVehicleExp = vehicleExps.filter(e => inRange(e.date))

      // Determine grouping mode based on period
      const startDate = new Date(start)
      const endDate = new Date(end)
      const diffDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
      let groupMode = 'month' // default
      if (period === 'month') {
        groupMode = 'day'
      } else if (period === '3m') {
        groupMode = 'week'
      } else if (period === 'custom') {
        groupMode = diffDays < 62 ? 'day' : 'month'
      }
      // '6m' and 'year' stay as 'month'

      const getGroupKey = (dateStr) => {
        if (!dateStr) return null
        const d = dateStr.slice(0, 10)
        if (groupMode === 'day') {
          return d // YYYY-MM-DD
        } else if (groupMode === 'week') {
          const dt = new Date(d)
          const day = dt.getDay()
          const monday = new Date(dt)
          monday.setDate(dt.getDate() - ((day + 6) % 7))
          return monday.toISOString().slice(0, 10) // Monday of the week
        }
        return d.slice(0, 7) // YYYY-MM
      }

      const dataMap = {}

      const addToGroup = (dateStr, field, value) => {
        const key = getGroupKey(dateStr)
        if (!key) return
        if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0 }
        dataMap[key][field] += value || 0
      }

      rangeTrips.forEach(t => addToGroup(t.created_at, 'income', t.income || 0))
      rangeFuels.forEach(e => addToGroup(e.date, 'expense', e.cost || 0))
      rangeByt.forEach(e => addToGroup(e.date, 'expense', e.amount || 0))
      rangeService.forEach(e => addToGroup(e.date, 'expense', e.cost || 0))
      rangeVehicleExp.forEach(e => addToGroup(e.date, 'expense', e.amount || 0))

      // Fill gaps
      const keys = Object.keys(dataMap).sort()
      if (groupMode === 'day') {
        const cur = new Date(start)
        const endD = new Date(end)
        while (cur <= endD) {
          const k = cur.toISOString().slice(0, 10)
          if (!dataMap[k]) dataMap[k] = { income: 0, expense: 0 }
          cur.setDate(cur.getDate() + 1)
        }
      } else if (groupMode === 'week') {
        if (keys.length > 0) {
          const cur = new Date(keys[0])
          const last = new Date(keys[keys.length - 1])
          while (cur <= last) {
            const k = cur.toISOString().slice(0, 10)
            if (!dataMap[k]) dataMap[k] = { income: 0, expense: 0 }
            cur.setDate(cur.getDate() + 7)
          }
        }
      } else {
        // month - fill missing months
        if (keys.length > 0) {
          const [sy, sm] = keys[0].split('-').map(Number)
          const [ey, em] = keys[keys.length - 1].split('-').map(Number)
          let y = sy, m = sm
          while (y < ey || (y === ey && m <= em)) {
            const k = `${y}-${String(m).padStart(2, '0')}`
            if (!dataMap[k]) dataMap[k] = { income: 0, expense: 0 }
            m++
            if (m > 12) { m = 1; y++ }
          }
        }
      }

      const getLabel = (key) => {
        if (groupMode === 'day') {
          const d = new Date(key)
          return String(d.getDate())
        } else if (groupMode === 'week') {
          const d = new Date(key)
          const day = d.getDate()
          const mo = MONTH_NAMES_RU[d.getMonth()]
          return `${day} ${mo}`
        }
        const mo = Number(key.split('-')[1])
        return MONTH_NAMES_RU[mo - 1]
      }

      const getFullLabel = (key) => {
        if (groupMode === 'day') {
          const d = new Date(key)
          return `${d.getDate()} ${MONTH_NAMES_FULL_RU[d.getMonth()]} ${d.getFullYear()}`
        } else if (groupMode === 'week') {
          const d = new Date(key)
          const endW = new Date(d)
          endW.setDate(d.getDate() + 6)
          return `${d.getDate()} ${MONTH_NAMES_RU[d.getMonth()]} \u2013 ${endW.getDate()} ${MONTH_NAMES_RU[endW.getMonth()]}`
        }
        const [yr, mo] = key.split('-').map(Number)
        return MONTH_NAMES_FULL_RU[mo - 1] + ' ' + yr
      }

      const sorted = Object.entries(dataMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => ({
          key,
          label: getLabel(key),
          fullLabel: getFullLabel(key),
          income: vals.income,
          expense: vals.expense,
          profit: vals.income - vals.expense,
        }))

      setMonthlyData(sorted)

      // Expense breakdown for donut
      const fuelCost = rangeFuels.reduce((s, e) => s + (e.cost || 0), 0)
      const serviceCost = rangeService.reduce((s, e) => s + (e.cost || 0), 0)
      const vehicleExpCost = rangeVehicleExp.reduce((s, e) => s + (e.amount || 0), 0)
      const bytByCategory = {}
      rangeByt.forEach(e => {
        const cat = e.category || 'other'
        bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
      })

      const breakdown = []
      if (fuelCost > 0) breakdown.push({ label: t('overview.fuelShort'), value: fuelCost, color: '#f59e0b' })
      if (serviceCost > 0) breakdown.push({ label: t('overview.repairShort'), value: serviceCost, color: '#ef4444' })
      if (vehicleExpCost > 0) breakdown.push({ label: t('overview.vehicleShort'), value: vehicleExpCost, color: '#8b5cf6' })
      if (bytByCategory.food) breakdown.push({ label: t('overview.foodShort'), value: bytByCategory.food, color: '#22c55e' })
      if (bytByCategory.hotel) breakdown.push({ label: t('overview.housingShort'), value: bytByCategory.hotel, color: '#3b82f6' })
      const otherByt = Object.entries(bytByCategory)
        .filter(([k]) => k !== 'food' && k !== 'hotel')
        .reduce((s, [, v]) => s + v, 0)
      if (otherByt > 0) breakdown.push({ label: t('overview.otherShort'), value: otherByt, color: '#06b6d4' })
      setExpenseBreakdown(breakdown)
    } catch (err) {
      console.error('FinanceDetails loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, getDateRange, t])

  useEffect(() => { loadData() }, [loadData])

  const cardStyle = {
    background: theme.card,
    borderRadius: '16px',
    padding: '16px',
    border: `1px solid ${theme.border}`,
  }

  const dimText = { fontSize: '12px', color: theme.dim }

  const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0)
  const totalExpense = monthlyData.reduce((s, m) => s + m.expense, 0)
  const totalProfit = totalIncome - totalExpense

  // Chart dimensions
  const chartW = 340
  const chartH = 180
  const padL = 10
  const padR = 10
  const padT = 20
  const padB = 30

  const maxVal = Math.max(
    ...monthlyData.map(m => m.income),
    ...monthlyData.map(m => m.expense),
    1
  )

  const getX = (i) => {
    if (monthlyData.length <= 1) return padL + (chartW - padL - padR) / 2
    return padL + (i / (monthlyData.length - 1)) * (chartW - padL - padR)
  }
  const getY = (val) => padT + (1 - val / maxVal) * (chartH - padT - padB)

  const buildLine = (field) => {
    return monthlyData.map((m, i) => {
      const x = getX(i)
      const y = getY(m[field])
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')
  }

  const buildArea = (field) => {
    if (monthlyData.length === 0) return ''
    const baseline = getY(0)
    const line = monthlyData.map((m, i) => {
      const x = getX(i)
      const y = getY(m[field])
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')
    const lastX = getX(monthlyData.length - 1)
    const firstX = getX(0)
    return `${line} L${lastX},${baseline} L${firstX},${baseline} Z`
  }

  const handleChartClick = (e) => {
    if (!chartRef.current || monthlyData.length === 0) return
    const rect = chartRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const scaleX = chartW / rect.width
    const svgX = clickX * scaleX

    let closest = 0
    let minDist = Infinity
    monthlyData.forEach((_, i) => {
      const dist = Math.abs(getX(i) - svgX)
      if (dist < minDist) { minDist = dist; closest = i }
    })

    if (minDist < 30) {
      const m = monthlyData[closest]
      setTooltip(tooltip?.index === closest ? null : {
        index: closest,
        x: getX(closest),
        income: m.income,
        expense: m.expense,
        label: m.fullLabel,
      })
    } else {
      setTooltip(null)
    }
  }

  const periods = [
    { key: 'month', label: t('overview.month') || '\u041c\u0435\u0441' },
    { key: '3m', label: '3 ' + (t('overview.financeMonths') || '\u043c\u0435\u0441') },
    { key: '6m', label: '6 ' + (t('overview.financeMonths') || '\u043c\u0435\u0441') },
    { key: 'year', label: t('overview.financeYear') || '\u0413\u043e\u0434' },
    { key: 'custom', label: t('overview.customPeriod') || '\u041f\u0435\u0440\u0438\u043e\u0434' },
  ]

  // Donut chart
  const renderDonut = () => {
    if (expenseBreakdown.length === 0) return null
    const donutTotal = expenseBreakdown.reduce((s, e) => s + e.value, 0)
    const radius = 50
    const strokeWidth = 14
    const circumference = 2 * Math.PI * radius
    let cumulativeOffset = 0
    const segments = expenseBreakdown.map(e => {
      const pct = e.value / donutTotal
      const dashLen = pct * circumference
      const offset = cumulativeOffset
      cumulativeOffset += dashLen
      return { ...e, pct, dashLen, offset }
    })

    return (
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '12px' }}>{t('overview.expenses')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
            <svg viewBox="0 0 120 120" width="120" height="120">
              {segments.map((seg, i) => (
                <circle
                  key={i}
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
                  strokeDashoffset={-seg.offset}
                  transform="rotate(-90 60 60)"
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '10px', color: theme.dim }}>{t('overview.total')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700 }}>
                {donutTotal >= 1000 ? `${Math.round(donutTotal / 1000)}k` : formatNumber(Math.round(donutTotal))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
            {segments.map((seg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: theme.dim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
                  {formatNumber(Math.round(seg.value))} {cs}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: theme.text,
            fontSize: '22px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '8px',
          }}
        >
          {'\u2190'}
        </button>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{t('overview.finances')}</div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: period === 'custom' ? '8px' : '16px', flexWrap: 'wrap' }}>
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              flex: 1,
              minWidth: '55px',
              padding: '8px 4px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              background: period === p.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.bg,
              color: period === p.key ? '#fff' : theme.dim,
              transition: 'all 0.2s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-start' }}>
          <div style={{ width: '48%' }}>
            <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px' }}>{t('overview.dateFrom') || '\u041e\u0442'}</div>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                color: theme.text,
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ width: '48%' }}>
            <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px' }}>{t('overview.dateTo') || '\u0414\u043e'}</div>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                color: theme.text,
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{t('overview.income')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#22c55e', marginTop: '4px' }}>
                {formatNumber(Math.round(totalIncome))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{t('overview.expense')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
                {formatNumber(Math.round(totalExpense))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{t('overview.netProfit')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: totalProfit >= 0 ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                {totalProfit >= 0 ? '+' : ''}{formatNumber(Math.round(totalProfit))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
          </div>

          {/* Line/Area chart */}
          {monthlyData.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '12px', padding: '12px' }}>
              <div style={{ ...dimText, marginBottom: '8px' }}>{t('overview.income')} / {t('overview.expense')}</div>
              <svg
                ref={chartRef}
                viewBox={`0 0 ${chartW} ${chartH}`}
                width="100%"
                style={{ overflow: 'visible', cursor: 'pointer' }}
                onClick={handleChartClick}
              >
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                  const y = padT + (1 - frac) * (chartH - padT - padB)
                  return (
                    <line key={frac} x1={padL} y1={y} x2={chartW - padR} y2={y}
                      stroke={theme.border} strokeWidth="0.5" strokeDasharray="4,4" />
                  )
                })}

                {/* Income area */}
                <path d={buildArea('income')} fill="#22c55e" fillOpacity="0.12" />
                {/* Expense area */}
                <path d={buildArea('expense')} fill="#ef4444" fillOpacity="0.12" />

                {/* Income line */}
                <path d={buildLine('income')} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {/* Expense line */}
                <path d={buildLine('expense')} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* Points */}
                {monthlyData.map((m, i) => (
                  <g key={i}>
                    <circle cx={getX(i)} cy={getY(m.income)} r="4" fill="#22c55e" stroke={theme.card} strokeWidth="1.5" />
                    <circle cx={getX(i)} cy={getY(m.expense)} r="4" fill="#ef4444" stroke={theme.card} strokeWidth="1.5" />
                  </g>
                ))}

                {/* X-axis labels */}
                {monthlyData.map((m, i) => {
                  const total = monthlyData.length
                  const step = total <= 8 ? 1 : total <= 16 ? 2 : total <= 24 ? 4 : 5
                  const showLabel = i % step === 0 || i === total - 1
                  if (!showLabel) return null
                  return (
                    <text key={i} x={getX(i)} y={chartH - 5} textAnchor="middle" fill={theme.dim} fontSize="10" fontFamily="sans-serif">
                      {m.label}
                    </text>
                  )
                })}

                {/* Tooltip */}
                {tooltip && (
                  <g>
                    <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={chartH - padB}
                      stroke={theme.dim} strokeWidth="1" strokeDasharray="3,3" />
                    <rect x={tooltip.x - 65} y={padT - 2} width="130" height="42" rx="6"
                      fill={theme.card} stroke={theme.border} strokeWidth="1" />
                    <text x={tooltip.x} y={padT + 14} textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="600" fontFamily="monospace">
                      +{formatNumber(Math.round(tooltip.income))} {cs}
                    </text>
                    <text x={tooltip.x} y={padT + 30} textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="600" fontFamily="monospace">
                      -{formatNumber(Math.round(tooltip.expense))} {cs}
                    </text>
                  </g>
                )}
              </svg>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '3px', borderRadius: '2px', background: '#22c55e' }} />
                  <span style={{ fontSize: '11px', color: theme.dim }}>{t('overview.income')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '3px', borderRadius: '2px', background: '#ef4444' }} />
                  <span style={{ fontSize: '11px', color: theme.dim }}>{t('overview.expense')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Monthly table */}
          {monthlyData.length > 0 && (() => {
            const nonEmptyRows = monthlyData.filter(m => m.income !== 0 || m.expense !== 0)
            return (
            <div style={{ ...cardStyle, marginBottom: '12px', padding: '12px' }}>
              <div style={{ ...dimText, marginBottom: '10px' }}>{t('overview.financeByPeriod') || t('overview.financeByMonth') || '\u0414\u0435\u0442\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f'}</div>
              {nonEmptyRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: theme.dim, fontSize: '13px' }}>
                  {t('overview.noDataForPeriod') || '\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434'}
                </div>
              ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 4px', color: theme.dim, fontWeight: 600, fontSize: '11px' }}>{t('overview.financePeriodCol') || t('overview.financeMonthCol') || '\u041f\u0435\u0440\u0438\u043e\u0434'}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: '#22c55e', fontWeight: 600, fontSize: '11px' }}>{t('overview.income')}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: '#ef4444', fontWeight: 600, fontSize: '11px' }}>{t('overview.expense')}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: theme.dim, fontWeight: 600, fontSize: '11px' }}>{t('overview.netProfit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmptyRows.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                        <td style={{ padding: '8px 4px', color: theme.text, fontSize: '12px' }}>{m.fullLabel}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#22c55e', fontSize: '12px' }}>
                          {formatNumber(Math.round(m.income))}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#ef4444', fontSize: '12px' }}>
                          {formatNumber(Math.round(m.expense))}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: m.profit >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px' }}>
                          {m.profit >= 0 ? '+' : ''}{formatNumber(Math.round(m.profit))}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: `2px solid ${theme.border}`, background: `${theme.border}33` }}>
                      <td style={{ padding: '8px 4px', color: theme.text, fontSize: '12px', fontWeight: 700 }}>
                        {t('overview.total') || '\u0418\u0442\u043e\u0433\u043e'}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#22c55e', fontSize: '12px', fontWeight: 700 }}>
                        {formatNumber(Math.round(totalIncome))}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>
                        {formatNumber(Math.round(totalExpense))}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: totalProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px' }}>
                        {totalProfit >= 0 ? '+' : ''}{formatNumber(Math.round(totalProfit))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              )}
            </div>
            )
          })()}

          {/* Donut */}
          {renderDonut()}
        </>
      )}
    </div>
  )
}
