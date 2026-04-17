import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import {
  fetchFuels, fetchTrips, fetchBytExpenses,
  fetchServiceRecords, fetchVehicleExpenses, getTireRecords,
} from '../lib/api'
import {
  exportDriverFullReportExcel, exportDriverFullReportPDF,
  exportToExcel, exportToPDF,
  exportToExcelWithSummary,
} from '../utils/export'

function fmt(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(Number(n)).toLocaleString('en-US')
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Reports({ userId, profile, onBack, onNavigate }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const units = getUnits()
  const isImperial = units === 'imperial'
  const distLabel = isImperial ? 'mi' : 'km'
  const volLabel = isImperial ? 'gal' : 'L'
  const isDriver = profile?.role === 'driver'
  const isOwner = !isDriver && profile?.role !== 'company' && profile?.role !== 'job_seeker'

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')

  const [trips, setTrips] = useState([])
  const [fuels, setFuels] = useState([])
  const [bytExps, setBytExps] = useState([])
  const [vehicleExps, setVehicleExps] = useState([])
  const [serviceRecs, setServiceRecs] = useState([])
  const [tireRecs, setTireRecs] = useState([])

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
      const [_trips, _fuels, _byt, _service, _vexp, _tires] = await Promise.all([
        fetchTrips(userId),
        fetchFuels(userId),
        fetchBytExpenses(userId),
        fetchServiceRecords(userId).catch(() => []),
        fetchVehicleExpenses(userId).catch(() => []),
        getTireRecords(userId).catch(() => []),
      ])
      const { start, end } = getDateRange()
      const inRange = (d) => {
        if (!d) return false
        const s = d.slice(0, 10)
        return s >= start && s <= end
      }
      setTrips(_trips.filter(x => inRange(x.created_at)))
      setFuels(_fuels.filter(x => inRange(x.date)))
      setBytExps(_byt.filter(x => inRange(x.date)))
      setVehicleExps(_vexp.filter(x => inRange(x.date)))
      setServiceRecs(_service.filter(x => inRange(x.date)))
      setTireRecs(_tires.filter(x => inRange(x.installed_at)))
    } catch (err) {
      console.error('Reports load error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, getDateRange])

  useEffect(() => { load() }, [load])

  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)
  const convVol = (liters) => isImperial ? Math.round((liters || 0) * 0.264172 * 100) / 100 : (Math.round((liters || 0) * 100) / 100)

  const totalIncome = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const totalDriverPay = trips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
  const totalDist = trips.reduce((s, tr) => s + convDist(tr.distance_km || 0), 0)
  const personalCost = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const fuelCost = fuels.reduce((s, f) => s + (f.cost || 0), 0)
  const fuelVol = fuels.reduce((s, f) => s + convVol(f.liters || 0), 0)
  const serviceCost = serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const tireCost = tireRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const vehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalVehicleExp = fuelCost + serviceCost + tireCost + vehicleExpCost
  const netProfit = totalIncome - totalVehicleExp
  const mpg = (totalDist > 0 && fuelVol > 0) ? totalDist / fuelVol : 0
  const netToMe = totalDriverPay - personalCost
  const netInHandAmt = netProfit - personalCost

  const periodLabel = (() => {
    const { start, end } = getDateRange()
    return `${start} \u2014 ${end}`
  })()

  const labels = {
    summarySheet: t('reports.summarySheet'),
    mySalary: t('pay.mySalary'),
    pnlReport: t('reports.pnlReport'),
    trips: t('tabs.trips'),
    fuel: t('tabs.fuel'),
    vehicleExpenses: t('reports.vehicleExpenses') || t('overview.vehicleExpense') || 'Vehicle expenses',
    personalExpenses: t('reports.personalExpenses') || t('byt.personalExpenses') || 'Personal expenses',
    period: t('excel.period') || 'Period',
    date: t('excel.date') || 'Date',
    route: t('excel.route') || 'Route',
    from: t('trips.from') || t('excel.origin') || 'From',
    to: t('trips.to') || t('excel.destination') || 'To',
    income: t('overview.income') || 'Income',
    expense: t('overview.expense') || 'Expense',
    profit: t('excel.profit') || 'Profit',
    driverPay: t('trips.driverSalary') || t('excel.myEarnings') || 'Driver pay',
    fuelCost: t('overview.fuelExpenses') || 'Fuel cost',
    netProfit: t('overview.netProfit') || 'Net profit',
    distance: t('trips.distance') || 'Distance',
    avgRatePerDist: t('overview.avgRateMile') || 'Avg rate',
    costPerDist: t('overview.costPerMile') || 'Cost per mile',
    station: t('fuel.station') || 'Station',
    odometer: t('excel.odometer') || 'Odometer',
    category: t('excel.category') || 'Category',
    description: t('excel.description') || 'Description',
    amount: t('excel.amount') || 'Amount',
    total: t('excel.total') || 'TOTAL',
    tires: t('overview.tiresShort') || t('excel.tires') || 'Tires',
    repair: t('excel.repair') || 'Repair',
    metric: t('excel.category') || 'Metric',
    value: t('excel.amount') || 'Value',
    fuelPerMile: t('fuel.exportFuelPerMile') || 'Fuel/mi',
    fuelPerKm: t('fuel.exportFuelPerKm') || 'Fuel/km',
  }

  const fullReportPayload = {
    period: periodLabel,
    cs, distLabel, volLabel, isImperial,
    trips, fuels, vehicleExps, bytExps, serviceRecs, tireRecs,
    labels,
  }

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

  const doFullExcel = () => runExport('full_excel', () => exportDriverFullReportExcel({
    ...fullReportPayload,
    filename: `full_report_${getDateRange().start}_${getDateRange().end}.xlsx`,
  }))
  const doFullPdf = () => runExport('full_pdf', () => exportDriverFullReportPDF({
    ...fullReportPayload,
    filename: `full_report_${getDateRange().start}_${getDateRange().end}.pdf`,
  }))

  // ---- Per-category exports (reuse existing helpers) ----

  const tripsRows = trips.map(tr => ({
    date: (tr.created_at || '').slice(0, 10),
    from: tr.origin || '',
    to: tr.destination || '',
    distance: convDist(tr.distance_km || 0),
    income: tr.income || 0,
    driverPay: tr.driver_pay || 0,
  }))

  const tripsColumns = [
    { header: labels.date, key: 'date' },
    { header: labels.from, key: 'from' },
    { header: labels.to, key: 'to' },
    { header: `${labels.distance} (${distLabel})`, key: 'distance' },
    { header: `${labels.income} (${cs})`, key: 'income' },
    { header: `${labels.driverPay} (${cs})`, key: 'driverPay' },
  ]

  const doTripsExcel = () => runExport('trips_excel', () => exportToExcel(
    tripsRows,
    tripsColumns,
    `trips_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doTripsPdf = () => runExport('trips_pdf', () => exportToPDF(
    tripsRows.map(r => ({ ...r, distance: String(r.distance), income: fmt(r.income), driverPay: fmt(r.driverPay) })),
    tripsColumns,
    labels.trips,
    `trips_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // Fuel
  const fuelRows = [...fuels].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(f => {
    const vol = convVol(f.liters || 0)
    const price = vol > 0 ? Math.round(((f.cost || 0) / vol) * 1000) / 1000 : 0
    return {
      date: (f.date || '').slice(0, 10),
      station: f.station || '',
      volume: vol,
      price_per_unit: price,
      amount: f.cost || 0,
      odometer: f.odometer ? convDist(f.odometer) : '',
    }
  })
  const fuelColumns = [
    { header: labels.date, key: 'date' },
    { header: labels.station, key: 'station' },
    { header: volLabel, key: 'volume' },
    { header: `${cs}/${volLabel}`, key: 'price_per_unit' },
    { header: `${labels.amount} (${cs})`, key: 'amount' },
    { header: `${labels.odometer} (${distLabel})`, key: 'odometer' },
  ]
  const fuelPerDistLabel = isImperial ? labels.fuelPerMile : labels.fuelPerKm

  const doFuelExcel = () => runExport('fuel_excel', () => exportToExcelWithSummary({
    summary: { currencySymbol: cs },
    detailsData: fuelRows,
    detailsColumns: fuelColumns,
    detailsSheetName: labels.fuel,
    categoryData: [],
    categorySheetName: labels.category,
    labels: {
      category: labels.category,
      entriesCount: labels.total,
      amount: labels.amount,
      total: labels.total,
      average: 'avg',
    },
    fuelTotals: {
      volumeKey: 'volume',
      priceKey: 'price_per_unit',
      amountKey: 'amount',
      odometerKey: 'odometer',
      fuelPerDistLabel,
    },
    filename: `fuel_${getDateRange().start}_${getDateRange().end}.xlsx`,
  }))
  const doFuelPdf = () => runExport('fuel_pdf', () => exportToPDF(
    fuelRows.map(r => ({ ...r, volume: String(r.volume), price_per_unit: String(r.price_per_unit), amount: fmt(r.amount), odometer: r.odometer ? String(r.odometer) : '' })),
    fuelColumns,
    labels.fuel,
    `fuel_${getDateRange().start}_${getDateRange().end}.pdf`,
    undefined,
    periodLabel,
    {
      fuelTotals: {
        volumeKey: 'volume',
        priceKey: 'price_per_unit',
        amountKey: 'amount',
        odometerKey: 'odometer',
        fuelPerDistLabel,
      },
      totalLabel: labels.total,
      averageLabel: 'avg',
    },
  ))

  // Vehicle expenses (combines vehicle_exps + service + tires)
  const vExpCombined = []
  vehicleExps.forEach(e => vExpCombined.push({ date: e.date || '', category: e.category || '', description: e.description || '', amount: e.amount || 0 }))
  serviceRecs.forEach(r => vExpCombined.push({ date: r.date || '', category: r.type || labels.repair, description: r.description || '', amount: r.cost || 0 }))
  tireRecs.forEach(r => vExpCombined.push({ date: r.installed_at || '', category: labels.tires, description: ((r.brand || '') + ' ' + (r.model || '')).trim(), amount: r.cost || 0 }))
  vExpCombined.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const vExpRows = vExpCombined.map(e => ({
    date: (e.date || '').slice(0, 10),
    category: e.category,
    description: e.description,
    amount: e.amount,
  }))
  const vExpColumns = [
    { header: labels.date, key: 'date' },
    { header: labels.category, key: 'category' },
    { header: labels.description, key: 'description' },
    { header: `${labels.amount} (${cs})`, key: 'amount' },
  ]
  const doVExpExcel = () => runExport('vexp_excel', () => exportToExcel(
    vExpRows, vExpColumns,
    `vehicle_expenses_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doVExpPdf = () => runExport('vexp_pdf', () => exportToPDF(
    vExpRows.map(r => ({ ...r, amount: fmt(r.amount) })),
    vExpColumns,
    labels.vehicleExpenses,
    `vehicle_expenses_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // Personal expenses
  const bytRows = [...bytExps].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => ({
    date: (e.date || '').slice(0, 10),
    category: e.category || '',
    description: e.description || '',
    amount: e.amount || 0,
  }))
  const bytColumns = vExpColumns
  const doBytExcel = () => runExport('byt_excel', () => exportToExcel(
    bytRows, bytColumns,
    `personal_expenses_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doBytPdf = () => runExport('byt_pdf', () => exportToPDF(
    bytRows.map(r => ({ ...r, amount: fmt(r.amount) })),
    bytColumns,
    labels.personalExpenses,
    `personal_expenses_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // Salary card — reuse trips export with driverPay column
  const doSalaryExcel = () => runExport('salary_excel', () => exportToExcel(
    tripsRows, tripsColumns,
    `my_salary_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doSalaryPdf = () => runExport('salary_pdf', () => exportToPDF(
    tripsRows.map(r => ({ ...r, distance: String(r.distance), income: fmt(r.income), driverPay: fmt(r.driverPay) })),
    tripsColumns,
    labels.mySalary,
    `my_salary_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // P&L — full report sheet only (reuse full report but single-sheet? use compact version)
  const pnlRows = (() => {
    const map = {}
    trips.forEach(tr => {
      const d = (tr.created_at || '').slice(0, 10)
      if (!map[d]) map[d] = { date: d, income: 0, expense: 0 }
      map[d].income += (tr.income || 0)
    })
    const addE = (d, a) => {
      if (!d || !a) return
      const k = d.slice(0, 10)
      if (!map[k]) map[k] = { date: k, income: 0, expense: 0 }
      map[k].expense += a
    }
    fuels.forEach(f => addE(f.date, f.cost || 0))
    serviceRecs.forEach(r => addE(r.date, r.cost || 0))
    tireRecs.forEach(r => addE(r.installed_at, r.cost || 0))
    vehicleExps.forEach(e => addE(e.date, e.amount || 0))
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(r => ({
      date: r.date,
      income: r.income,
      expense: r.expense,
      profit: r.income - r.expense,
    }))
  })()
  const pnlColumns = [
    { header: labels.date, key: 'date' },
    { header: `${labels.income} (${cs})`, key: 'income' },
    { header: `${labels.expense} (${cs})`, key: 'expense' },
    { header: `${labels.profit} (${cs})`, key: 'profit' },
  ]
  const doPnlExcel = () => runExport('pnl_excel', () => exportToExcel(
    pnlRows, pnlColumns,
    `pnl_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doPnlPdf = () => runExport('pnl_pdf', () => exportToPDF(
    pnlRows.map(r => ({ ...r, income: fmt(r.income), expense: fmt(r.expense), profit: fmt(r.profit) })),
    pnlColumns,
    labels.pnlReport,
    `pnl_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // Net in hand (owner_operator only) — summary rows
  const netInHandRows = [
    { metric: t('overview.income'), amount: totalIncome },
    { metric: labels.vehicleExpenses, amount: totalVehicleExp },
    { metric: t('reports.businessProfit'), amount: netProfit },
    { metric: labels.personalExpenses, amount: personalCost },
    { metric: t('reports.netInHand'), amount: netInHandAmt },
  ]
  const netInHandColumns = [
    { header: labels.metric, key: 'metric' },
    { header: `${labels.amount} (${cs})`, key: 'amount' },
  ]
  const doNetInHandExcel = () => runExport('nih_excel', () => exportToExcel(
    netInHandRows, netInHandColumns,
    `net_in_hand_${getDateRange().start}_${getDateRange().end}.xlsx`,
  ))
  const doNetInHandPdf = () => runExport('nih_pdf', () => exportToPDF(
    netInHandRows.map(r => ({ ...r, amount: fmt(r.amount) })),
    netInHandColumns,
    t('reports.netInHand'),
    `net_in_hand_${getDateRange().start}_${getDateRange().end}.pdf`,
  ))

  // ---- UI ----

  const cardStyle = {
    background: theme.card,
    borderRadius: 16,
    padding: 14,
    border: `1px solid ${theme.border}`,
    marginBottom: 10,
  }
  const dimText = { fontSize: 12, color: theme.dim }

  const periods = [
    { key: 'week', label: t('overview.periodWeek') },
    { key: 'month', label: t('overview.periodMonth') },
    { key: '3m', label: '3 ' + t('overview.financeMonths') },
    { key: '6m', label: '6 ' + t('overview.financeMonths') },
    { key: 'year', label: t('overview.financeYear') },
    { key: 'custom', label: t('overview.customPeriod') },
  ]

  const dlBtn = (label, onClick, disabled, active) => (
    <button
      onClick={onClick}
      disabled={disabled || active}
      style={{
        flex: 1, padding: '10px 6px', border: 'none', borderRadius: 10,
        background: (disabled || active) ? theme.border : theme.card2 || theme.bg,
        color: (disabled) ? theme.dim : theme.text,
        fontSize: 13, fontWeight: 600,
        cursor: (disabled || active) ? 'default' : 'pointer',
        opacity: active ? 0.6 : 1,
      }}
    >
      {active ? '\u23f3 ...' : label}
    </button>
  )

  const categoryCard = (icon, title, summary, onDetails, excelKey, pdfKey, onExcel, onPdf, empty) => (
    <div style={{ ...cardStyle, opacity: empty ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{title}</div>
          <div style={{ fontSize: 12, color: theme.dim, marginTop: 2 }}>{summary}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {onDetails && (
          <button
            onClick={onDetails}
            style={{
              flex: 1, padding: '10px 6px', border: '1px solid ' + theme.border, borderRadius: 10,
              background: 'transparent', color: theme.text,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('reports.details')} {'\u2192'}
          </button>
        )}
        {dlBtn('\ud83d\udcca Excel', onExcel, empty, exporting === excelKey)}
        {dlBtn('\ud83d\udcc4 PDF', onPdf, empty, exporting === pdfKey)}
      </div>
    </div>
  )

  const tripsEmpty = trips.length === 0
  const fuelEmpty = fuels.length === 0
  const vExpEmpty = vExpCombined.length === 0
  const bytEmpty = bytExps.length === 0
  const pnlEmpty = pnlRows.length === 0
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
        <div style={{ fontSize: 18, fontWeight: 700 }}>{'\ud83d\udcc4'} {t('reports.title')}</div>
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
          {/* Full report card */}
          <div style={{
            ...cardStyle,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.08))',
            border: '1px solid rgba(245,158,11,0.35)',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>{'\ud83d\udce6'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{t('reports.fullReport')}</div>
                <div style={{ fontSize: 12, color: theme.dim, marginTop: 2 }}>{t('reports.fullReportDesc')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={doFullExcel}
                disabled={!!exporting}
                style={{
                  flex: 1, padding: '12px 6px', border: 'none', borderRadius: 12,
                  background: exporting ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'default' : 'pointer',
                  opacity: exporting === 'full_excel' ? 0.7 : 1,
                }}
              >
                {exporting === 'full_excel' ? '\u23f3' : '\ud83d\udcca'} Excel
              </button>
              <button
                onClick={doFullPdf}
                disabled={!!exporting}
                style={{
                  flex: 1, padding: '12px 6px', border: 'none', borderRadius: 12,
                  background: exporting ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'default' : 'pointer',
                  opacity: exporting === 'full_pdf' ? 0.7 : 1,
                }}
              >
                {exporting === 'full_pdf' ? '\u23f3' : '\ud83d\udcc4'} PDF
              </button>
            </div>
          </div>

          {/* Financial section */}
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.dim, margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {'\ud83d\udcb0'} {t('reports.financialSection')}
          </div>
          {isOwner ? (
            <>
              {categoryCard(
                '\ud83d\udcca',
                t('reports.businessPnl'),
                pnlEmpty
                  ? t('reports.noRecords')
                  : `${t('overview.income')}: ${cs}${fmt(totalIncome)} \u00b7 ${labels.vehicleExpenses}: ${cs}${fmt(totalVehicleExp)} \u00b7 ${t('reports.businessProfit')}: ${netProfit >= 0 ? '+' : ''}${cs}${fmt(netProfit)}`,
                () => onNavigate?.('business_pnl_report', { period, customFrom, customTo }),
                'pnl_excel', 'pnl_pdf',
                doPnlExcel, doPnlPdf,
                pnlEmpty,
              )}
              {categoryCard(
                '\ud83d\udcb5',
                t('reports.netInHand'),
                `${t('reports.businessProfit')}: ${cs}${fmt(netProfit)} \u00b7 ${labels.personalExpenses}: ${cs}${fmt(personalCost)} \u00b7 ${t('reports.netInHand')}: ${netInHandAmt >= 0 ? '+' : ''}${cs}${fmt(netInHandAmt)}`,
                () => onNavigate?.('net_in_hand_report', { period, customFrom, customTo }),
                'nih_excel', 'nih_pdf',
                doNetInHandExcel, doNetInHandPdf,
                false,
              )}
            </>
          ) : (
            <>
              {categoryCard(
                '\ud83d\udcb5',
                t('pay.mySalary'),
                salaryEmpty
                  ? t('reports.noRecords')
                  : `${t('pay.earnedMonth')}: ${cs}${fmt(totalDriverPay)} \u00b7 ${t('byt.personalExpenses')}: ${cs}${fmt(personalCost)} \u00b7 ${t('pay.netToMe')}: ${netToMe >= 0 ? '+' : ''}${cs}${fmt(netToMe)}`,
                () => onNavigate?.('my_salary'),
                'salary_excel', 'salary_pdf',
                doSalaryExcel, doSalaryPdf,
                salaryEmpty,
              )}
              {categoryCard(
                '\ud83d\udcca',
                t('reports.pnlReport'),
                pnlEmpty
                  ? t('reports.noRecords')
                  : `${t('overview.income')}: ${cs}${fmt(totalIncome)} \u00b7 ${t('overview.expense')}: ${cs}${fmt(totalVehicleExp)} \u00b7 ${isDriver ? t('reports.vehicleResult') : t('overview.netInHand')}: ${netProfit >= 0 ? '+' : ''}${cs}${fmt(netProfit)}`,
                () => onNavigate?.('finance'),
                'pnl_excel', 'pnl_pdf',
                doPnlExcel, doPnlPdf,
                pnlEmpty,
              )}
            </>
          )}

          {/* Operations section */}
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.dim, margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {'\ud83d\ude9b'} {t('reports.operationalSection')}
          </div>
          {categoryCard(
            '\ud83d\ude9a',
            t('tabs.trips'),
            tripsEmpty
              ? t('reports.noRecords')
              : `${trips.length} \u00b7 ${cs}${fmt(totalIncome)} \u00b7 ${fmt(totalDist)} ${distLabel}`,
            () => onNavigate?.(isOwner ? 'trips_report' : 'trips', { period, customFrom, customTo }),
            'trips_excel', 'trips_pdf',
            doTripsExcel, doTripsPdf,
            tripsEmpty,
          )}
          {categoryCard(
            '\u26fd',
            t('tabs.fuel'),
            fuelEmpty
              ? t('reports.noRecords')
              : `${cs}${fmt(fuelCost)} \u00b7 ${fuelVol.toFixed(1)} ${volLabel}${mpg > 0 ? ' \u00b7 MPG ' + (Math.round(mpg * 10) / 10) : ''}`,
            () => onNavigate?.('fuel_analytics'),
            'fuel_excel', 'fuel_pdf',
            doFuelExcel, doFuelPdf,
            fuelEmpty,
          )}
          {categoryCard(
            '\ud83d\udd27',
            labels.vehicleExpenses,
            vExpEmpty
              ? t('reports.noRecords')
              : `${cs}${fmt(vehicleExpCost + serviceCost + tireCost)} \u00b7 ${vExpCombined.length}`,
            () => onNavigate?.(isOwner ? 'vehicle_expenses_report' : 'vehicle_expenses', { period, customFrom, customTo }),
            'vexp_excel', 'vexp_pdf',
            doVExpExcel, doVExpPdf,
            vExpEmpty,
          )}
          {categoryCard(
            '\ud83c\udf7d\ufe0f',
            labels.personalExpenses,
            bytEmpty
              ? t('reports.noRecords')
              : `${cs}${fmt(personalCost)} \u00b7 ${bytExps.length}`,
            () => onNavigate?.(isOwner ? 'personal_expenses_report' : 'personal_expenses', { period, customFrom, customTo }),
            'byt_excel', 'byt_pdf',
            doBytExcel, doBytPdf,
            bytEmpty,
          )}

          <div style={{ height: 40 }} />
        </>
      )}
    </div>
  )
}
