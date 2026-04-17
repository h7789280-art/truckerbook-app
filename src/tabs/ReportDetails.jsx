import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import {
  fetchTrips, fetchFuels, fetchBytExpenses,
  fetchVehicleExpenses, fetchServiceRecords, getTireRecords,
} from '../lib/api'

// Utilities

function fmt(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(Number(n)).toLocaleString('en-US')
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateRangeFromPeriod(period, customFrom, customTo) {
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
}

// Shared period selector component
function PeriodSelector({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, theme, t }) {
  const periods = [
    { key: 'week', label: t('overview.periodWeek') },
    { key: 'month', label: t('overview.periodMonth') },
    { key: '3m', label: '3 ' + t('overview.financeMonths') },
    { key: '6m', label: '6 ' + t('overview.financeMonths') },
    { key: 'year', label: t('overview.financeYear') },
    { key: 'custom', label: t('overview.customPeriod') },
  ]
  return (
    <>
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
    </>
  )
}

function Header({ title, onBack, theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: theme.text,
        fontSize: 22, cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
      }}>{'\u2190'}</button>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
    </div>
  )
}

function SummaryCard({ label, value, color, cs, theme }) {
  return (
    <div style={{
      background: theme.card, borderRadius: 16, padding: '12px 8px',
      border: `1px solid ${theme.border}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: theme.dim }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color, marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: theme.dim }}>{cs}</div>
    </div>
  )
}

// Reusable donut chart
function Donut({ segments, theme, t, cs, title }) {
  if (!segments || segments.length === 0) return null
  const donutTotal = segments.reduce((s, e) => s + e.value, 0)
  if (donutTotal <= 0) return null
  const radius = 50
  const strokeWidth = 14
  const circumference = 2 * Math.PI * radius
  let cumulativeOffset = 0
  const prepared = segments.map(e => {
    const pct = e.value / donutTotal
    const dashLen = pct * circumference
    const offset = cumulativeOffset
    cumulativeOffset += dashLen
    return { ...e, pct, dashLen, offset }
  })
  return (
    <div style={{
      background: theme.card, borderRadius: 16, padding: 14,
      border: `1px solid ${theme.border}`, marginBottom: 10,
    }}>
      <div style={{ fontSize: 12, color: theme.dim, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            {prepared.map((seg, i) => (
              <circle key={i} cx="60" cy="60" r={radius} fill="none"
                stroke={seg.color} strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
                strokeDashoffset={-seg.offset}
                transform="rotate(-90 60 60)" strokeLinecap="butt" />
            ))}
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, color: theme.dim }}>{t('overview.total')}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>
              {donutTotal >= 1000 ? `${Math.round(donutTotal / 1000)}k` : fmt(donutTotal)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          {prepared.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: theme.dim, flex: 1, minWidth: 0 }}>{seg.label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {fmt(seg.value)} {cs}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Two-line area chart
function LineChart({ data, labels, colors, theme, cs, title }) {
  if (!data || data.length === 0) return null
  const W = 340, H = 180, padL = 10, padR = 10, padT = 20, padB = 30
  const seriesKeys = Object.keys(data[0]).filter(k => k !== 'key' && k !== 'label' && k !== 'fullLabel')
  const maxVal = Math.max(1, ...data.flatMap(d => seriesKeys.map(k => d[k] || 0)))
  const getX = (i) => data.length <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (data.length - 1)) * (W - padL - padR)
  const getY = (val) => padT + (1 - val / maxVal) * (H - padT - padB)
  const buildLine = (k) => data.map((m, i) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(m[k] || 0)}`).join(' ')
  const buildArea = (k) => {
    if (data.length === 0) return ''
    const baseline = getY(0)
    const line = buildLine(k)
    const lastX = getX(data.length - 1)
    const firstX = getX(0)
    return `${line} L${lastX},${baseline} L${firstX},${baseline} Z`
  }
  return (
    <div style={{
      background: theme.card, borderRadius: 16, padding: 12,
      border: `1px solid ${theme.border}`, marginBottom: 10,
    }}>
      <div style={{ fontSize: 12, color: theme.dim, marginBottom: 8 }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = padT + (1 - frac) * (H - padT - padB)
          return <line key={frac} x1={padL} y1={y} x2={W - padR} y2={y} stroke={theme.border} strokeWidth="0.5" strokeDasharray="4,4" />
        })}
        {seriesKeys.map((k, si) => (
          <g key={k}>
            <path d={buildArea(k)} fill={colors[si]} fillOpacity="0.12" />
            <path d={buildLine(k)} fill="none" stroke={colors[si]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((m, i) => (
              <circle key={i} cx={getX(i)} cy={getY(m[k] || 0)} r="3.5" fill={colors[si]} stroke={theme.card} strokeWidth="1.5" />
            ))}
          </g>
        ))}
        {data.map((m, i) => {
          const total = data.length
          const step = total <= 8 ? 1 : total <= 16 ? 2 : total <= 24 ? 4 : 5
          const showLabel = i % step === 0 || i === total - 1
          if (!showLabel) return null
          return (
            <text key={i} x={getX(i)} y={H - 5} textAnchor="middle" fill={theme.dim} fontSize="10" fontFamily="sans-serif">
              {m.label}
            </text>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
        {seriesKeys.map((k, si) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 3, borderRadius: 2, background: colors[si] }} />
            <span style={{ fontSize: 11, color: theme.dim }}>{labels[si]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Grouping helper
function groupByPeriod(period, start, end, records, keyMap) {
  // keyMap: { date: record => 'YYYY-MM-DD', field: record => number, series: 'income'|'expense'|... }
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diffDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
  let groupMode = 'month'
  if (period === 'week' || period === 'month') groupMode = 'day'
  else if (period === '3m') groupMode = 'week'
  else if (period === 'custom') groupMode = diffDays < 62 ? 'day' : 'month'

  const getGroupKey = (dateStr) => {
    if (!dateStr) return null
    const d = dateStr.slice(0, 10)
    if (groupMode === 'day') return d
    if (groupMode === 'week') {
      const dt = new Date(d)
      const day = dt.getDay()
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - ((day + 6) % 7))
      return monday.toISOString().slice(0, 10)
    }
    return d.slice(0, 7)
  }

  const map = {}
  records.forEach(rec => {
    const date = keyMap.date(rec)
    const key = getGroupKey(date)
    if (!key) return
    if (!map[key]) map[key] = { key }
    const v = keyMap.field(rec) || 0
    map[key][keyMap.series] = (map[key][keyMap.series] || 0) + v
  })

  // Fill gaps for day mode
  if (groupMode === 'day') {
    const cur = new Date(start)
    const endD = new Date(end)
    while (cur <= endD) {
      const k = cur.toISOString().slice(0, 10)
      if (!map[k]) map[k] = { key: k }
      cur.setDate(cur.getDate() + 1)
    }
  }

  return { map, groupMode }
}

function monthShortNames(t) { return t('expenses.monthNamesShort') || [] }
function monthFullNames(t) { return t('expenses.monthNames') || [] }

function labelForKey(key, groupMode, t) {
  if (groupMode === 'day') {
    const d = new Date(key)
    return String(d.getDate())
  }
  if (groupMode === 'week') {
    const d = new Date(key)
    const day = d.getDate()
    const mo = monthShortNames(t)[d.getMonth()]
    return `${day} ${mo}`
  }
  const mo = Number(key.split('-')[1])
  return monthShortNames(t)[mo - 1]
}

function fullLabelForKey(key, groupMode, t) {
  if (groupMode === 'day') {
    const d = new Date(key)
    return `${d.getDate()} ${monthFullNames(t)[d.getMonth()]} ${d.getFullYear()}`
  }
  if (groupMode === 'week') {
    const d = new Date(key)
    const endW = new Date(d)
    endW.setDate(d.getDate() + 6)
    const ss = monthShortNames(t)
    return `${d.getDate()} ${ss[d.getMonth()]} \u2013 ${endW.getDate()} ${ss[endW.getMonth()]}`
  }
  const [yr, mo] = key.split('-').map(Number)
  return monthFullNames(t)[mo - 1] + ' ' + yr
}

// Hook: fetch and filter all relevant records
function useReportData(userId, period, customFrom, customTo, sources) {
  const [state, setState] = useState({
    loading: true,
    trips: [],
    fuels: [],
    bytExps: [],
    vehicleExps: [],
    serviceRecs: [],
    tireRecs: [],
  })
  const sourcesKey = (sources || []).join(',')

  const load = useCallback(async () => {
    if (!userId) return
    setState(s => ({ ...s, loading: true }))
    try {
      const wanted = new Set(sources || [])
      const results = await Promise.all([
        wanted.has('trips') ? fetchTrips(userId).catch(() => []) : Promise.resolve([]),
        wanted.has('fuels') ? fetchFuels(userId).catch(() => []) : Promise.resolve([]),
        wanted.has('byt') ? fetchBytExpenses(userId).catch(() => []) : Promise.resolve([]),
        wanted.has('vexp') ? fetchVehicleExpenses(userId).catch(() => []) : Promise.resolve([]),
        wanted.has('service') ? fetchServiceRecords(userId).catch(() => []) : Promise.resolve([]),
        wanted.has('tires') ? getTireRecords(userId).catch(() => []) : Promise.resolve([]),
      ])
      const [trips, fuels, bytExps, vehicleExps, serviceRecs, tireRecs] = results
      const { start, end } = dateRangeFromPeriod(period, customFrom, customTo)
      const inRange = (d) => {
        if (!d) return false
        const s = d.slice(0, 10)
        return s >= start && s <= end
      }
      setState({
        loading: false,
        trips: trips.filter(x => inRange(x.created_at)),
        fuels: fuels.filter(x => inRange(x.date)),
        bytExps: bytExps.filter(x => inRange(x.date)),
        vehicleExps: vehicleExps.filter(x => inRange(x.date)),
        serviceRecs: serviceRecs.filter(x => inRange(x.date)),
        tireRecs: tireRecs.filter(x => inRange(x.installed_at)),
      })
    } catch (err) {
      console.error('ReportDetails load error:', err)
      setState(s => ({ ...s, loading: false }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, period, customFrom, customTo, sourcesKey])

  useEffect(() => { load() }, [load])

  return state
}

// =====================================================================
// 1. Business P&L Details
// =====================================================================
export function BusinessPnlDetails({ userId, onBack, initialPeriod, initialCustomFrom, initialCustomTo }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [period, setPeriod] = useState(initialPeriod || 'month')
  const [customFrom, setCustomFrom] = useState(initialCustomFrom || '')
  const [customTo, setCustomTo] = useState(initialCustomTo || '')

  const { loading, trips, fuels, vehicleExps, serviceRecs, tireRecs } =
    useReportData(userId, period, customFrom, customTo, ['trips', 'fuels', 'vexp', 'service', 'tires'])

  const income = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const fuelCost = fuels.reduce((s, f) => s + (f.cost || 0), 0)
  const serviceCost = serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const tireCost = tireRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const vexpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const vehicleTotal = fuelCost + serviceCost + tireCost + vexpCost
  const profit = income - vehicleTotal

  const range = dateRangeFromPeriod(period, customFrom, customTo)

  // Build series grouped by period
  const tripsGrp = groupByPeriod(period, range.start, range.end, trips, {
    date: r => r.created_at, field: r => r.income, series: 'income',
  })
  const fuelsGrp = groupByPeriod(period, range.start, range.end, fuels, {
    date: r => r.date, field: r => r.cost, series: 'vehicleExp',
  })
  const serviceGrp = groupByPeriod(period, range.start, range.end, serviceRecs, {
    date: r => r.date, field: r => r.cost, series: 'vehicleExp',
  })
  const tiresGrp = groupByPeriod(period, range.start, range.end, tireRecs, {
    date: r => r.installed_at, field: r => r.cost, series: 'vehicleExp',
  })
  const vexpGrp = groupByPeriod(period, range.start, range.end, vehicleExps, {
    date: r => r.date, field: r => r.amount, series: 'vehicleExp',
  })

  const allKeys = new Set([
    ...Object.keys(tripsGrp.map),
    ...Object.keys(fuelsGrp.map),
    ...Object.keys(serviceGrp.map),
    ...Object.keys(tiresGrp.map),
    ...Object.keys(vexpGrp.map),
  ])
  const groupMode = tripsGrp.groupMode
  const rows = Array.from(allKeys).sort().map(k => ({
    key: k,
    label: labelForKey(k, groupMode, t),
    fullLabel: fullLabelForKey(k, groupMode, t),
    income: (tripsGrp.map[k]?.income) || 0,
    vehicleExp:
      (fuelsGrp.map[k]?.vehicleExp || 0) +
      (serviceGrp.map[k]?.vehicleExp || 0) +
      (tiresGrp.map[k]?.vehicleExp || 0) +
      (vexpGrp.map[k]?.vehicleExp || 0),
  }))

  // Donut categories for vehicle expenses
  const vehicleExpByCat = {}
  if (fuelCost > 0) vehicleExpByCat[t('overview.fuelShort') || 'Fuel'] = { value: fuelCost, color: '#f59e0b' }
  vehicleExps.forEach(e => {
    const cat = categoryLabelForVexp(e.category, t)
    if (!vehicleExpByCat[cat]) vehicleExpByCat[cat] = { value: 0, color: colorForVexpCat(e.category) }
    vehicleExpByCat[cat].value += (e.amount || 0)
  })
  if (serviceCost > 0) vehicleExpByCat[t('overview.repairShort') || 'Repair'] = { value: serviceCost, color: '#ef4444' }
  if (tireCost > 0) vehicleExpByCat[t('overview.tiresShort') || 'Tires'] = { value: tireCost, color: '#64748b' }
  const vehicleSegments = Object.entries(vehicleExpByCat)
    .filter(([, v]) => v.value > 0)
    .map(([label, v]) => ({ label, value: v.value, color: v.color }))

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Header title={t('details.businessPnlTitle')} onBack={onBack} theme={theme} />
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        theme={theme} t={t}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SummaryCard label={t('overview.income')} value={fmt(income)} color="#22c55e" cs={cs} theme={theme} />
            <SummaryCard label={t('reports.vehicleExpenses')} value={fmt(vehicleTotal)} color="#ef4444" cs={cs} theme={theme} />
            <SummaryCard label={t('details.profitBusiness')} value={(profit >= 0 ? '+' : '') + fmt(profit)} color={profit >= 0 ? '#22c55e' : '#ef4444'} cs={cs} theme={theme} />
          </div>
          <LineChart
            data={rows}
            labels={[t('details.incomeChartLabel'), t('details.vehicleExpenseChartLabel')]}
            colors={['#22c55e', '#ef4444']}
            theme={theme} cs={cs}
            title={`${t('details.incomeChartLabel')} / ${t('details.vehicleExpenseChartLabel')}`}
          />
          <Donut segments={vehicleSegments} theme={theme} t={t} cs={cs} title={t('details.categoriesChartTitle')} />
          <PeriodTable
            rows={rows}
            columns={[
              { key: 'income', label: t('overview.income'), color: '#22c55e' },
              { key: 'vehicleExp', label: t('details.vehicleExpenseChartLabel'), color: '#ef4444' },
              { key: 'profit', label: t('details.profitBusiness'), profit: true, getter: (r) => r.income - r.vehicleExp },
            ]}
            totals={{ income, vehicleExp: vehicleTotal, profit }}
            theme={theme} t={t}
            title={t('details.businessByPeriod')}
          />
          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}

// =====================================================================
// 2. Net In Hand Details (owner_operator)
// =====================================================================
export function NetInHandDetails({ userId, onBack, initialPeriod, initialCustomFrom, initialCustomTo }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [period, setPeriod] = useState(initialPeriod || 'month')
  const [customFrom, setCustomFrom] = useState(initialCustomFrom || '')
  const [customTo, setCustomTo] = useState(initialCustomTo || '')

  const { loading, trips, fuels, bytExps, vehicleExps, serviceRecs, tireRecs } =
    useReportData(userId, period, customFrom, customTo, ['trips', 'fuels', 'byt', 'vexp', 'service', 'tires'])

  const income = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const vehicleTotal =
    fuels.reduce((s, f) => s + (f.cost || 0), 0) +
    serviceRecs.reduce((s, r) => s + (r.cost || 0), 0) +
    tireRecs.reduce((s, r) => s + (r.cost || 0), 0) +
    vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const businessProfit = income - vehicleTotal
  const personalTotal = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const netToMe = businessProfit - personalTotal

  const range = dateRangeFromPeriod(period, customFrom, customTo)

  // Build series: businessProfit vs personal per period
  const tripsGrp = groupByPeriod(period, range.start, range.end, trips, {
    date: r => r.created_at, field: r => r.income, series: 'income',
  })
  const fuelsGrp = groupByPeriod(period, range.start, range.end, fuels, {
    date: r => r.date, field: r => r.cost, series: 'vExp',
  })
  const serviceGrp = groupByPeriod(period, range.start, range.end, serviceRecs, {
    date: r => r.date, field: r => r.cost, series: 'vExp',
  })
  const tiresGrp = groupByPeriod(period, range.start, range.end, tireRecs, {
    date: r => r.installed_at, field: r => r.cost, series: 'vExp',
  })
  const vexpGrp = groupByPeriod(period, range.start, range.end, vehicleExps, {
    date: r => r.date, field: r => r.amount, series: 'vExp',
  })
  const bytGrp = groupByPeriod(period, range.start, range.end, bytExps, {
    date: r => r.date, field: r => r.amount, series: 'personal',
  })

  const allKeys = new Set([
    ...Object.keys(tripsGrp.map),
    ...Object.keys(fuelsGrp.map),
    ...Object.keys(serviceGrp.map),
    ...Object.keys(tiresGrp.map),
    ...Object.keys(vexpGrp.map),
    ...Object.keys(bytGrp.map),
  ])
  const groupMode = tripsGrp.groupMode
  const rows = Array.from(allKeys).sort().map(k => {
    const inc = (tripsGrp.map[k]?.income) || 0
    const vex =
      (fuelsGrp.map[k]?.vExp || 0) +
      (serviceGrp.map[k]?.vExp || 0) +
      (tiresGrp.map[k]?.vExp || 0) +
      (vexpGrp.map[k]?.vExp || 0)
    const per = (bytGrp.map[k]?.personal) || 0
    return {
      key: k,
      label: labelForKey(k, groupMode, t),
      fullLabel: fullLabelForKey(k, groupMode, t),
      business: inc - vex,
      personal: per,
    }
  })

  // Donut for personal expenses categories
  const personalByCat = {}
  bytExps.forEach(e => {
    const cat = categoryLabelForByt(e.category, t)
    const color = colorForBytCat(e.category)
    if (!personalByCat[cat]) personalByCat[cat] = { value: 0, color }
    personalByCat[cat].value += (e.amount || 0)
  })
  const personalSegments = Object.entries(personalByCat)
    .filter(([, v]) => v.value > 0)
    .map(([label, v]) => ({ label, value: v.value, color: v.color }))

  const rowCard = {
    background: theme.card, borderRadius: 16, padding: 14,
    border: `1px solid ${theme.border}`, marginBottom: 10,
  }
  const row = (label, amount, color, bold, large) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <div style={{ color: theme.dim, fontSize: large ? 14 : 13 }}>{label}</div>
      <div style={{
        fontFamily: 'monospace', fontSize: large ? 22 : 16, fontWeight: bold ? 700 : 500, color,
      }}>
        {cs}{fmt(amount)}
      </div>
    </div>
  )
  const sep = <div style={{ height: 1, background: theme.border, margin: '6px 0' }} />

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Header title={t('details.netInHandTitle')} onBack={onBack} theme={theme} />
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        theme={theme} t={t}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Block 1: Business */}
          <div style={rowCard}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              {t('details.businessSection')}
            </div>
            {row(t('overview.income'), income, '#22c55e')}
            {row('\u2212 ' + t('reports.vehicleExpenses'), vehicleTotal, '#ef4444')}
            {sep}
            {row('= ' + t('details.profitBusiness'), businessProfit, businessProfit >= 0 ? '#22c55e' : '#ef4444', true)}
          </div>

          {/* Block 2: Personal */}
          <div style={rowCard}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              {t('details.personalSection')}
            </div>
            {row(t('details.profitBusiness'), businessProfit, businessProfit >= 0 ? '#22c55e' : '#ef4444')}
            {row('\u2212 ' + t('reports.personalExpenses'), personalTotal, '#ef4444')}
            {sep}
            {row('= ' + t('details.netToMe'), netToMe, netToMe >= 0 ? '#22c55e' : '#ef4444', true, true)}
          </div>

          <LineChart
            data={rows}
            labels={[t('details.profitBusiness'), t('details.personalExpenseChartLabel')]}
            colors={['#22c55e', '#ef4444']}
            theme={theme} cs={cs}
            title={`${t('details.profitBusiness')} / ${t('details.personalExpenseChartLabel')}`}
          />
          <Donut segments={personalSegments} theme={theme} t={t} cs={cs} title={t('details.categoriesChartTitle')} />
          <PeriodTable
            rows={rows}
            columns={[
              { key: 'business', label: t('details.profitBusiness'), color: '#22c55e' },
              { key: 'personal', label: t('reports.personalExpenses'), color: '#ef4444' },
              { key: 'net', label: t('details.netToMe'), profit: true, getter: (r) => r.business - r.personal },
            ]}
            totals={{ business: businessProfit, personal: personalTotal, net: netToMe }}
            theme={theme} t={t}
            title={t('details.financeByPeriod')}
          />
          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}

// =====================================================================
// 3. Trips Details (with period filter)
// =====================================================================
export function TripsReportDetails({ userId, onBack, initialPeriod, initialCustomFrom, initialCustomTo }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const units = getUnits()
  const isImperial = units === 'imperial'
  const distLabel = isImperial ? 'mi' : 'km'
  const [period, setPeriod] = useState(initialPeriod || 'month')
  const [customFrom, setCustomFrom] = useState(initialCustomFrom || '')
  const [customTo, setCustomTo] = useState(initialCustomTo || '')

  const { loading, trips } = useReportData(userId, period, customFrom, customTo, ['trips'])
  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)

  const totalIncome = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const totalDist = trips.reduce((s, tr) => s + convDist(tr.distance_km || 0), 0)

  const fmtDate = (ds) => {
    if (!ds) return ''
    const d = new Date(ds)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const cardStyle = {
    background: theme.card, borderRadius: 14, padding: '14px 16px',
    border: '1px solid ' + theme.border, marginBottom: 8,
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Header title={t('tabs.trips')} onBack={onBack} theme={theme} />
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        theme={theme} t={t}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SummaryCard label={t('overview.income')} value={fmt(totalIncome)} color="#22c55e" cs={cs} theme={theme} />
            <SummaryCard label={t('trips.distance')} value={fmt(totalDist)} color="#3b82f6" cs={distLabel} theme={theme} />
            <SummaryCard label={t('tabs.trips')} value={String(trips.length)} color="#f59e0b" cs="" theme={theme} />
          </div>
          {trips.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
              {t('trips.noTrips')}
            </div>
          ) : (
            trips.map(tr => (
              <div key={tr.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                      {tr.origin || '?'} {'\u2192'} {tr.destination || '?'}
                    </div>
                    <div style={{ color: theme.dim, fontSize: 12, marginTop: 2 }}>
                      {fmtDate(tr.created_at)} {'\u00b7'} {fmt(convDist(tr.distance_km || 0))} {distLabel}
                    </div>
                  </div>
                  <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                    +{fmt(tr.income || 0)} {cs}
                  </div>
                </div>
              </div>
            ))
          )}
          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}

// =====================================================================
// 4. Vehicle Expenses Details (combined fuel + vexp + service + tires)
// =====================================================================
export function VehicleExpensesDetails({ userId, onBack, initialPeriod, initialCustomFrom, initialCustomTo }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [period, setPeriod] = useState(initialPeriod || 'month')
  const [customFrom, setCustomFrom] = useState(initialCustomFrom || '')
  const [customTo, setCustomTo] = useState(initialCustomTo || '')

  const { loading, fuels, vehicleExps, serviceRecs, tireRecs } =
    useReportData(userId, period, customFrom, customTo, ['fuels', 'vexp', 'service', 'tires'])

  // Combined entries
  const entries = useMemo(() => {
    const list = []
    fuels.forEach(f => list.push({
      date: f.date || '',
      category: t('overview.fuelShort') || 'Fuel',
      categoryKey: 'fuel',
      description: f.station || '',
      amount: f.cost || 0,
      color: '#f59e0b',
    }))
    vehicleExps.forEach(e => {
      const key = e.category || 'other'
      list.push({
        date: e.date || '',
        category: categoryLabelForVexp(key, t),
        categoryKey: key,
        description: e.description || '',
        amount: e.amount || 0,
        color: colorForVexpCat(key),
      })
    })
    serviceRecs.forEach(r => list.push({
      date: r.date || '',
      category: t('overview.repairShort') || 'Repair',
      categoryKey: 'repair',
      description: r.description || r.type || '',
      amount: r.cost || 0,
      color: '#ef4444',
    }))
    tireRecs.forEach(r => list.push({
      date: r.installed_at || '',
      category: t('overview.tiresShort') || 'Tires',
      categoryKey: 'tires',
      description: ((r.brand || '') + ' ' + (r.model || '')).trim(),
      amount: r.cost || 0,
      color: '#64748b',
    }))
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return list
  }, [fuels, vehicleExps, serviceRecs, tireRecs, t])

  const total = entries.reduce((s, e) => s + (e.amount || 0), 0)

  const byCategory = {}
  entries.forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = { value: 0, color: e.color }
    byCategory[e.category].value += e.amount
  })
  const segments = Object.entries(byCategory)
    .filter(([, v]) => v.value > 0)
    .map(([label, v]) => ({ label, value: v.value, color: v.color }))

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Header title={t('reports.vehicleExpenses')} onBack={onBack} theme={theme} />
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        theme={theme} t={t}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SummaryCard label={t('overview.total')} value={fmt(total)} color="#ef4444" cs={cs} theme={theme} />
            <SummaryCard label={t('excel.totalTrips') || 'Entries'} value={String(entries.length)} color="#f59e0b" cs="" theme={theme} />
          </div>
          <Donut segments={segments} theme={theme} t={t} cs={cs} title={t('details.categoriesChartTitle')} />
          <div style={{
            background: theme.card, borderRadius: 16,
            border: `1px solid ${theme.border}`, marginBottom: 10, overflow: 'hidden',
          }}>
            {entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: theme.dim, fontSize: 14 }}>
                {t('reports.noRecords')}
              </div>
            ) : entries.map((e, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 14px',
                borderBottom: i === entries.length - 1 ? 'none' : `1px solid ${theme.border}`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, marginRight: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: theme.text, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.category}{e.description ? ' \u00b7 ' + e.description : ''}
                  </div>
                  <div style={{ color: theme.dim, fontSize: 11, marginTop: 2 }}>
                    {e.date.slice(0, 10)}
                  </div>
                </div>
                <div style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                  {cs}{fmt(e.amount)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}

// =====================================================================
// 5. Personal Expenses Details
// =====================================================================
export function PersonalExpensesDetails({ userId, onBack, initialPeriod, initialCustomFrom, initialCustomTo }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [period, setPeriod] = useState(initialPeriod || 'month')
  const [customFrom, setCustomFrom] = useState(initialCustomFrom || '')
  const [customTo, setCustomTo] = useState(initialCustomTo || '')

  const { loading, bytExps } = useReportData(userId, period, customFrom, customTo, ['byt'])

  const total = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const sorted = [...bytExps].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const byCategory = {}
  bytExps.forEach(e => {
    const cat = categoryLabelForByt(e.category, t)
    const color = colorForBytCat(e.category)
    if (!byCategory[cat]) byCategory[cat] = { value: 0, color }
    byCategory[cat].value += (e.amount || 0)
  })
  const segments = Object.entries(byCategory)
    .filter(([, v]) => v.value > 0)
    .map(([label, v]) => ({ label, value: v.value, color: v.color }))

  const range = dateRangeFromPeriod(period, customFrom, customTo)
  const bytGrp = groupByPeriod(period, range.start, range.end, bytExps, {
    date: r => r.date, field: r => r.amount, series: 'personal',
  })
  const rows = Object.keys(bytGrp.map).sort().map(k => ({
    key: k,
    label: labelForKey(k, bytGrp.groupMode, t),
    fullLabel: fullLabelForKey(k, bytGrp.groupMode, t),
    personal: bytGrp.map[k]?.personal || 0,
  }))

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Header title={t('reports.personalExpenses')} onBack={onBack} theme={theme} />
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        theme={theme} t={t}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SummaryCard label={t('overview.total')} value={fmt(total)} color="#ef4444" cs={cs} theme={theme} />
            <SummaryCard label={t('excel.totalTrips') || 'Entries'} value={String(bytExps.length)} color="#f59e0b" cs="" theme={theme} />
          </div>
          <Donut segments={segments} theme={theme} t={t} cs={cs} title={t('details.categoriesChartTitle')} />
          <LineChart
            data={rows}
            labels={[t('details.personalExpenseChartLabel')]}
            colors={['#ef4444']}
            theme={theme} cs={cs}
            title={t('details.personalExpenseChartLabel')}
          />
          <div style={{
            background: theme.card, borderRadius: 16,
            border: `1px solid ${theme.border}`, marginBottom: 10, overflow: 'hidden',
          }}>
            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: theme.dim, fontSize: 14 }}>
                {t('reports.noRecords')}
              </div>
            ) : sorted.map((e, i) => {
              const catLabel = categoryLabelForByt(e.category, t)
              const color = colorForBytCat(e.category)
              return (
                <div key={e.id || i} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: i === sorted.length - 1 ? 'none' : `1px solid ${theme.border}`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 10, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: theme.text, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {catLabel}{e.description ? ' \u00b7 ' + e.description : ''}
                    </div>
                    <div style={{ color: theme.dim, fontSize: 11, marginTop: 2 }}>
                      {(e.date || '').slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                    {cs}{fmt(e.amount)}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}

// =====================================================================
// Helpers: category labels/colors
// =====================================================================
function categoryLabelForVexp(key, t) {
  switch ((key || '').toLowerCase()) {
    case 'def': return 'DEF'
    case 'oil': return t('overview.oilShort') || 'Oil'
    case 'parts': return t('excel.parts') || 'Parts'
    case 'equipment': return t('excel.equipment') || 'Equipment'
    case 'supplies': return t('overview.suppliesShort') || 'Supplies'
    case 'hotel': return t('overview.housingShort') || 'Motel'
    case 'toll': return t('excel.toll') || 'Toll'
    case 'platon': return 'Platon'
    default: return key || (t('overview.otherShort') || 'Other')
  }
}

function colorForVexpCat(key) {
  switch ((key || '').toLowerCase()) {
    case 'def': return '#06b6d4'
    case 'oil': return '#8b5cf6'
    case 'parts': return '#ef4444'
    case 'equipment': return '#a855f7'
    case 'supplies': return '#14b8a6'
    case 'hotel': return '#3b82f6'
    case 'toll': return '#f59e0b'
    case 'platon': return '#ec4899'
    default: return '#64748b'
  }
}

function categoryLabelForByt(key, t) {
  switch ((key || '').toLowerCase()) {
    case 'food': return t('overview.foodShort') || 'Food'
    case 'shower': return t('byt.shower') || 'Shower'
    case 'laundry': return t('byt.laundry') || 'Laundry'
    case 'hotel': return t('overview.housingShort') || 'Hotel'
    case 'personal': return t('overview.otherShort') || 'Personal'
    default: return key || (t('overview.otherShort') || 'Other')
  }
}

function colorForBytCat(key) {
  switch ((key || '').toLowerCase()) {
    case 'food': return '#22c55e'
    case 'shower': return '#8b5cf6'
    case 'laundry': return '#f59e0b'
    case 'hotel': return '#3b82f6'
    case 'personal': return '#06b6d4'
    default: return '#64748b'
  }
}

// =====================================================================
// Reusable period table (Period | columns[] | ...)
// =====================================================================
function PeriodTable({ rows, columns, totals, theme, t, title }) {
  if (!rows || rows.length === 0) return null
  const nonEmptyRows = rows.filter(r => columns.some(c => {
    const v = c.getter ? c.getter(r) : (r[c.key] || 0)
    return v !== 0
  }))
  return (
    <div style={{
      background: theme.card, borderRadius: 16, padding: 12,
      border: `1px solid ${theme.border}`, marginBottom: 10,
    }}>
      <div style={{ fontSize: 12, color: theme.dim, marginBottom: 10 }}>{title}</div>
      {nonEmptyRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: theme.dim, fontSize: 13 }}>
          {t('overview.noDataForPeriod') || t('reports.noRecords')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: theme.dim, fontWeight: 600, fontSize: 11 }}>
                  {t('overview.financePeriodCol') || 'Period'}
                </th>
                {columns.map(c => (
                  <th key={c.key} style={{ textAlign: 'right', padding: '6px 4px', color: c.color || theme.dim, fontWeight: 600, fontSize: 11 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nonEmptyRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                  <td style={{ padding: '8px 4px', color: theme.text, fontSize: 12 }}>{r.fullLabel}</td>
                  {columns.map(c => {
                    const v = c.getter ? c.getter(r) : (r[c.key] || 0)
                    const color = c.profit ? (v >= 0 ? '#22c55e' : '#ef4444') : (c.color || theme.text)
                    return (
                      <td key={c.key} style={{
                        padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace',
                        color, fontSize: 12, fontWeight: c.profit ? 600 : 400,
                      }}>
                        {c.profit && v >= 0 ? '+' : ''}{fmt(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${theme.border}`, background: `${theme.border}33` }}>
                <td style={{ padding: '8px 4px', color: theme.text, fontSize: 12, fontWeight: 700 }}>
                  {t('overview.total')}
                </td>
                {columns.map(c => {
                  const v = totals[c.key] || 0
                  const color = c.profit ? (v >= 0 ? '#22c55e' : '#ef4444') : (c.color || theme.text)
                  return (
                    <td key={c.key} style={{
                      padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace',
                      color, fontSize: 12, fontWeight: 700,
                    }}>
                      {c.profit && v >= 0 ? '+' : ''}{fmt(v)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
