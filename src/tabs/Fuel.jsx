import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchFuels, deleteFuel, fetchVehicleExpenses, deleteVehicleExpense } from '../lib/api'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { exportToPDF, exportToExcelWithSummary, exportAllVehiclesExcel } from '../utils/export'

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function polarToCart(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    const s1 = polarToCart(cx, cy, r, 0)
    const s2 = polarToCart(cx, cy, r, 180)
    return `M ${s1.x} ${s1.y} A ${r} ${r} 0 1 1 ${s2.x} ${s2.y} A ${r} ${r} 0 1 1 ${s1.x} ${s1.y}`
  }
  const start = polarToCart(cx, cy, r, startAngle)
  const end = polarToCart(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`
}

function getDateRange(period, customFrom, customTo) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}`
  if (period === 'day') return { from: today, to: null }
  if (period === 'week') {
    const wd = new Date(now)
    wd.setDate(wd.getDate() - 6)
    const wy = wd.getFullYear()
    const wm = String(wd.getMonth() + 1).padStart(2, '0')
    const wdd = String(wd.getDate()).padStart(2, '0')
    return { from: `${wy}-${wm}-${wdd}`, to: null }
  }
  if (period === 'month') {
    return { from: `${y}-${m}-01`, to: null }
  }
  if (period === 'custom') {
    return { from: customFrom || today, to: customTo || today }
  }
  return { from: null, to: null }
}

export default function Fuel({ userId, refreshKey, profile, filterVehicleId, userRole, vehicles, isAllVehicles, initialCategory }) {
  const { t, lang } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const CATEGORIES = useMemo(() => [
    { key: 'all', icon: '', label: t('fuel.all') },
    { key: 'fuel', icon: '\u26fd', label: t('fuel.fuelCat'), color: '#f59e0b' },
    { key: 'def', icon: '\ud83d\udca7', label: t('fuel.def'), color: '#06b6d4' },
    { key: 'oil', icon: '\ud83d\udee2', label: t('fuel.oil'), color: '#a855f7' },
    { key: 'parts', icon: '\ud83d\udd27', label: t('fuel.parts'), color: '#ef4444' },
    { key: 'equipment', icon: '\ud83d\udce6', label: t('fuel.equipment'), color: '#3b82f6' },
    { key: 'supplies', icon: '\ud83e\udde4', label: t('fuel.supplies'), color: '#22c55e' },
    { key: 'hotel', icon: '\ud83c\udfe8', label: t('fuel.hotel'), color: '#ec4899' },
    { key: 'toll', icon: '\ud83c\udd7f\ufe0f', label: t('fuel.toll'), color: '#8b5cf6' },
  ], [t])

  function getCat(key) {
    const k = key === 'platon' ? 'toll' : key
    return CATEGORIES.find(c => c.key === k) || CATEGORIES[1]
  }

  const [fuelEntries, setFuelEntries] = useState([])
  const [vehicleExpenses, setVehicleExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(initialCategory || 'all')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [expanded, setExpanded] = useState(false)
  const exportRef = useRef(null)
  const filterRef = useRef(null)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const [fuels, vExpenses] = await Promise.all([
        fetchFuels(userId),
        fetchVehicleExpenses(userId),
      ])
      setFuelEntries(fuels)
      setVehicleExpenses(vExpenses)
    } catch (err) {
      console.error('Failed to load vehicle data:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleDeleteFuel = async (id) => {
    try {
      await deleteFuel(id)
      setFuelEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete fuel:', err)
    }
  }

  const handleDeleteVehicleExpense = async (id) => {
    try {
      await deleteVehicleExpense(id)
      setVehicleExpenses((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete vehicle expense:', err)
    }
  }

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilterDropdown) return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setShowFilterDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterDropdown])

  const isCompany = userRole === 'company'

  // Helper: build export rows from an entries list
  const buildExportRows = (entries, fuelsSource) => entries.map(e => {
    const fuel = e.source === 'fuel' ? fuelsSource.find(f => f.id === e.id) : null
    const vol = fuel ? (fuel.liters || 0) : ''
    const cost = e.amount || 0
    const ppg = (fuel && vol > 0) ? Math.round((cost / vol) * 100) / 100 : ''
    return {
      date: e.date || '',
      description: e.name || '',
      category: getCat(e.category).label,
      volume: vol || '',
      price_per_unit: ppg,
      amount: Math.round(cost * 100) / 100,
      odometer: fuel ? (fuel.odometer || '') : '',
    }
  })

  const handleExport = async (format) => {
    setShowExportMenu(false)
    const volLabel = unitSys === 'imperial' ? t('excel.gallons') : t('fuel.exportVolume')
    const priceLabel = unitSys === 'imperial'
      ? `${t('fuel.exportPricePerGal')} (${cs})`
      : `${t('fuel.exportPricePerUnit')} (${cs})`
    const distLabel = unitSys === 'imperial' ? t('excel.distMiles') : t('trips.km')
    const columns = [
      { header: t('fuel.exportDate'), key: 'date' },
      { header: t('fuel.exportDescription'), key: 'description' },
      { header: t('fuel.exportCategory'), key: 'category' },
      { header: volLabel, key: 'volume' },
      { header: priceLabel, key: 'price_per_unit' },
      { header: `${t('fuel.exportAmount')} (${cs})`, key: 'amount' },
      { header: `${t('fuel.exportOdometer')} (${distLabel})`, key: 'odometer' },
    ]
    const rows = buildExportRows(periodEntries, filteredFuels)
    const now2 = new Date()
    const mm = String(now2.getMonth() + 1).padStart(2, '0')
    const ym = `${now2.getFullYear()}_${mm}`

    // --- All vehicles multi-sheet export (company + "all" selected) ---
    if (format === 'excel' && isAllVehicles) {
      const vehicleIds = new Set((vehicles || []).map(v => v.id))
      const allVehicleList = [...(vehicles || [])]

      // Assign entries with null/unknown vehicle_id to the first vehicle (same pattern as FinanceDetails.jsx)
      const firstVehicle = allVehicleList[0]
      if (firstVehicle) {
        const orphanFuels = fuelEntries.filter(e => !vehicleIds.has(e.vehicle_id))
        const orphanExps = vehicleExpenses.filter(e => !vehicleIds.has(e.vehicle_id))
        if (orphanFuels.length > 0 || orphanExps.length > 0) {
          firstVehicle._fuels = [
            ...(firstVehicle._fuels || fuelEntries.filter(e => e.vehicle_id === firstVehicle.id)),
            ...orphanFuels,
          ]
          firstVehicle._exps = [
            ...(firstVehicle._exps || vehicleExpenses.filter(e => e.vehicle_id === firstVehicle.id)),
            ...orphanExps,
          ]
        }
      }

      // Build per-vehicle entries for vehicle summary + combined "by date" rows
      const allExportRows = []
      const vehicleSummary = []
      const catTotals = {}

      for (const v of allVehicleList) {
        const vFuels = v._fuels || fuelEntries.filter(e => e.vehicle_id === v.id)
        const vExps = v._exps || vehicleExpenses.filter(e => e.vehicle_id === v.id)
        const vEntries = [
          ...vFuels.map(e => ({
            id: e.id, source: 'fuel', category: 'fuel',
            name: e.station || t('fuel.refueling'),
            date: e.date, amount: e.cost || 0,
          })),
          ...vExps.map(e => ({
            id: e.id, source: 'vehicle_expense', category: e.category || 'other',
            name: e.description || getCat(e.category).label,
            date: e.date, amount: e.amount || 0,
          })),
        ]
        // Apply period filter
        const filtered = vEntries.filter(e => {
          if (!periodFrom) return true
          if (e.date < periodFrom) return false
          if (periodTo && e.date > periodTo) return false
          return true
        })

        const exportRows = buildExportRows(filtered, vFuels)
        allExportRows.push(...exportRows)

        // Accumulate category totals
        for (const e of filtered) {
          const catKey = e.category
          if (!catTotals[catKey]) catTotals[catKey] = { count: 0, amount: 0 }
          catTotals[catKey].count += 1
          catTotals[catKey].amount += Math.round(e.amount)
        }

        // Vehicle summary row
        if (filtered.length > 0) {
          const vName = `${v.brand || ''} ${v.model || ''}`.trim()
          vehicleSummary.push({
            name: vName,
            plate: v.plate_number || v.license_plate || '',
            driver: v.driver_name || '',
            amount: Math.round(filtered.reduce((s, e) => s + e.amount, 0)),
            count: filtered.length,
          })
        }
      }

      // Sort all rows by date descending
      allExportRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      // Build category data array
      const categoryData = CATEGORIES
        .filter(c => c.key !== 'all' && catTotals[c.key])
        .map(c => ({ label: c.label, count: catTotals[c.key].count, amount: catTotals[c.key].amount }))

      const fuelPerDistLabel2 = unitSys === 'imperial'
        ? t('fuel.exportFuelPerMile')
        : t('fuel.exportFuelPerKm')
      if (allExportRows.length > 0 || vehicleSummary.length > 0) {
        await exportAllVehiclesExcel({
          allRows: allExportRows,
          columns,
          categoryData,
          vehicleSummary,
          labels: {
            total: t('fuel.total'),
            category: t('fuel.exportCategory'),
            entriesCount: t('fuel.entries'),
            amount: t('fuel.exportAmount'),
            vehicle: t('fuel.exportVehicle'),
            plate: t('fuel.exportPlate'),
            driver: t('fuel.exportDriver'),
            average: t('fuel.exportAverage'),
          },
          fuelTotals: {
            volumeKey: 'volume',
            priceKey: 'price_per_unit',
            amountKey: 'amount',
            odometerKey: 'odometer',
            fuelPerDistLabel: fuelPerDistLabel2,
          },
          sheetNames: {
            byDate: t('fuel.sheetByDate'),
            byCategory: t('fuel.sheetByCategory'),
            byVehicle: t('fuel.sheetByVehicle'),
          },
          cs,
          filename: `expenses_all_vehicles_${mm}_${now2.getFullYear()}.xlsx`,
        })
      }
      return
    }

    // --- Single vehicle export (plate number in filename) ---
    if (format === 'excel') {
      let filenamePlate = ''
      if (filterVehicleId && vehicles && vehicles.length > 0) {
        const v = vehicles.find(vh => vh.id === filterVehicleId)
        if (v) {
          filenamePlate = (v.plate_number || v.license_plate || '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '')
        }
      }
      const exportFilename = filenamePlate
        ? `expenses_${filenamePlate}_${mm}_${now2.getFullYear()}.xlsx`
        : `fuel_report_${ym}.xlsx`

      // Build category data with counts
      const categoryData = CATEGORIES
        .filter(c => c.key !== 'all' && totals[c.key] > 0)
        .map(c => {
          const count = periodEntries.filter(e => e.category === c.key).length
          return { label: c.label, count, amount: Math.round(totals[c.key]) }
        })

      const fuelPerDistLabel = unitSys === 'imperial'
        ? t('fuel.exportFuelPerMile')
        : t('fuel.exportFuelPerKm')
      await exportToExcelWithSummary({
        summary: {
          currencySymbol: cs,
        },
        detailsData: rows,
        detailsColumns: columns,
        detailsSheetName: t('fuel.sheetByDate'),
        categoryData,
        categorySheetName: t('fuel.sheetByCategory'),
        labels: {
          category: t('fuel.exportCategory'),
          entriesCount: t('fuel.entries'),
          amount: t('fuel.exportAmount'),
          total: t('fuel.total'),
          average: t('fuel.exportAverage'),
        },
        fuelTotals: {
          volumeKey: 'volume',
          priceKey: 'price_per_unit',
          amountKey: 'amount',
          odometerKey: 'odometer',
          fuelPerDistLabel,
        },
        filename: exportFilename,
      })
    } else {
      // Build period-aware title
      const monthNames = t('expenses.monthNames')
      let periodStr = ''
      const fmtD = (ds) => { const p = ds.split('-'); return `${p[2]}.${p[1]}.${p[0]}` }
      if (period === 'month') {
        periodStr = `${monthNames[now2.getMonth()]} ${now2.getFullYear()}`
      } else if (period === 'day') {
        periodStr = fmtD(getDateRange('day').from)
      } else if (period === 'week') {
        const r = getDateRange('week')
        periodStr = `${fmtD(r.from)}\u2013${fmtD(now2.toISOString().slice(0, 10))}`
      } else if (period === 'custom' && customFrom) {
        const r = getDateRange('custom', customFrom, customTo)
        periodStr = `${fmtD(r.from)}\u2013${fmtD(r.to)}`
      }
      const pdfTitle = periodStr
        ? `${t('expenses.expensesReport')} \u2014 ${periodStr}`
        : t('expenses.expensesReport')
      // Build vehicle subtitle
      let pdfSubtitle = ''
      if (filterVehicleId && vehicles && vehicles.length > 0) {
        const v = vehicles.find(vh => vh.id === filterVehicleId)
        if (v) pdfSubtitle = `${v.brand || ''} ${v.model || ''} \u00b7 ${v.plate_number || ''}`.trim()
      } else if (isAllVehicles) {
        pdfSubtitle = t('expenses.allVehicles')
      }
      exportToPDF(rows, columns, pdfTitle, `fuel_report_${ym}.pdf`, lang, pdfSubtitle)
    }
  }

  // Filter by vehicle if filterVehicleId is set (company role)
  const filteredFuels = filterVehicleId ? fuelEntries.filter(e => e.vehicle_id === filterVehicleId) : fuelEntries
  const filteredVehicleExps = filterVehicleId ? vehicleExpenses.filter(e => e.vehicle_id === filterVehicleId) : vehicleExpenses

  // Normalize all entries into a unified list
  const allEntries = [
    ...filteredFuels.map(e => ({
      id: e.id,
      source: 'fuel',
      category: 'fuel',
      name: e.station || t('fuel.refueling'),
      subtitle: e.liters ? `${e.liters} ${unitSys === 'imperial' ? 'gal' : t('fuel.litersShort')} \u00b7 ${formatNumber(e.odometer || 0)} ${unitSys === 'imperial' ? 'mi' : t('trips.km')}` : '',
      date: e.date,
      amount: e.cost || 0,
    })),
    ...filteredVehicleExps.map(e => ({
      id: e.id,
      source: 'vehicle_expense',
      category: e.category || 'other',
      name: e.description || getCat(e.category).label,
      subtitle: '',
      date: e.date,
      amount: e.amount || 0,
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  // Period filter
  const { from: periodFrom, to: periodTo } = getDateRange(period, customFrom, customTo)
  const periodEntries = allEntries.filter(e => {
    if (!periodFrom) return true
    if (e.date < periodFrom) return false
    if (periodTo && e.date > periodTo) return false
    return true
  })

  // Summary label
  const periodLabel = period === 'day' ? t('expenses.forDay')
    : period === 'week' ? t('expenses.forWeek')
    : period === 'custom' ? t('expenses.forPeriod')
    : t('fuel.forMonth')

  // Totals by category for the period
  const totals = {}
  CATEGORIES.filter(c => c.key !== 'all').forEach(c => { totals[c.key] = 0 })
  periodEntries.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount })
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)
  const totalCount = periodEntries.length

  // Pie chart
  const pieData = CATEGORIES.filter(c => c.key !== 'all' && totals[c.key] > 0)
  let cumAngle = 0
  const slices = pieData.map(cat => {
    const fraction = grandTotal > 0 ? totals[cat.key] / grandTotal : 0
    const startAngle = cumAngle
    cumAngle += fraction * 360
    return { ...cat, fraction, startAngle, endAngle: cumAngle, total: totals[cat.key] }
  })

  // Filter list by category
  const filtered = filter === 'all' ? periodEntries : periodEntries.filter(e => e.category === filter)

  // Collapse: show only 5 unless expanded
  const COLLAPSE_LIMIT = 5
  const displayList = expanded ? filtered : filtered.slice(0, COLLAPSE_LIMIT)
  const showCollapseBtn = filtered.length > COLLAPSE_LIMIT

  const periodBtnStyle = (active) => ({
    padding: '8px 16px',
    borderRadius: '10px',
    border: 'none',
    background: active ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
    color: active ? '#fff' : 'var(--dim, #64748b)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  })

  return (
    <div style={{ padding: '16px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingRight: 44 }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text, #e2e8f0)', margin: 0 }}>
          {t('fuel.vehicleExpenses')}
        </h2>
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border, #1e2a3f)',
              background: 'var(--card, #111827)',
              color: 'var(--text, #e2e8f0)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {'\ud83d\udce5'} {t('fuel.export')}
          </button>
          {showExportMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '6px',
              background: 'var(--card, #111827)',
              border: '1px solid var(--border, #1e2a3f)',
              borderRadius: '10px',
              overflow: 'hidden',
              zIndex: 50,
              minWidth: '160px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              <button
                onClick={() => handleExport('excel')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text, #e2e8f0)',
                  fontSize: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {'\ud83d\udcc4'} {t('fuel.exportExcel')}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderTop: '1px solid var(--border, #1e2a3f)',
                  background: 'transparent',
                  color: 'var(--text, #e2e8f0)',
                  fontSize: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {'\ud83d\udcc3'} {t('fuel.exportPDF')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          flex: 1,
          backgroundColor: 'var(--card)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ color: 'var(--dim)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {periodLabel}
          </div>
          <div style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(Math.round(grandTotal))} {cs}
          </div>
        </div>
        <div style={{
          flex: 1,
          backgroundColor: 'var(--card)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ color: 'var(--dim)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {t('fuel.entries')}
          </div>
          <div style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {totalCount}
          </div>
        </div>
      </div>

      {/* Pie chart + legend */}
      {grandTotal > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          background: 'var(--card, #111827)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
          border: '1px solid var(--border, #1e2a3f)',
        }}>
          <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
            <svg viewBox="0 0 140 140" width="140" height="140">
              {slices.map((s, i) => (
                <path
                  key={i}
                  d={describeArc(70, 70, 60, s.startAngle, s.endAngle)}
                  fill={s.color}
                  stroke="var(--card, #111827)"
                  strokeWidth="2"
                />
              ))}
              <circle cx="70" cy="70" r="36" fill="var(--card, #111827)" />
            </svg>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--dim, #64748b)' }}>{t('fuel.total')}</div>
              <div style={{
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: 'var(--text, #e2e8f0)',
              }}>
                {grandTotal.toLocaleString('ru-RU')}{cs}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            {slices.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: s.color,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: '13px', color: 'var(--dim, #64748b)', flex: 1 }}>
                  {s.icon} {s.label}
                </span>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: 'var(--text, #e2e8f0)',
                }}>
                  {s.total.toLocaleString('ru-RU')}{cs}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter dropdown */}
      <div ref={filterRef} style={{ position: 'relative', marginBottom: '12px' }}>
        <button
          onClick={() => setShowFilterDropdown(v => !v)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border, #1e2a3f)',
            background: 'var(--card, #111827)',
            color: 'var(--text, #e2e8f0)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {t('fuel.categoryLabel')}: {(() => {
              const cur = CATEGORIES.find(c => c.key === filter)
              return cur ? (cur.icon ? `${cur.icon} ${cur.label}` : cur.label) : ''
            })()}
          </span>
          <span style={{
            transform: showFilterDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            fontSize: '12px',
          }}>{'\u25bc'}</span>
        </button>
        {showFilterDropdown && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: '4px',
            background: 'var(--card, #111827)',
            border: '1px solid var(--border, #1e2a3f)',
            borderRadius: '12px',
            overflow: 'hidden',
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}>
            {CATEGORIES.map((cat, idx) => {
              const active = filter === cat.key
              return (
                <button
                  key={cat.key}
                  onClick={() => { setFilter(cat.key); setShowFilterDropdown(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    borderTop: idx > 0 ? '1px solid var(--border, #1e2a3f)' : 'none',
                    background: active ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                    color: active ? '#f59e0b' : 'var(--text, #e2e8f0)',
                    fontSize: '14px',
                    fontWeight: active ? 700 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {cat.icon && <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{cat.icon}</span>}
                  {cat.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {['day', 'week', 'month', 'custom'].map(p => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setExpanded(false) }}
            style={periodBtnStyle(period === p)}
          >
            {p === 'day' ? t('expenses.day') : p === 'week' ? t('expenses.week') : p === 'month' ? t('expenses.month') : t('expenses.period')}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '16px',
          background: 'var(--card, #111827)',
          borderRadius: '12px',
          padding: '12px 16px',
          border: '1px solid var(--border, #1e2a3f)',
        }}>
          <label style={{ fontSize: '13px', color: 'var(--dim, #64748b)', fontWeight: 600 }}>
            {t('expenses.dateFrom')}
          </label>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid var(--border, #1e2a3f)',
              background: 'var(--bg, #0a0e1a)',
              color: 'var(--text, #e2e8f0)',
              fontSize: '13px',
            }}
          />
          <label style={{ fontSize: '13px', color: 'var(--dim, #64748b)', fontWeight: 600 }}>
            {t('expenses.dateTo')}
          </label>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid var(--border, #1e2a3f)',
              background: 'var(--bg, #0a0e1a)',
              color: 'var(--text, #e2e8f0)',
              fontSize: '13px',
            }}
          />
        </div>
      )}

      {/* Expense list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          {t('fuel.noEntries')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {displayList.map(entry => {
            const cat = getCat(entry.category)
            return (
              <div
                key={`${entry.source}-${entry.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'var(--card, #111827)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  border: '1px solid var(--border, #1e2a3f)',
                }}
              >
                <span style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: `${cat.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                }}>
                  {cat.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text, #e2e8f0)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--dim, #64748b)', marginTop: '2px' }}>
                    {cat.label} {'\u00b7'} {formatDate(entry.date)}
                    {entry.subtitle ? ` \u00b7 ${entry.subtitle}` : ''}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text, #e2e8f0)',
                  flexShrink: 0,
                }}>
                  {formatNumber(Math.round(entry.amount))}{cs}
                </div>
                {!isCompany && (
                  <button
                    onClick={() => entry.source === 'fuel'
                      ? handleDeleteFuel(entry.id)
                      : handleDeleteVehicleExpense(entry.id)
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef444488',
                      fontSize: '16px',
                      cursor: 'pointer',
                      padding: '4px',
                      flexShrink: 0,
                    }}
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            )
          })}
          {showCollapseBtn && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid var(--border, #1e2a3f)',
                background: 'var(--card, #111827)',
                color: '#f59e0b',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {expanded
                ? `${t('expenses.collapse')} \u25b2`
                : `${t('expenses.allExpenses')} \u25bc`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
