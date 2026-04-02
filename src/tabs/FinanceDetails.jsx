import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchVehicleExpenses, fetchDriverReportExportData, getTireRecords, fetchFleetReportExportData, fetchFleetBolDocuments } from '../lib/api'
import { exportDriverReportExcel, exportFleetReportExcel } from '../utils/export'

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

export default function FinanceDetails({ userId, profile, onBack }) {
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
  const [totalSalary, setTotalSalary] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const chartRef = useRef(null)
  const units = getUnits()

  // Determine view mode
  const isCompanyRole = profile?.role === 'company'
  const isHiredDriver = !isCompanyRole && (profile?.pay_type === 'per_mile' || profile?.pay_type === 'percent')
  // else: owner-operator (default)

  // Salary settings from localStorage (same as Overview)
  const salaryMode = (() => { try { return localStorage.getItem('tb_salary_mode') || 'per_km' } catch { return 'per_km' } })()
  const salaryRate = (() => { try { return parseFloat(localStorage.getItem('tb_salary_rate')) || 15 } catch { return 15 } })()

  const getMonthCount = () => {
    switch (period) {
      case 'month': return 1
      case '3m': return 3
      case '6m': return 6
      case 'year': return 12
      default: return 0
    }
  }

  const toLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const getDateRange = useCallback(() => {
    const now = new Date()
    if (period === 'custom' && customFrom && customTo) {
      return { start: customFrom, end: customTo }
    }
    const months = getMonthCount() || 12
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    return {
      start: toLocalDate(start),
      end: toLocalDate(now),
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

      const ensureGroup = (key) => {
        if (!key) return
        if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0, driverPay: 0, km: 0, bytExpense: 0 }
      }

      const addToGroup = (dateStr, field, value) => {
        const key = getGroupKey(dateStr)
        if (!key) return
        ensureGroup(key)
        dataMap[key][field] += value || 0
      }

      if (isHiredDriver) {
        // Hired driver: income = driver_pay, expense = byt only
        rangeTrips.forEach(tr => addToGroup(tr.created_at, 'driverPay', tr.driver_pay || 0))
        rangeByt.forEach(e => addToGroup(e.date, 'bytExpense', e.amount || 0))
      } else {
        // Owner-operator & fleet owner: income from trips, all expenses
        rangeTrips.forEach(tr => {
          addToGroup(tr.created_at, 'income', tr.income || 0)
          addToGroup(tr.created_at, 'km', tr.distance_km || 0)
          if (isCompanyRole) addToGroup(tr.created_at, 'driverPay', tr.driver_pay || 0)
        })
        rangeFuels.forEach(e => addToGroup(e.date, 'expense', e.cost || 0))
        if (!isCompanyRole) {
          rangeByt.forEach(e => addToGroup(e.date, 'expense', e.amount || 0))
        }
        rangeService.forEach(e => addToGroup(e.date, 'expense', e.cost || 0))
        rangeVehicleExp.forEach(e => addToGroup(e.date, 'expense', e.amount || 0))
      }

      // Fill gaps
      const keys = Object.keys(dataMap).sort()
      if (groupMode === 'day') {
        const cur = new Date(start)
        const endD = new Date(end)
        while (cur <= endD) {
          const k = cur.toISOString().slice(0, 10)
          ensureGroup(k)
          cur.setDate(cur.getDate() + 1)
        }
      } else if (groupMode === 'week') {
        if (keys.length > 0) {
          const cur = new Date(keys[0])
          const last = new Date(keys[keys.length - 1])
          while (cur <= last) {
            const k = cur.toISOString().slice(0, 10)
            ensureGroup(k)
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
            ensureGroup(k)
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

      // Compute per-period salary for fleet mode: use actual driver_pay from trips
      const calcPeriodSalary = (vals) => {
        if (!isCompanyRole) return 0
        return vals.driverPay || 0
      }

      const sorted = Object.entries(dataMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => {
          if (isHiredDriver) {
            return {
              key,
              label: getLabel(key),
              fullLabel: getFullLabel(key),
              income: vals.driverPay,
              expense: vals.bytExpense,
              profit: vals.driverPay - vals.bytExpense,
            }
          }
          const periodSalary = calcPeriodSalary(vals)
          return {
            key,
            label: getLabel(key),
            fullLabel: getFullLabel(key),
            income: vals.income,
            expense: vals.expense,
            profit: vals.income - vals.expense,
            salary: periodSalary,
            netProfit: vals.income - vals.expense - periodSalary,
          }
        })

      setMonthlyData(sorted)

      // Total salary for fleet mode: sum actual driver_pay from trips in period
      if (isCompanyRole) {
        const actualSalary = rangeTrips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
        setTotalSalary(actualSalary)
      }

      // Expense breakdown for donut
      if (isHiredDriver) {
        // Only personal expenses by category
        const bytByCategory = {}
        rangeByt.forEach(e => {
          const cat = e.category || 'other'
          bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
        })
        const breakdown = []
        if (bytByCategory.food) breakdown.push({ label: t('overview.foodShort'), value: bytByCategory.food, color: '#22c55e' })
        if (bytByCategory.hotel) breakdown.push({ label: t('overview.housingShort'), value: bytByCategory.hotel, color: '#3b82f6' })
        if (bytByCategory.shower) breakdown.push({ label: t('byt.shower') || '\u0414\u0443\u0448', value: bytByCategory.shower, color: '#8b5cf6' })
        if (bytByCategory.laundry) breakdown.push({ label: t('byt.laundry') || '\u0421\u0442\u0438\u0440\u043a\u0430', value: bytByCategory.laundry, color: '#f59e0b' })
        const otherByt = Object.entries(bytByCategory)
          .filter(([k]) => !['food', 'hotel', 'shower', 'laundry'].includes(k))
          .reduce((s, [, v]) => s + v, 0)
        if (otherByt > 0) breakdown.push({ label: t('overview.otherShort'), value: otherByt, color: '#06b6d4' })
        setExpenseBreakdown(breakdown)
      } else {
        // Owner-operator or fleet: all expense categories
        const fuelCost = rangeFuels.reduce((s, e) => s + (e.cost || 0), 0)
        const serviceCost = rangeService.reduce((s, e) => s + (e.cost || 0), 0)
        const vehicleExpCost = rangeVehicleExp.reduce((s, e) => s + (e.amount || 0), 0)
        const bytByCategory = {}
        if (!isCompanyRole) {
          rangeByt.forEach(e => {
            const cat = e.category || 'other'
            bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
          })
        }
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
      }
    } catch (err) {
      console.error('FinanceDetails loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, getDateRange, t, isHiredDriver, isCompanyRole, salaryMode, salaryRate])

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

  // Mode-specific labels
  const incomeLabel = isHiredDriver ? (t('pay.earnedMonth') || '\u0417\u0430\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e') : t('overview.income')
  const expenseLabel = isHiredDriver ? (t('byt.personalExpenses') || '\u041b\u0438\u0447\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b') : t('overview.expense')
  const profitLabel = isHiredDriver ? (t('pay.netClean') || '\u0427\u0438\u0441\u0442\u044b\u043c\u0438') : isCompanyRole ? (t('overview.grossProfit') || '\u0412\u0430\u043b\u043e\u0432\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c') : t('overview.netProfit')
  const headerTitle = isHiredDriver ? (t('pay.myEarnings') || '\u041c\u043e\u0439 \u0437\u0430\u0440\u0430\u0431\u043e\u0442\u043e\u043a') : isCompanyRole ? (t('overview.fleetFinances') || '\u0424\u0438\u043d\u0430\u043d\u0441\u044b \u043f\u0430\u0440\u043a\u0430') : t('overview.finances')

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

    const donutLabel = isHiredDriver ? (t('byt.personalExpenses') || '\u041b\u0438\u0447\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b') : t('overview.expenses')

    return (
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '12px' }}>{donutLabel}</div>
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

  const handleExportExcel = async (expYear, expMonth) => {
    if (exporting) return
    setExporting(true)
    try {
      const year = expYear
      const month = expMonth
      const isImperial = units === 'imperial'
      const distLabel = isImperial ? 'mi' : 'km'

      const data = await fetchDriverReportExportData(userId, year, month)

      // Trips
      const tripsArr = data.trips.map(tr => ({
        date: (tr.created_at || '').slice(0, 10),
        origin: tr.origin || '',
        destination: tr.destination || '',
        miles: isImperial ? Math.round((tr.distance_km || 0) * 0.621371) : Math.round(tr.distance_km || 0),
        income: tr.income || 0,
        driverPay: tr.driver_pay || 0,
      }))

      // All expenses merged
      const expensesArr = []
      data.fuels.forEach(f => expensesArr.push({
        date: f.date || '',
        description: f.station || 'Fuel',
        category: 'Fuel',
        gallons: isImperial ? Math.round((f.liters || 0) * 0.264172 * 100) / 100 : (f.liters || 0),
        amount: f.cost || 0,
        odometer: f.odometer ? (isImperial ? Math.round(f.odometer * 0.621371) : f.odometer) : '',
      }))
      data.bytExps.forEach(e => expensesArr.push({
        date: e.date || '',
        description: e.description || e.category || '',
        category: e.category || 'Personal',
        gallons: '',
        amount: e.amount || 0,
        odometer: '',
      }))
      data.serviceRecs.forEach(e => expensesArr.push({
        date: e.date || '',
        description: e.description || e.type || 'Service',
        category: 'Service',
        gallons: '',
        amount: e.cost || 0,
        odometer: '',
      }))
      data.vehicleExps.forEach(e => expensesArr.push({
        date: e.date || '',
        description: e.description || '',
        category: e.category || 'Vehicle',
        gallons: '',
        amount: e.amount || 0,
        odometer: '',
      }))
      data.tireRecs.forEach(e => expensesArr.push({
        date: e.installed_at || '',
        description: (e.brand || '') + ' ' + (e.model || ''),
        category: 'Tires',
        gallons: '',
        amount: e.cost || 0,
        odometer: '',
      }))

      // Vehicle expense categories (fuel, service, tires, vehicle_expenses by category)
      const fuelTotal = data.fuels.reduce((s, f) => s + (f.cost || 0), 0)
      const serviceTotal = data.serviceRecs.reduce((s, e) => s + (e.cost || 0), 0)
      const tireTotal = data.tireRecs.reduce((s, e) => s + (e.cost || 0), 0)
      const vExpByCat = {}
      data.vehicleExps.forEach(e => {
        const cat = e.category || 'other'
        vExpByCat[cat] = (vExpByCat[cat] || 0) + (e.amount || 0)
      })

      const vehicleExpenseCategories = []
      if (fuelTotal > 0) vehicleExpenseCategories.push({ label: t('overview.fuelShort') || 'Fuel', amount: fuelTotal })
      if (vExpByCat.def) vehicleExpenseCategories.push({ label: 'DEF', amount: vExpByCat.def })
      if (vExpByCat.oil) vehicleExpenseCategories.push({ label: t('overview.oilShort') || 'Oil', amount: vExpByCat.oil })
      if (serviceTotal > 0) vehicleExpenseCategories.push({ label: t('overview.repairShort') || 'Repair', amount: serviceTotal })
      if (vExpByCat.supplies) vehicleExpenseCategories.push({ label: t('overview.suppliesShort') || 'Supplies', amount: vExpByCat.supplies })
      if (vExpByCat.hotel) vehicleExpenseCategories.push({ label: t('overview.housingShort') || 'Motel', amount: vExpByCat.hotel })
      if (tireTotal > 0) vehicleExpenseCategories.push({ label: t('overview.tiresShort') || 'Tires', amount: tireTotal })
      // Remaining vehicle expense categories
      const knownVCats = ['def', 'oil', 'supplies', 'hotel']
      Object.entries(vExpByCat).filter(([k]) => !knownVCats.includes(k)).forEach(([k, v]) => {
        if (v > 0) vehicleExpenseCategories.push({ label: k, amount: v })
      })

      const vehicleExpenseTotal = vehicleExpenseCategories.reduce((s, c) => s + c.amount, 0)

      // Totals
      const totalMileage = tripsArr.reduce((s, tr) => s + (tr.miles || 0), 0)
      const totalHours = data.sessions.reduce((s, sh) => {
        if (!sh.ended_at) return s
        return s + (new Date(sh.ended_at).getTime() - new Date(sh.started_at).getTime()) / 3600000
      }, 0)

      const payType = profile?.pay_type || 'none'
      const payRate = profile?.pay_rate ? parseFloat(profile.pay_rate) : 0

      const tripIncome = data.trips.reduce((s, tr) => s + (tr.income || 0), 0)
      const earned = data.trips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
      const personalExpenses = data.bytExps.reduce((s, e) => s + (e.amount || 0), 0)

      // Pay sheet rows
      const payRows = data.trips.map(tr => {
        const miles = isImperial ? Math.round((tr.distance_km || 0) * 0.621371) : Math.round(tr.distance_km || 0)
        let rate = ''
        let rowEarned = tr.driver_pay || 0
        if (payType === 'per_mile') {
          rate = '$' + payRate + '/' + distLabel
        } else if (payType === 'percent') {
          rate = payRate + '%'
        }
        return {
          date: (tr.created_at || '').slice(0, 10),
          route: (tr.origin || '') + ' \u2192 ' + (tr.destination || ''),
          miles,
          rate,
          earned: rowEarned,
        }
      })

      const payTotal = payRows.reduce((s, r) => s + (r.earned || 0), 0)
      const advancesTotal = data.advances.reduce((s, a) => s + (a.amount || 0), 0)

      const vehicleInfo = profile?.brand ? (profile.brand + ' ' + (profile.model || '') + (profile.plate_number ? ' (' + profile.plate_number + ')' : '')) : ''
      const monthNames = ['\u042f\u043d\u0432\u0430\u0440\u044c','\u0424\u0435\u0432\u0440\u0430\u043b\u044c','\u041c\u0430\u0440\u0442','\u0410\u043f\u0440\u0435\u043b\u044c','\u041c\u0430\u0439','\u0418\u044e\u043d\u044c','\u0418\u044e\u043b\u044c','\u0410\u0432\u0433\u0443\u0441\u0442','\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c','\u041e\u043a\u0442\u044f\u0431\u0440\u044c','\u041d\u043e\u044f\u0431\u0440\u044c','\u0414\u0435\u043a\u0430\u0431\u0440\u044c']

      await exportDriverReportExcel({
        driverName: profile?.full_name || profile?.name || '',
        driverPhone: profile?.phone || '',
        vehicleInfo,
        period: monthNames[month - 1] + ' ' + year,
        tripsCount: tripsArr.length,
        totalMileage,
        totalHours: Math.round(totalHours * 10) / 10,
        payType,
        payRate,
        earned,
        personalExpenses,
        netClean: earned - personalExpenses,
        vehicleExpenseCategories,
        vehicleExpenseTotal,
        tripIncome,
        netProfit: tripIncome - vehicleExpenseTotal - personalExpenses,
        trips: tripsArr,
        expenses: expensesArr,
        payRows,
        payTotal,
        advances: data.advances.map(a => ({ date: a.date, amount: a.amount || 0, note: a.note || '' })),
        advancesTotal,
        payDue: payTotal - advancesTotal,
        distLabel,
        cs,
        filename: `driver_report_${String(month).padStart(2, '0')}_${year}.xlsx`,
      })
    } catch (err) {
      console.error('Export error:', err)
      alert(t('common.error') || 'Error')
    } finally {
      setExporting(false)
    }
  }

  const handleFleetExportExcel = async (expYear, expMonth) => {
    if (exporting) return
    setExporting(true)
    try {
      const year = expYear
      const month = expMonth
      const isImperial = units === 'imperial'
      const distLabel = isImperial ? 'mi' : 'km'

      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const endMonth = month === 12 ? 1 : month + 1
      const endYear = month === 12 ? year + 1 : year
      const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

      const [data, bolDocs] = await Promise.all([
        fetchFleetReportExportData(userId, year, month),
        fetchFleetBolDocuments(userId, start, end),
      ])

      // Defensive: ensure all arrays exist
      const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : []
      const drivers = Array.isArray(data?.drivers) ? data.drivers : []
      const fuels = Array.isArray(data?.fuels) ? data.fuels : []
      const trips = Array.isArray(data?.trips) ? data.trips : []
      const serviceRecs = Array.isArray(data?.serviceRecs) ? data.serviceRecs : []
      const tireRecs = Array.isArray(data?.tireRecs) ? data.tireRecs : []
      const vehicleExps = Array.isArray(data?.vehicleExps) ? data.vehicleExps : []
      const sessions = Array.isArray(data?.sessions) ? data.sessions : []
      const advances = Array.isArray(data?.advances) ? data.advances : []

      // Build lookup maps
      const driverMap = {}
      drivers.forEach(d => {
        driverMap[d.id] = {
          name: d.full_name || d.name || '',
          pay_type: d.pay_type || '',
          pay_rate: d.pay_rate ? parseFloat(d.pay_rate) : 0,
        }
      })
      // Include owner in driverMap
      driverMap[userId] = {
        name: profile?.full_name || profile?.name || 'Owner',
        pay_type: '',
        pay_rate: 0,
      }

      const vehicleMap = {}
      vehicles.forEach(v => {
        const label = ((v.brand || '') + ' ' + (v.model || '')).trim()
        vehicleMap[v.id] = {
          label,
          plate: v.plate_number || '',
          driver: v.driver_name || (v.driver_id && driverMap[v.driver_id] ? driverMap[v.driver_id].name : ''),
        }
      })

      const monthNames = ['\u042f\u043d\u0432\u0430\u0440\u044c','\u0424\u0435\u0432\u0440\u0430\u043b\u044c','\u041c\u0430\u0440\u0442','\u0410\u043f\u0440\u0435\u043b\u044c','\u041c\u0430\u0439','\u0418\u044e\u043d\u044c','\u0418\u044e\u043b\u044c','\u0410\u0432\u0433\u0443\u0441\u0442','\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c','\u041e\u043a\u0442\u044f\u0431\u0440\u044c','\u041d\u043e\u044f\u0431\u0440\u044c','\u0414\u0435\u043a\u0430\u0431\u0440\u044c']

      await exportFleetReportExcel({
        vehicles,
        drivers,
        fuels,
        trips,
        serviceRecs,
        tireRecs,
        vehicleExps,
        sessions,
        advances,
        bolDocs,
        period: monthNames[month - 1] + ' ' + year,
        distLabel,
        cs,
        isImperial,
        ownerProfile: profile,
        driverMap,
        vehicleMap,
        filename: `fleet_report_${String(month).padStart(2, '0')}_${year}.xlsx`,
      })
    } catch (err) {
      console.error('Fleet export error:', err)
      alert('Fleet export error: ' + (err?.message || JSON.stringify(err)))
    } finally {
      setExporting(false)
    }
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
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{headerTitle}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: isCompanyRole && totalSalary > 0 ? '8px' : '16px' }}>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{incomeLabel}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#22c55e', marginTop: '4px' }}>
                {formatNumber(Math.round(totalIncome))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{expenseLabel}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
                {formatNumber(Math.round(totalExpense))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
              <div style={dimText}>{profitLabel}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: totalProfit >= 0 ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                {totalProfit >= 0 ? '+' : ''}{formatNumber(Math.round(totalProfit))}
              </div>
              <div style={{ fontSize: '11px', color: theme.dim }}>{cs}</div>
            </div>
          </div>

          {/* Fleet salary row */}
          {isCompanyRole && totalSalary > 0 && (() => {
            const netAfterSalary = totalProfit - totalSalary
            return (
              <div style={{ ...cardStyle, padding: '10px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', color: theme.dim }}>
                  {t('overview.salariesLabel') || '\u0417\u0430\u0440\u043f\u043b\u0430\u0442\u044b \u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u0439'}: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f59e0b' }}>{formatNumber(Math.round(totalSalary))} {cs}</span>
                </div>
                <div style={{ fontSize: '12px', color: theme.dim }}>
                  {t('overview.netProfit')}: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: netAfterSalary >= 0 ? '#22c55e' : '#ef4444' }}>{formatNumber(Math.round(netAfterSalary))} {cs}</span>
                </div>
              </div>
            )
          })()}

          {/* Line/Area chart */}
          {monthlyData.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '12px', padding: '12px' }}>
              <div style={{ ...dimText, marginBottom: '8px' }}>{incomeLabel} / {expenseLabel}</div>
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
                  <span style={{ fontSize: '11px', color: theme.dim }}>{incomeLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '3px', borderRadius: '2px', background: '#ef4444' }} />
                  <span style={{ fontSize: '11px', color: theme.dim }}>{expenseLabel}</span>
                </div>
              </div>
            </div>
          )}

          {/* Period table */}
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
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: '#22c55e', fontWeight: 600, fontSize: '11px' }}>{incomeLabel}</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: '#ef4444', fontWeight: 600, fontSize: '11px' }}>{expenseLabel}</th>
                      {isCompanyRole && (
                        <th style={{ textAlign: 'right', padding: '6px 4px', color: '#f59e0b', fontWeight: 600, fontSize: '11px' }}>{t('overview.salariesLabel') || '\u0417\u041f'}</th>
                      )}
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: theme.dim, fontWeight: 600, fontSize: '11px' }}>
                        {isCompanyRole ? (t('overview.netProfit') || '\u0427\u0438\u0441\u0442\u0430\u044f') : profitLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmptyRows.map((m, i) => {
                      const rowProfit = isCompanyRole ? (m.netProfit ?? m.profit) : m.profit
                      return (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                        <td style={{ padding: '8px 4px', color: theme.text, fontSize: '12px' }}>{m.fullLabel}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#22c55e', fontSize: '12px' }}>
                          {formatNumber(Math.round(m.income))}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#ef4444', fontSize: '12px' }}>
                          {formatNumber(Math.round(m.expense))}
                        </td>
                        {isCompanyRole && (
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b', fontSize: '12px' }}>
                            {formatNumber(Math.round(m.salary || 0))}
                          </td>
                        )}
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: rowProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px' }}>
                          {rowProfit >= 0 ? '+' : ''}{formatNumber(Math.round(rowProfit))}
                        </td>
                      </tr>
                      )
                    })}
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
                      {isCompanyRole && (
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b', fontSize: '12px', fontWeight: 700 }}>
                          {formatNumber(Math.round(totalSalary))}
                        </td>
                      )}
                      {(() => {
                        const finalProfit = isCompanyRole ? (totalProfit - totalSalary) : totalProfit
                        return (
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: finalProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px' }}>
                          {finalProfit >= 0 ? '+' : ''}{formatNumber(Math.round(finalProfit))}
                        </td>
                        )
                      })()}
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

          {/* Export button */}
          <button
            onClick={() => setShowExportModal(true)}
            disabled={exporting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              background: exporting ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: exporting ? 'default' : 'pointer',
              marginBottom: '12px',
              opacity: exporting ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {exporting ? '\u23f3' : '\ud83d\udcc4'} {t('finance.exportExcel') || '\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0432 Excel'}
          </button>
        </>
      )}

      {showExportModal && (
        <ExportPeriodModal
          theme={theme}
          t={t}
          exporting={exporting}
          onClose={() => setShowExportModal(false)}
          onExport={(y, m) => {
            setShowExportModal(false)
            if (isCompanyRole) handleFleetExportExcel(y, m)
            else handleExportExcel(y, m)
          }}
        />
      )}
    </div>
  )
}

/* ===== EXPORT PERIOD MODAL ===== */
function ExportPeriodModal({ theme, t, exporting, onClose, onExport }) {
  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)

  const MONTH_NAMES = [
    '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
    '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
    '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
    '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
  ]

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y)

  const quickSelect = (label) => {
    const n = new Date()
    if (label === 'this') {
      setSelYear(n.getFullYear())
      setSelMonth(n.getMonth() + 1)
    } else if (label === 'prev') {
      const prev = new Date(n.getFullYear(), n.getMonth() - 1, 1)
      setSelYear(prev.getFullYear())
      setSelMonth(prev.getMonth() + 1)
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px',
  }
  const modalStyle = {
    background: theme.card, borderRadius: '16px', padding: '24px', width: '100%',
    maxWidth: '360px', border: '1px solid ' + theme.border,
  }
  const btnStyle = (active) => ({
    flex: 1, padding: '8px 4px', border: 'none', borderRadius: '10px', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.bg,
    color: active ? '#fff' : theme.dim,
  })
  const selectStyle = {
    flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid ' + theme.border,
    background: theme.bg, color: theme.text, fontSize: '14px',
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: theme.text }}>
          {t('finance.exportPeriod') || '\u041f\u0435\u0440\u0438\u043e\u0434 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430'}
        </div>

        {/* Quick buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button style={btnStyle(false)} onClick={() => quickSelect('this')}>
            {t('finance.thisMonth') || '\u042d\u0442\u043e\u0442 \u043c\u0435\u0441\u044f\u0446'}
          </button>
          <button style={btnStyle(false)} onClick={() => quickSelect('prev')}>
            {t('finance.prevMonth') || '\u041f\u0440\u043e\u0448\u043b\u044b\u0439'}
          </button>
        </div>

        {/* Month + Year selects */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={selectStyle}>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid ' + theme.border,
              background: 'transparent', color: theme.dim, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('common.cancel') || '\u041e\u0442\u043c\u0435\u043d\u0430'}
          </button>
          <button
            onClick={() => onExport(selYear, selMonth)}
            disabled={exporting}
            style={{
              flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
              background: exporting ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: '14px', fontWeight: 700, cursor: exporting ? 'default' : 'pointer',
            }}
          >
            {exporting ? '\u23f3' : '\ud83d\udcc4'} {t('finance.download') || '\u0421\u043a\u0430\u0447\u0430\u0442\u044c'}
          </button>
        </div>
      </div>
    </div>
  )
}
