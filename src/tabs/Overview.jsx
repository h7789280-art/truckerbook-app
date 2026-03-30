import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchInsurance, fetchVehicleExpenses, getActiveShift, startShift, endShift, getCompletedShifts, getShiftStats, getTodayShiftSummary, getVehicleShifts, startDrivingSession, endDrivingSession, fetchFleetSummary, fetchVehicleReport, fetchDriverReport, fetchAllDriversComparison, fetchFleetAnalytics, fetchDriversSalaryData, fetchAchievementStats } from '../lib/api'
import { exportToExcel, exportToPDF } from '../utils/export'
import Achievements, { ACHIEVEMENTS } from '../components/Achievements'
import { readOdometerFromPhoto } from '../lib/geminiVision'
import DispatchBoard from '../components/DispatchBoard'
import AIForecast from '../components/AIForecast'
import { scheduleHOSWarning, scheduleMaintenanceReminder, scheduleTrialExpiry } from '../lib/notifications'

function getGreeting(name, t) {
  const h = new Date().getHours()
  const n = name || ''
  if (h >= 6 && h < 12) return { text: `${t('greeting.morning')}, ${n}!`, icon: '\u2600\ufe0f' }
  if (h >= 12 && h < 18) return { text: `${t('greeting.afternoon')}, ${n}!`, icon: '\ud83d\udc4b' }
  if (h >= 18 && h < 23) return { text: `${t('greeting.evening')}, ${n}!`, icon: '\ud83c\udf05' }
  return { text: `${t('greeting.night')}, ${n}!`, icon: '\ud83c\udf19' }
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

function getMonthName(date) {
  const months = [
    '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
    '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
    '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
    '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
  ]
  return months[date.getMonth()] + ' ' + date.getFullYear()
}

export default function Overview({ userName, userId, profile, onOpenProfile, activeVehicleId, refreshKey, onExtraNav, userRole }) {
  const { theme, mode, setMode } = useTheme()
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const THEME_OPTIONS = [
    { key: 'light', label: t('overview.themeDay') },
    { key: 'dark', label: t('overview.themeNight') },
    { key: 'red_night', label: t('overview.themeRed') },
    { key: 'auto', label: t('overview.themeAuto') },
  ]
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef(null)
  const [drivingSessionId, setDrivingSessionId] = useState(null)
  const [hosWarning, setHosWarning] = useState(null)
  const hosMode = profile?.hos_mode || 'cis'
  const hosMaxSeconds = hosMode === 'usa' ? 39600 : 32400 // 11h or 9h
  const hosBreak8hSeconds = 28800 // 8h
  const [profileName, setProfileName] = useState(userName || null)
  const [loading, setLoading] = useState(true)
  const [monthData, setMonthData] = useState({ income: 0, fuelCost: 0, bytCost: 0, serviceCost: 0, tripCount: 0, totalKm: 0, avgConsumption: 0 })
  const [expenseBreakdown, setExpenseBreakdown] = useState([])
  const [reminders, setReminders] = useState([])
  const [activeShift, setActiveShift] = useState(null)
  const [shiftModal, setShiftModal] = useState(null) // 'start' | 'end' | null
  const [shiftOdometer, setShiftOdometer] = useState('')
  const [shiftElapsed, setShiftElapsed] = useState(0)
  const shiftTimerRef = useRef(null)
  const [shiftPhoto, setShiftPhoto] = useState(null)
  const [shiftPhotoPreview, setShiftPhotoPreview] = useState(null)
  const [aiOdometerStatus, setAiOdometerStatus] = useState(null) // 'loading' | 'success' | 'error' | null
  const [aiOdometerValue, setAiOdometerValue] = useState(null)
  const [shiftPeriod, setShiftPeriod] = useState('week')
  const [shiftStats, setShiftStats] = useState({ count: 0, totalKm: 0, totalHours: 0 })
  const [shiftHistory, setShiftHistory] = useState([])
  const [todaySummary, setTodaySummary] = useState(null)
  const [fleetData, setFleetData] = useState(null)
  const [vehicleReportView, setVehicleReportView] = useState(null) // vehicle object or null
  const [vehicleReportData, setVehicleReportData] = useState(null)
  const [vehicleReportPeriod, setVehicleReportPeriod] = useState('month')
  const [vehicleReportLoading, setVehicleReportLoading] = useState(false)
  const [fleetTab, setFleetTab] = useState('vehicles') // 'vehicles' | 'drivers'
  const [driverReportView, setDriverReportView] = useState(null) // driver name string or null
  const [driverReportData, setDriverReportData] = useState(null)
  const [driverReportPeriod, setDriverReportPeriod] = useState('month')
  const [driverReportLoading, setDriverReportLoading] = useState(false)
  const [driversComparison, setDriversComparison] = useState([])
  const [driversComparisonPeriod, setDriversComparisonPeriod] = useState('month')
  // Analytics tab state
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsPeriod, setAnalyticsPeriod] = useState('month')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  // Salary state
  const [salaryData, setSalaryData] = useState([])
  const [salaryMode, setSalaryMode] = useState(() => {
    try { return localStorage.getItem('tb_salary_mode') || 'per_km' } catch { return 'per_km' }
  })
  const [salaryRate, setSalaryRate] = useState(() => {
    try { return parseFloat(localStorage.getItem('tb_salary_rate')) || 15 } catch { return 15 }
  })
  const [showFleetExportMenu, setShowFleetExportMenu] = useState(false)
  const fleetExportRef = useRef(null)
  const [achievementStats, setAchievementStats] = useState(null)
  const [showAchievements, setShowAchievements] = useState(false)

  // Close fleet export menu on outside click
  useEffect(() => {
    if (!showFleetExportMenu) return
    const handler = (e) => {
      if (fleetExportRef.current && !fleetExportRef.current.contains(e.target)) {
        setShowFleetExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFleetExportMenu])

  const handleFleetExport = (format) => {
    setShowFleetExportMenu(false)
    if (!fleetData) return
    const distLabel = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'
    const columns = [
      { header: t('overview.fleetDriver'), key: 'vehicle' },
      { header: t('overview.fleetDriver'), key: 'driver' },
      { header: t('overview.fleetFuel') + ' (' + cs + ')', key: 'fuel' },
      { header: t('overview.fleetTrips'), key: 'trips' },
      { header: distLabel, key: 'km' },
      { header: t('overview.fleetIncome') + ' (' + cs + ')', key: 'income' },
      { header: t('overview.fleetExpense') + ' (' + cs + ')', key: 'expense' },
      { header: t('overview.netProfit') + ' (' + cs + ')', key: 'profit' },
    ]
    // Fix first column header
    columns[0].header = t('overview.fleetVehicles')
    const rows = fleetData.vehicleStats.map(v => ({
      vehicle: `${v.brand || ''} ${v.model || ''} ${v.plate_number || ''}`.trim(),
      driver: v.driver_name || '',
      fuel: Math.round(v.monthFuelCost || 0),
      trips: v.monthTrips || 0,
      km: Math.round(v.monthKm || 0),
      income: Math.round(v.monthIncome || 0),
      expense: Math.round(v.monthExpenses || 0),
      profit: Math.round((v.monthIncome || 0) - (v.monthExpenses || 0)),
    }))
    const now2 = new Date()
    const ym = `${now2.getFullYear()}_${String(now2.getMonth() + 1).padStart(2, '0')}`
    if (format === 'excel') {
      exportToExcel(rows, columns, `fleet_report_${ym}.xlsx`)
    } else {
      exportToPDF(rows, columns, t('overview.fleetPanel'), `fleet_report_${ym}.pdf`)
    }
  }

  useEffect(() => {
    if (userName) { setProfileName(userName); return }
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data?.user) return
      supabase.from('profiles').select('name').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          if (!cancelled && profile?.name) setProfileName(profile.name)
        })
    })
    return () => { cancelled = true }
  }, [userName])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchAchievementStats(userId).then(data => {
      if (!cancelled) setAchievementStats(data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const achievementUnlocked = achievementStats ? ACHIEVEMENTS.filter(a => (achievementStats[a.stat] || 0) >= a.target).length : 0

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

      const [fuels, trips, bytExps, serviceRecs, insuranceRecs, vehicleExps] = await Promise.all([
        fetchFuels(userId),
        fetchTrips(userId),
        fetchBytExpenses(userId),
        fetchServiceRecords(userId).catch(() => []),
        fetchInsurance(userId).catch(() => []),
        fetchVehicleExpenses(userId).catch(() => []),
      ])

      // Filter to current month
      const monthFuels = fuels.filter(e => e.date >= monthStart)
      const monthTrips = trips.filter(e => (e.created_at || '').slice(0, 10) >= monthStart)
      const monthByt = bytExps.filter(e => e.date >= monthStart)
      const monthService = serviceRecs.filter(e => e.date >= monthStart)
      const monthVehicleExp = vehicleExps.filter(e => e.date >= monthStart)

      const fuelCost = monthFuels.reduce((s, e) => s + (e.cost || 0), 0)
      const bytCost = monthByt.reduce((s, e) => s + (e.amount || 0), 0)
      const serviceCost = monthService.reduce((s, e) => s + (e.cost || 0), 0)
      const vehicleExpCost = monthVehicleExp.reduce((s, e) => s + (e.amount || 0), 0)
      const income = monthTrips.reduce((s, t) => s + (t.income || 0), 0)
      const totalKm = monthTrips.reduce((s, t) => s + (t.distance_km || 0), 0)
      const totalLiters = monthFuels.reduce((s, e) => s + (e.liters || 0), 0)
      const avgConsumption = totalKm > 0 ? (totalLiters / totalKm * 100) : 0

      setMonthData({
        income,
        fuelCost,
        bytCost,
        serviceCost,
        vehicleExpCost,
        tripCount: monthTrips.length,
        totalKm,
        avgConsumption,
      })

      // Expense breakdown for chart
      const breakdown = []
      if (fuelCost > 0) breakdown.push({ label: t('overview.fuelShort'), value: fuelCost, color: '#f59e0b' })
      if (serviceCost > 0) breakdown.push({ label: t('overview.repairShort'), value: serviceCost, color: '#ef4444' })
      if (vehicleExpCost > 0) breakdown.push({ label: t('overview.vehicleShort'), value: vehicleExpCost, color: '#8b5cf6' })
      // Group byt by category
      const bytByCategory = {}
      monthByt.forEach(e => {
        const cat = e.category || 'other'
        bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
      })
      if (bytByCategory.food) breakdown.push({ label: t('overview.foodShort'), value: bytByCategory.food, color: '#22c55e' })
      if (bytByCategory.hotel) breakdown.push({ label: t('overview.housingShort'), value: bytByCategory.hotel, color: '#3b82f6' })
      const otherByt = Object.entries(bytByCategory)
        .filter(([k]) => k !== 'food' && k !== 'hotel')
        .reduce((s, [, v]) => s + v, 0)
      if (otherByt > 0) breakdown.push({ label: t('overview.otherShort'), value: otherByt, color: '#06b6d4' })
      setExpenseBreakdown(breakdown)

      // Reminders from insurance
      const reminderList = []
      const today = new Date()
      insuranceRecs.forEach(ins => {
        if (ins.date_to) {
          const endDate = new Date(ins.date_to)
          const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24))
          if (daysLeft > 0 && daysLeft < 365) {
            reminderList.push({
              icon: '\ud83d\udcc4',
              text: ins.type || '\u0421\u0442\u0440\u0430\u0445\u043e\u0432\u043a\u0430',
              sub: `${daysLeft} \u0434\u043d`,
            })
          }
        }
      })
      // Maintenance reminders from service_records (next_service_date within 7 days)
      const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      serviceRecs.forEach(rec => {
        if (rec.next_service_date) {
          const nsd = new Date(rec.next_service_date)
          if (nsd >= today && nsd <= in7days) {
            const vName = profile?.brand ? (profile.brand + ' ' + (profile.model || '')) : ''
            scheduleMaintenanceReminder(vName.trim(), rec.description || rec.service_type || '', t)
          }
        }
      })

      setReminders(reminderList)

      // Load fleet data for company role
      if (profile?.role === 'company') {
        try {
          const fleet = await fetchFleetSummary(userId)
          // Show fleet panel only if 2+ vehicles (including main)
          const mainVehicle = profile?.brand ? 1 : 0
          if ((fleet.totalVehicles + mainVehicle) >= 2) {
            setFleetData(fleet)
          } else {
            setFleetData(null)
          }
        } catch (err) {
          console.error('fetchFleetSummary error:', err)
        }
      }
    } catch (err) {
      console.error('Overview loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, t, profile?.role, profile?.brand])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  // Load vehicle report
  const openVehicleReport = useCallback(async (vehicle) => {
    setVehicleReportView(vehicle)
    setVehicleReportData(null)
    setVehicleReportLoading(true)
    try {
      const data = await fetchVehicleReport(vehicle.id, userId, vehicleReportPeriod)
      setVehicleReportData(data)
    } catch (err) {
      console.error('fetchVehicleReport error:', err)
    } finally {
      setVehicleReportLoading(false)
    }
  }, [userId, vehicleReportPeriod])

  // Reload report when period changes
  useEffect(() => {
    if (vehicleReportView) {
      openVehicleReport(vehicleReportView)
    }
  }, [vehicleReportPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load driver report
  const openDriverReport = useCallback(async (driverName) => {
    setDriverReportView(driverName)
    setDriverReportData(null)
    setDriverReportLoading(true)
    try {
      const data = await fetchDriverReport(driverName, userId, driverReportPeriod)
      setDriverReportData(data)
    } catch (err) {
      console.error('fetchDriverReport error:', err)
    } finally {
      setDriverReportLoading(false)
    }
  }, [userId, driverReportPeriod])

  useEffect(() => {
    if (driverReportView) {
      openDriverReport(driverReportView)
    }
  }, [driverReportPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load drivers comparison when fleet tab switches to drivers
  const loadDriversComparison = useCallback(async () => {
    if (!userId) return
    try {
      const data = await fetchAllDriversComparison(userId, driversComparisonPeriod)
      setDriversComparison(data)
    } catch (err) {
      console.error('fetchAllDriversComparison error:', err)
    }
  }, [userId, driversComparisonPeriod])

  useEffect(() => {
    if (fleetTab === 'drivers' && fleetData && profile?.role === 'company') {
      loadDriversComparison()
    }
  }, [fleetTab, fleetData, profile?.role, loadDriversComparison])

  // Load analytics data
  const loadAnalytics = useCallback(async () => {
    if (!userId) return
    setAnalyticsLoading(true)
    try {
      const data = await fetchFleetAnalytics(userId, analyticsPeriod)
      setAnalyticsData(data)
    } catch (err) {
      console.error('fetchFleetAnalytics error:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [userId, analyticsPeriod])

  useEffect(() => {
    if (fleetTab === 'analytics' && fleetData && profile?.role === 'company') {
      loadAnalytics()
    }
  }, [fleetTab, fleetData, profile?.role, loadAnalytics]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load salary data when drivers tab is active
  const loadSalaryData = useCallback(async () => {
    if (!userId) return
    try {
      const data = await fetchDriversSalaryData(userId, driversComparisonPeriod)
      setSalaryData(data)
    } catch (err) {
      console.error('fetchDriversSalaryData error:', err)
    }
  }, [userId, driversComparisonPeriod])

  useEffect(() => {
    if (fleetTab === 'drivers' && fleetData && profile?.role === 'company') {
      loadSalaryData()
    }
  }, [fleetTab, fleetData, profile?.role, loadSalaryData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist salary settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tb_salary_mode', salaryMode)
      localStorage.setItem('tb_salary_rate', String(salaryRate))
    } catch {}
  }, [salaryMode, salaryRate])

  // Load active shift
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getActiveShift(userId).then(shift => {
      if (!cancelled) setActiveShift(shift)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  // Load shift analytics (with team driving support)
  const loadShiftAnalytics = useCallback(async () => {
    if (!userId) return
    try {
      const vehicleId = activeVehicleId && activeVehicleId !== 'main' ? activeVehicleId : null
      const [stats, userHistory, today, vehicleHistory] = await Promise.all([
        getShiftStats(userId, shiftPeriod),
        getCompletedShifts(userId, 10),
        getTodayShiftSummary(userId),
        vehicleId ? getVehicleShifts(vehicleId, 20) : Promise.resolve([]),
      ])
      setShiftStats(stats)
      // Merge user shifts with vehicle shifts (team driving), deduplicate by id
      const merged = vehicleId && vehicleHistory.length > 0
        ? [...vehicleHistory]
        : userHistory
      const seen = new Set()
      const deduped = merged.filter(s => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      }).sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      setShiftHistory(deduped)
      setTodaySummary(today)
    } catch (err) {
      console.error('loadShiftAnalytics error:', err)
    }
  }, [userId, shiftPeriod, activeVehicleId])

  useEffect(() => {
    loadShiftAnalytics()
  }, [loadShiftAnalytics])

  // Shift elapsed timer
  useEffect(() => {
    if (activeShift) {
      const update = () => {
        const started = new Date(activeShift.started_at).getTime()
        setShiftElapsed(Math.floor((Date.now() - started) / 1000))
      }
      update()
      shiftTimerRef.current = setInterval(update, 1000)
    } else {
      setShiftElapsed(0)
      clearInterval(shiftTimerRef.current)
    }
    return () => clearInterval(shiftTimerRef.current)
  }, [activeShift])

  const handleStartShift = async () => {
    if (!shiftOdometer) return
    try {
      const vehicleId = activeVehicleId && activeVehicleId !== 'main' ? activeVehicleId : null
      const shift = await startShift(userId, vehicleId, shiftOdometer, profileName || '')
      setActiveShift(shift)
      closeShiftModal()
    } catch (err) {
      console.error('startShift error:', err)
    }
  }

  const closeShiftModal = () => {
    setShiftModal(null)
    setShiftOdometer('')
    if (shiftPhotoPreview) URL.revokeObjectURL(shiftPhotoPreview)
    setShiftPhoto(null)
    setShiftPhotoPreview(null)
    setAiOdometerStatus(null)
    setAiOdometerValue(null)
  }

  const handleShiftPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (shiftPhotoPreview) URL.revokeObjectURL(shiftPhotoPreview)
    setShiftPhoto(file)
    setShiftPhotoPreview(URL.createObjectURL(file))
    setAiOdometerStatus('loading')
    setAiOdometerValue(null)
    try {
      const result = await readOdometerFromPhoto(file)
      if (result !== null) {
        setAiOdometerValue(result)
        setShiftOdometer(String(result))
        setAiOdometerStatus('success')
      } else {
        setAiOdometerStatus('error')
      }
    } catch {
      setAiOdometerStatus('error')
    }
  }

  const handleEndShift = async () => {
    if (!shiftOdometer || !activeShift) return
    try {
      await endShift(activeShift.id, shiftOdometer)
      setActiveShift(null)
      closeShiftModal()
      loadShiftAnalytics()
    } catch (err) {
      console.error('endShift error:', err)
    }
  }

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => {
          const next = prev + 1
          // HOS warnings
          if (hosMode === 'cis') {
            if (next === 30600) { // 8h30m
              setHosWarning('\u26A0\uFE0F \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 30 \u043C\u0438\u043D\u0443\u0442 \u0434\u043E \u043B\u0438\u043C\u0438\u0442\u0430! \u041F\u043B\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443.')
              scheduleHOSWarning(30, t)
            }
          } else {
            if (next === 27000) { // 7h30m
              setHosWarning('\u26A0\uFE0F \u0427\u0435\u0440\u0435\u0437 30 \u043C\u0438\u043D \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0440\u044B\u0432 30 \u043C\u0438\u043D\u0443\u0442 (DOT)')
              scheduleHOSWarning(30, t)
            }
            if (next === 37800) { // 10h30m
              setHosWarning('\u26A0\uFE0F \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 30 \u043C\u0438\u043D\u0443\u0442 \u0434\u043E \u0441\u0443\u0442\u043E\u0447\u043D\u043E\u0433\u043E \u043B\u0438\u043C\u0438\u0442\u0430!')
              scheduleHOSWarning(30, t)
            }
          }
          if (next >= hosMaxSeconds) {
            setHosWarning('\uD83D\uDED1 \u041B\u0418\u041C\u0418\u0422 \u041F\u0420\u0415\u0412\u042B\u0428\u0415\u041D')
          }
          return next
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [timerRunning, hosMode, hosMaxSeconds])

  const handleTimerToggle = async () => {
    if (!timerRunning) {
      // Start timer + save driving session
      try {
        const session = await startDrivingSession(userId, null)
        setDrivingSessionId(session?.id || null)
      } catch (err) {
        console.error('startDrivingSession error:', err)
      }
      setHosWarning(null)
      setTimerRunning(true)
    } else {
      // Stop timer + end driving session
      setTimerRunning(false)
      if (drivingSessionId) {
        try {
          await endDrivingSession(drivingSessionId)
        } catch (err) {
          console.error('endDrivingSession error:', err)
        }
        setDrivingSessionId(null)
      }
    }
  }

  const greeting = getGreeting(profileName, t)
  const totalExpenses = monthData.fuelCost + monthData.bytCost + monthData.serviceCost + (monthData.vehicleExpCost || 0)
  const profit = monthData.income - totalExpenses
  const maxExpense = expenseBreakdown.length > 0 ? Math.max(...expenseBreakdown.map(e => e.value)) : 0

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const dimText = { color: theme.dim, fontSize: '13px' }

  // Achievements full view
  if (showAchievements) {
    return <Achievements userId={userId} onClose={() => setShowAchievements(false)} />
  }

  // Vehicle report view
  if (vehicleReportView) {
    const rv = vehicleReportView
    const rd = vehicleReportData
    const distUnit = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'
    const volUnit = unitSys === 'imperial' ? 'gal' : '\u043b'
    const reportCardStyle = { ...cardStyle, marginBottom: '10px', textAlign: 'center' }
    return (
      <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '16px', paddingBottom: '80px' }}>
        {/* Back button */}
        <button
          onClick={() => { setVehicleReportView(null); setVehicleReportData(null); setVehicleReportPeriod('month') }}
          style={{
            background: 'none', border: 'none', color: '#f59e0b', fontSize: '15px',
            cursor: 'pointer', padding: '4px 0', marginBottom: '12px', fontWeight: 600,
          }}
        >{'\u2190'} {t('overview.reportBack')}</button>

        {/* Header */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>{rv.brand} {rv.model}</div>
          {rv.plate_number && <div style={{ fontSize: '14px', color: theme.dim }}>{rv.plate_number}</div>}
          <div style={{ fontSize: '13px', color: theme.dim, marginTop: '4px' }}>
            {'\ud83d\udc64'} {t('overview.fleetDriver')}: {rv.driver_name || t('overview.fleetNoDriver')}
          </div>
        </div>

        {/* Period switcher */}
        <div style={{
          display: 'flex', gap: '6px', marginBottom: '16px',
          background: theme.card, borderRadius: '12px', padding: '4px',
          border: '1px solid ' + theme.border,
        }}>
          {['week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setVehicleReportPeriod(p)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', borderRadius: '10px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: vehicleReportPeriod === p ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                color: vehicleReportPeriod === p ? '#fff' : theme.dim,
                transition: 'all 0.2s',
              }}
            >
              {p === 'week' ? t('overview.reportPeriodWeek') : t('overview.reportPeriodMonth')}
            </button>
          ))}
        </div>

        {vehicleReportLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim }}>{'\u23f3'}</div>
        )}

        {rd && !vehicleReportLoading && (
          <>
            {/* Stat cards — 2 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: t('overview.reportFuelVolume'), value: formatNumber(Math.round(rd.fuelLiters)) + ' ' + volUnit, icon: '\u26fd', color: '#f59e0b' },
                { label: t('overview.reportFuelCost'), value: formatNumber(Math.round(rd.fuelCost)) + ' ' + cs, icon: '\ud83d\udcb0', color: '#f59e0b' },
                { label: t('overview.reportService'), value: formatNumber(Math.round(rd.serviceCost + (rd.vehicleExpCost || 0))) + ' ' + cs, icon: '\ud83d\udd27', color: '#ef4444' },
                { label: t('overview.reportTripsCount'), value: String(rd.tripCount), icon: '\ud83d\ude9a', color: '#8b5cf6' },
                { label: t('overview.reportMileage'), value: formatNumber(Math.round(rd.totalKm)) + ' ' + distUnit, icon: '\ud83d\udea3', color: '#3b82f6' },
                { label: t('overview.reportIncome'), value: formatNumber(Math.round(rd.totalIncome)) + ' ' + cs, icon: '\ud83d\udcc8', color: '#22c55e' },
                { label: t('overview.reportExpense'), value: formatNumber(Math.round(rd.totalExpenses)) + ' ' + cs, icon: '\ud83d\udcc9', color: '#ef4444' },
                { label: t('overview.reportProfit'), value: formatNumber(Math.round(rd.profit)) + ' ' + cs, icon: rd.profit >= 0 ? '\u2705' : '\u274c', color: rd.profit >= 0 ? '#22c55e' : '#ef4444' },
              ].map((item, i) => (
                <div key={i} style={reportCardStyle}>
                  <div style={{ fontSize: '18px', marginBottom: '2px' }}>{item.icon}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Trips list */}
            <div style={{ ...dimText, marginBottom: '8px' }}>{t('overview.reportTripsList')}</div>
            {rd.trips.length === 0 && (
              <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>
                {t('overview.reportNoTrips')}
              </div>
            )}
            {rd.trips.map(trip => (
              <div key={trip.id} style={{ ...cardStyle, marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {trip.from} {'\u2192'} {trip.to}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>
                    +{formatNumber(Math.round(trip.income))} {cs}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: theme.dim, marginTop: '4px' }}>
                  <span>{trip.date}</span>
                  <span>{formatNumber(Math.round(trip.km))} {distUnit}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  // Driver report view
  if (driverReportView) {
    const dd = driverReportData
    const distUnit = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'
    const volUnit = unitSys === 'imperial' ? 'gal' : '\u043b'
    return (
      <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '16px', paddingBottom: '80px' }}>
        <button
          onClick={() => { setDriverReportView(null); setDriverReportData(null); setDriverReportPeriod('month') }}
          style={{
            background: 'none', border: 'none', color: '#f59e0b', fontSize: '15px',
            cursor: 'pointer', padding: '4px 0', marginBottom: '12px', fontWeight: 600,
          }}
        >{'\u2190'} {t('overview.reportBack')}</button>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>{'\ud83d\udc64'} {t('overview.driverReport')}</div>
          <div style={{ fontSize: '16px', color: '#f59e0b', fontWeight: 600, marginTop: '4px' }}>{driverReportView}</div>
        </div>

        {/* Period switcher */}
        <div style={{
          display: 'flex', gap: '6px', marginBottom: '16px',
          background: theme.card, borderRadius: '12px', padding: '4px',
          border: '1px solid ' + theme.border,
        }}>
          {['week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setDriverReportPeriod(p)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', borderRadius: '10px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: driverReportPeriod === p ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                color: driverReportPeriod === p ? '#fff' : theme.dim,
                transition: 'all 0.2s',
              }}
            >
              {p === 'week' ? t('overview.reportPeriodWeek') : t('overview.reportPeriodMonth')}
            </button>
          ))}
        </div>

        {driverReportLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim }}>{'\u23f3'}</div>
        )}

        {dd && !driverReportLoading && (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: t('overview.driverShifts'), value: String(dd.shiftCount), icon: '\ud83d\udcc5', color: '#3b82f6' },
                { label: distUnit, value: formatNumber(Math.round(dd.totalKm)), icon: '\ud83d\udea3', color: '#f59e0b' },
                { label: t('overview.driverHours'), value: dd.totalHours.toFixed(1), icon: '\u23f1\ufe0f', color: '#8b5cf6' },
                { label: t('overview.driverTrips'), value: String(dd.tripCount), icon: '\ud83d\ude9a', color: '#22c55e' },
                { label: t('overview.driverFuelUsed'), value: formatNumber(Math.round(dd.fuelLiters)) + ' ' + volUnit, icon: '\u26fd', color: '#f59e0b' },
                { label: t('overview.reportFuelCost'), value: formatNumber(Math.round(dd.fuelCost)) + ' ' + cs, icon: '\ud83d\udcb0', color: '#ef4444' },
              ].map((item, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', marginBottom: '2px' }}>{item.icon}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Vehicles worked on */}
            <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\ude9b'} {t('overview.driverVehiclesWorked')}</div>
            {dd.vehicles.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>{'\u2014'}</div>
            ) : dd.vehicles.map(v => (
              <div key={v.id} style={{ ...cardStyle, marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{v.brand} {v.model}</div>
                {v.plate_number && <div style={{ fontSize: '12px', color: theme.dim }}>{v.plate_number}</div>}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '16px', paddingBottom: '80px' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '20px', fontWeight: 600 }}>
          {greeting.icon} {greeting.text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onExtraNav && userRole !== 'job_seeker' && (
            <>
              <button
                onClick={() => onExtraNav('jobs')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '18px', padding: '4px', lineHeight: 1,
                }}
                title={'\u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438'}
              >{'\ud83d\udcbc'}</button>
              <button
                onClick={() => onExtraNav('news')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '18px', padding: '4px', lineHeight: 1,
                }}
                title={'\u041d\u043e\u0432\u043e\u0441\u0442\u0438'}
              >{'\ud83d\udcf0'}</button>
              <button
                onClick={() => onExtraNav('marketplace')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '18px', padding: '4px', lineHeight: 1,
                }}
                title={'\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441'}
              >{'\ud83d\udce2'}</button>
            </>
          )}
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '22px', padding: '4px', lineHeight: 1,
              }}
            >{'\u2699\ufe0f'}</button>
          )}
        </div>
      </div>

      {/* Trial banner */}
      {profile?.plan === 'trial' && profile?.trial_ends_at && (() => {
        const daysLeft = Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        const isUrgent = daysLeft <= 2
        if (isUrgent && daysLeft > 0) {
          scheduleTrialExpiry(daysLeft, t)
        }
        return (
          <div
            onClick={() => alert(t('overview.paymentSoon'))}
            style={{
              background: isUrgent ? '#ef4444' : '#f59e0b',
              color: isUrgent ? '#fff' : '#000',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 12,
              textAlign: 'center',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {isUrgent
              ? `\u26a0\ufe0f ${t('overview.proAccessLeft')}${daysLeft} ${daysLeft === 1 ? t('overview.day1') : t('overview.days234')}!`
              : `\u2b50 ${t('overview.proAccessLeft')}${daysLeft} ${daysLeft === 1 ? t('overview.day1') : daysLeft < 5 ? t('overview.days234') : t('overview.days5')}`}
          </div>
        )
      })()}

      {/* Fleet panel — only for company role with 2+ vehicles */}
      {fleetData && profile?.role === 'company' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={dimText}>{'\ud83c\udfe2'} {t('overview.fleetPanel')}</div>
            <div ref={fleetExportRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFleetExportMenu(v => !v)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.card,
                  color: theme.text,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {'\ud83d\udce5'} {t('fuel.export')}
              </button>
              {showFleetExportMenu && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '6px',
                  background: theme.card,
                  border: '1px solid ' + theme.border,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  zIndex: 50,
                  minWidth: '160px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}>
                  <button
                    onClick={() => handleFleetExport('excel')}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: 'transparent',
                      color: theme.text,
                      fontSize: '14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {'\ud83d\udcc4'} {t('fuel.exportExcel')}
                  </button>
                  <button
                    onClick={() => handleFleetExport('pdf')}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      borderTop: '1px solid ' + theme.border,
                      background: 'transparent',
                      color: theme.text,
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
          {/* Summary cards — horizontal scroll */}
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '12px',
            WebkitOverflowScrolling: 'touch',
          }}>
            {[
              { label: t('overview.fleetVehicles'), value: String(fleetData.totalVehicles + (profile?.brand ? 1 : 0)), icon: '\ud83d\ude9b', color: '#3b82f6' },
              { label: t('overview.fleetIncome'), value: formatNumber(Math.round(fleetData.totalIncome)) + ' ' + cs, icon: '\ud83d\udcb0', color: '#22c55e' },
              { label: t('overview.fleetExpense'), value: formatNumber(Math.round(fleetData.totalExpenses)) + ' ' + cs, icon: '\ud83d\udcc9', color: '#ef4444' },
              { label: t('overview.fleetMileage'), value: formatNumber(Math.round(fleetData.totalKm)) + ' ' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c'), icon: '\ud83d\udea3', color: '#f59e0b' },
              { label: t('overview.fleetTrips'), value: String(fleetData.tripCount), icon: '\ud83d\ude9a', color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} style={{
                ...cardStyle,
                minWidth: '130px',
                flex: '0 0 auto',
                textAlign: 'center',
                padding: '12px 10px',
              }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{item.icon}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
              </div>
            ))}
          </div>
          {/* Vehicles / Drivers tab switcher */}
          <div style={{
            display: 'flex', gap: '6px', marginBottom: '12px',
            background: theme.card, borderRadius: '12px', padding: '4px',
            border: '1px solid ' + theme.border,
          }}>
            {['vehicles', 'drivers', 'analytics', 'dispatch'].map(tab => (
              <button
                key={tab}
                onClick={() => setFleetTab(tab)}
                style={{
                  flex: 1, padding: '8px 4px', border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  background: fleetTab === tab ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                  color: fleetTab === tab ? '#fff' : theme.dim,
                  transition: 'all 0.2s',
                }}
              >
                {tab === 'vehicles' ? t('overview.vehiclesTab') : tab === 'drivers' ? t('overview.driversTab') : tab === 'analytics' ? t('overview.analyticsTab') : t('overview.dispatchTab')}
              </button>
            ))}
          </div>

          {/* Vehicle list */}
          {fleetTab === 'vehicles' && (
            <>
              <div style={{ ...dimText, marginBottom: '8px' }}>{t('overview.fleetVehicleList')}</div>
              {fleetData.vehicleStats.map((v) => (
                <div
                  key={v.id}
                  onClick={() => {
                    if (typeof activeVehicleId !== 'undefined') {
                      const event = new CustomEvent('switchVehicle', { detail: v.id })
                      window.dispatchEvent(event)
                    }
                  }}
                  style={{
                    ...cardStyle,
                    marginBottom: '8px',
                    cursor: 'pointer',
                    borderLeft: activeVehicleId === v.id ? '3px solid #f59e0b' : '3px solid transparent',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '15px', fontWeight: 700 }}>{v.brand} {v.model}</span>
                      {v.plate_number && <span style={{ fontSize: '13px', color: theme.dim, marginLeft: '8px' }}>{v.plate_number}</span>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openVehicleReport(v) }}
                      style={{
                        background: 'none',
                        border: '1px solid ' + theme.border,
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '16px',
                        cursor: 'pointer',
                        color: theme.text,
                      }}
                      title={t('overview.vehicleReport')}
                    >{'\ud83d\udcca'}</button>
                  </div>
                  <div style={{ fontSize: '12px', color: theme.dim, marginBottom: '6px' }}>
                    {'\ud83d\udc64'} {t('overview.fleetDriver')}: {v.driver_name || t('overview.fleetNoDriver')}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                    <span>{'\u26fd'} {t('overview.fleetFuel')}: {formatNumber(Math.round(v.monthFuelCost))} {cs}</span>
                    <span>{'\ud83d\udea3'} {formatNumber(Math.round(v.monthKm))} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}</span>
                    <span>{'\ud83d\ude9a'} {v.monthTrips} {t('overview.fleetTrips').toLowerCase()}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Drivers list */}
          {fleetTab === 'drivers' && (
            <>
              <div style={{ ...dimText, marginBottom: '8px' }}>{t('overview.fleetDriversList')}</div>
              {driversComparison.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>
                  {t('overview.noDrivers')}
                </div>
              ) : (
                <>
                  {driversComparison.map((d) => (
                    <div
                      key={d.name}
                      onClick={() => openDriverReport(d.name)}
                      style={{
                        ...cardStyle,
                        marginBottom: '8px',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                        {'\ud83d\udc64'} {d.name}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                        <span>{'\ud83d\udcc5'} {d.shifts} {t('overview.driverShifts').toLowerCase()}</span>
                        <span>{'\ud83d\udea3'} {formatNumber(Math.round(d.km))} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}</span>
                        <span>{'\u23f1\ufe0f'} {d.hours.toFixed(1)} {t('overview.driverHours').toLowerCase()}</span>
                      </div>
                    </div>
                  ))}

                  {/* Comparison table — only if 2+ drivers */}
                  {driversComparison.length >= 2 && (() => {
                    const maxKm = Math.max(...driversComparison.map(d => d.km))
                    const minKm = Math.min(...driversComparison.map(d => d.km))
                    const maxShifts = Math.max(...driversComparison.map(d => d.shifts))
                    const minShifts = Math.min(...driversComparison.map(d => d.shifts))
                    const maxHours = Math.max(...driversComparison.map(d => d.hours))
                    const minHours = Math.min(...driversComparison.map(d => d.hours))
                    const maxTrips = Math.max(...driversComparison.map(d => d.trips))
                    const minTrips = Math.min(...driversComparison.map(d => d.trips))
                    const cellColor = (val, max, min) => {
                      if (max === min) return theme.text
                      if (val === max) return '#22c55e'
                      if (val === min) return '#ef4444'
                      return theme.text
                    }
                    return (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\udcca'} {t('overview.driverComparison')}</div>

                        {/* Period switcher */}
                        <div style={{
                          display: 'flex', gap: '6px', marginBottom: '10px',
                          background: theme.card, borderRadius: '12px', padding: '4px',
                          border: '1px solid ' + theme.border,
                        }}>
                          {['week', 'month'].map(p => (
                            <button
                              key={p}
                              onClick={() => setDriversComparisonPeriod(p)}
                              style={{
                                flex: 1, padding: '6px 4px', border: 'none', borderRadius: '10px',
                                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                background: driversComparisonPeriod === p ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                                color: driversComparisonPeriod === p ? '#fff' : theme.dim,
                                transition: 'all 0.2s',
                              }}
                            >
                              {p === 'week' ? t('overview.reportPeriodWeek') : t('overview.reportPeriodMonth')}
                            </button>
                          ))}
                        </div>

                        <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid ' + theme.border }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', color: theme.dim, fontWeight: 600 }}>{t('overview.driverNameCol')}</th>
                                <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{t('overview.driverShifts')}</th>
                                <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{unitSys === 'imperial' ? 'Mi' : t('overview.kmLabel')}</th>
                                <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{t('overview.driverHours')}</th>
                                <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{t('overview.driverTrips')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {driversComparison.map((d, i) => (
                                <tr key={d.name} style={{ borderBottom: i < driversComparison.length - 1 ? '1px solid ' + theme.border : 'none' }}>
                                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{d.name}</td>
                                  <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: cellColor(d.shifts, maxShifts, minShifts) }}>{d.shifts}</td>
                                  <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: cellColor(d.km, maxKm, minKm) }}>{formatNumber(Math.round(d.km))}</td>
                                  <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: cellColor(d.hours, maxHours, minHours) }}>{d.hours.toFixed(1)}</td>
                                  <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: cellColor(d.trips, maxTrips, minTrips) }}>{d.trips}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Salary block */}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\udcb0'} {t('overview.salaryBlock')}</div>
                    {/* Salary mode switcher */}
                    <div style={{
                      display: 'flex', gap: '6px', marginBottom: '10px',
                      background: theme.card, borderRadius: '12px', padding: '4px',
                      border: '1px solid ' + theme.border,
                    }}>
                      {['per_km', 'percent', 'fixed'].map(m => (
                        <button
                          key={m}
                          onClick={() => setSalaryMode(m)}
                          style={{
                            flex: 1, padding: '6px 4px', border: 'none', borderRadius: '10px',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            background: salaryMode === m ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                            color: salaryMode === m ? '#fff' : theme.dim,
                            transition: 'all 0.2s',
                          }}
                        >
                          {m === 'per_km' ? (unitSys === 'imperial' ? t('overview.salaryPerMile') : t('overview.salaryPerKm')) : m === 'percent' ? t('overview.salaryPercent') : t('overview.salaryFixed')}
                        </button>
                      ))}
                    </div>
                    {/* Rate input */}
                    <div style={{ ...cardStyle, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', color: theme.dim }}>{t('overview.salaryRate')}:</span>
                      <input
                        type="number"
                        value={salaryRate}
                        onChange={e => setSalaryRate(parseFloat(e.target.value) || 0)}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: '8px',
                          border: '1px solid ' + theme.border, background: theme.card2,
                          color: theme.text, fontSize: '14px', fontFamily: 'monospace',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: theme.dim }}>
                        {salaryMode === 'per_km' ? (cs + '/' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c')) : salaryMode === 'percent' ? '%' : cs + '/' + t('overview.reportPeriodMonth').toLowerCase()}
                      </span>
                    </div>
                    {/* Salary table */}
                    {salaryData.length > 0 ? (() => {
                      const calcSalary = (d) => {
                        if (salaryMode === 'per_km') return d.km * salaryRate
                        if (salaryMode === 'percent') return d.income * (salaryRate / 100)
                        return salaryRate
                      }
                      const totalPayroll = salaryData.reduce((s, d) => s + calcSalary(d), 0)
                      return (
                        <>
                          <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid ' + theme.border }}>
                                  <th style={{ padding: '10px 8px', textAlign: 'left', color: theme.dim, fontWeight: 600 }}>{t('overview.salaryDriverName')}</th>
                                  <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{t('overview.salaryTrips')}</th>
                                  <th style={{ padding: '10px 4px', textAlign: 'center', color: theme.dim, fontWeight: 600 }}>{unitSys === 'imperial' ? 'Mi' : t('overview.kmLabel')}</th>
                                  <th style={{ padding: '10px 4px', textAlign: 'right', color: theme.dim, fontWeight: 600 }}>{t('overview.salarySalary')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {salaryData.map((d, i) => (
                                  <tr key={d.name} style={{ borderBottom: i < salaryData.length - 1 ? '1px solid ' + theme.border : 'none' }}>
                                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{d.name}</td>
                                    <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace' }}>{d.trips}</td>
                                    <td style={{ padding: '10px 4px', textAlign: 'center', fontFamily: 'monospace' }}>{formatNumber(Math.round(d.km))}</td>
                                    <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>{formatNumber(Math.round(calcSalary(d)))} {cs}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ ...cardStyle, marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700 }}>{t('overview.salaryTotal')}</span>
                            <span style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>{formatNumber(Math.round(totalPayroll))} {cs}</span>
                          </div>
                          {/* Export salary report */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            {['excel', 'pdf'].map(fmt => (
                              <button
                                key={fmt}
                                onClick={() => {
                                  const distLabel = unitSys === 'imperial' ? 'mi' : '\u043a\u043c'
                                  const modeLabel = salaryMode === 'per_km' ? (unitSys === 'imperial' ? t('overview.salaryPerMile') : t('overview.salaryPerKm')) : salaryMode === 'percent' ? t('overview.salaryPercent') : t('overview.salaryFixed')
                                  const columns = [
                                    { header: t('overview.salaryDriverName'), key: 'name' },
                                    { header: t('overview.salaryTrips'), key: 'trips' },
                                    { header: distLabel, key: 'km' },
                                    { header: t('overview.salaryCalcMode'), key: 'mode' },
                                    { header: t('overview.salaryRate'), key: 'rate' },
                                    { header: t('overview.salarySalary') + ' (' + cs + ')', key: 'salary' },
                                  ]
                                  const rows = salaryData.map(d => ({
                                    name: d.name,
                                    trips: d.trips,
                                    km: Math.round(d.km),
                                    mode: modeLabel,
                                    rate: salaryMode === 'percent' ? salaryRate + '%' : salaryRate + ' ' + cs,
                                    salary: Math.round(calcSalary(d)),
                                  }))
                                  rows.push({
                                    name: t('overview.salaryTotal'),
                                    trips: '',
                                    km: '',
                                    mode: '',
                                    rate: '',
                                    salary: Math.round(totalPayroll),
                                  })
                                  const now2 = new Date()
                                  const ym = `${now2.getFullYear()}_${String(now2.getMonth() + 1).padStart(2, '0')}`
                                  if (fmt === 'excel') {
                                    exportToExcel(rows, columns, `salary_report_${ym}.xlsx`)
                                  } else {
                                    exportToPDF(rows, columns, t('overview.exportSalary'), `salary_report_${ym}.pdf`)
                                  }
                                }}
                                style={{
                                  flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid ' + theme.border,
                                  background: theme.card2, color: theme.text, fontSize: '12px', fontWeight: 600,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                }}
                              >
                                {'\uD83D\uDCE5 ' + t('overview.exportSalary') + ' ' + fmt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    })() : (
                      <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>
                        {t('overview.noData')}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Analytics tab */}
          {fleetTab === 'analytics' && (
            <>
              {/* Period switcher: Day / Week / Month */}
              <div style={{
                display: 'flex', gap: '6px', marginBottom: '12px',
                background: theme.card, borderRadius: '12px', padding: '4px',
                border: '1px solid ' + theme.border,
              }}>
                {['day', 'week', 'month'].map(p => (
                  <button
                    key={p}
                    onClick={() => setAnalyticsPeriod(p)}
                    style={{
                      flex: 1, padding: '6px 4px', border: 'none', borderRadius: '10px',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      background: analyticsPeriod === p ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                      color: analyticsPeriod === p ? '#fff' : theme.dim,
                      transition: 'all 0.2s',
                    }}
                  >
                    {p === 'day' ? t('overview.reportPeriodDay') : p === 'week' ? t('overview.reportPeriodWeek') : t('overview.reportPeriodMonth')}
                  </button>
                ))}
              </div>

              {analyticsLoading ? (
                <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>
                  {t('common.loading')}
                </div>
              ) : analyticsData ? (
                <>
                  {/* Summary cards grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    {[
                      { label: t('overview.analyticsTotalIncome'), value: formatNumber(Math.round(analyticsData.totalIncome)) + ' ' + cs, color: '#22c55e', icon: '\ud83d\udcb0' },
                      { label: t('overview.analyticsTotalExpense'), value: formatNumber(Math.round(analyticsData.totalExpenses)) + ' ' + cs, color: '#ef4444', icon: '\ud83d\udcc9' },
                      { label: t('overview.analyticsProfit'), value: formatNumber(Math.round(analyticsData.profit)) + ' ' + cs, color: analyticsData.profit >= 0 ? '#22c55e' : '#ef4444', icon: '\ud83d\udcca' },
                      { label: t('overview.analyticsFuel'), value: formatNumber(Math.round(analyticsData.totalFuelLiters)) + ' ' + (unitSys === 'imperial' ? 'gal' : '\u043b') + ' / ' + formatNumber(Math.round(analyticsData.totalFuelCost)) + ' ' + cs, color: '#f59e0b', icon: '\u26fd' },
                      { label: t('overview.analyticsMileage'), value: formatNumber(Math.round(analyticsData.totalKm)) + ' ' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c'), color: '#3b82f6', icon: '\ud83d\udea3' },
                      { label: t('overview.analyticsTripsCount'), value: String(analyticsData.tripCount), color: '#8b5cf6', icon: '\ud83d\ude9a' },
                    ].map((item, i) => (
                      <div key={i} style={{
                        ...cardStyle,
                        textAlign: 'center',
                        padding: '12px 8px',
                      }}>
                        <div style={{ fontSize: '18px', marginBottom: '2px' }}>{item.icon}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: item.color }}>{item.value}</div>
                        <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bar chart: Income vs Expense */}
                  {analyticsData.daily.length > 0 && (() => {
                    const maxVal = Math.max(...analyticsData.daily.map(d => Math.max(d.income, d.expense)), 1)
                    return (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\udcca'} {t('overview.chartIncomeVsExpense')}</div>
                        <div style={{ ...cardStyle }}>
                          {/* Legend */}
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', fontSize: '11px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#22c55e', display: 'inline-block' }} />
                              {t('overview.chartIncome')}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ef4444', display: 'inline-block' }} />
                              {t('overview.chartExpense')}
                            </span>
                          </div>
                          {/* Bars */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '140px', overflowX: 'auto' }}>
                            {analyticsData.daily.map((d, i) => {
                              const incH = Math.max((d.income / maxVal) * 120, 2)
                              const expH = Math.max((d.expense / maxVal) * 120, 2)
                              const dayLabel = d.date.slice(5) // MM-DD
                              return (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 auto', minWidth: '28px' }}>
                                  <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                                    <div style={{ width: '10px', height: incH + 'px', background: '#22c55e', borderRadius: '2px 2px 0 0' }} title={formatNumber(Math.round(d.income))} />
                                    <div style={{ width: '10px', height: expH + 'px', background: '#ef4444', borderRadius: '2px 2px 0 0' }} title={formatNumber(Math.round(d.expense))} />
                                  </div>
                                  <div style={{ fontSize: '9px', color: theme.dim, marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{dayLabel}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </>
              ) : (
                <div style={{ ...cardStyle, textAlign: 'center', color: theme.dim, padding: '20px' }}>
                  {t('overview.noData')}
                </div>
              )}
            </>
          )}

          {/* Dispatch tab */}
          {fleetTab === 'dispatch' && (
            <DispatchBoard userId={userId} />
          )}
        </div>
      )}

      {/* Theme switcher */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '16px',
        background: theme.card,
        borderRadius: '12px',
        padding: '4px',
        border: '1px solid ' + theme.border,
      }}>
        {THEME_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setMode(opt.key)}
            style={{
              flex: 1,
              padding: '8px 4px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === opt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
              color: mode === opt.key ? '#fff' : theme.dim,
              transition: 'all 0.2s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Driving timer */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: theme.dim }}>{'\u23f1\ufe0f'} {t('overview.drivingTime')}</span>
          <span style={{ fontSize: '12px', color: theme.dim }}>
            {hosMode === 'usa' ? t('overview.maxUsa') : t('overview.maxCis')}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: '32px',
            fontFamily: 'monospace',
            fontWeight: 700,
            color: seconds >= hosMaxSeconds ? '#ef4444' : theme.text,
          }}>
            {formatTimer(seconds)}
          </span>
          <button
            onClick={handleTimerToggle}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: 'none',
              background: timerRunning
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {timerRunning ? '\u23f8' : '\u25b6'}
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: '8px', background: theme.border, borderRadius: '4px', height: '6px', overflow: 'hidden', position: 'relative' }}>
          <div style={{
            width: `${Math.min((seconds / hosMaxSeconds) * 100, 100)}%`,
            height: '100%',
            background: seconds >= hosMaxSeconds ? '#ef4444' : (hosMode === 'usa' && seconds >= hosBreak8hSeconds) ? '#f59e0b' : '#f59e0b',
            transition: 'width 1s linear',
          }} />
          {hosMode === 'usa' && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: `${(hosBreak8hSeconds / hosMaxSeconds) * 100}%`,
              width: '2px',
              height: '100%',
              background: '#ef4444',
              opacity: 0.7,
            }} />
          )}
        </div>
        {hosMode === 'usa' && seconds >= hosBreak8hSeconds && seconds < hosMaxSeconds && (
          <div style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 600,
          }}>
            {'\u26A0\uFE0F ' + t('overview.break30min')}
          </div>
        )}
        {seconds >= hosMaxSeconds && (
          <div style={{
            marginTop: '6px',
            fontSize: '13px',
            color: '#ef4444',
            fontWeight: 700,
            textAlign: 'center',
          }}>
            {'\uD83D\uDED1 ' + t('overview.limitExceeded')}
          </div>
        )}
        {hosWarning && seconds < hosMaxSeconds && (
          <div style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 600,
          }}>
            {hosWarning}
          </div>
        )}
      </div>

      {/* Shift block */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83d\udee3\ufe0f'} {t('overview.shift')}</div>
        {activeShift ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px' }}>
                {'\u2705'} {t('overview.startedAt')}{new Date(activeShift.started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>
                {formatTimer(shiftElapsed)}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: theme.dim, marginBottom: '12px' }}>
              {t('overview.odometerStart')}{formatNumber(activeShift.odometer_start || 0)}{' '}{unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}
            </div>
            <button
              onClick={() => { setShiftModal('end'); setShiftOdometer('') }}
              style={{
                width: '100%',
                padding: '14px',
                border: 'none',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {'\u23f9'} {t('overview.endShift')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShiftModal('start'); setShiftOdometer('') }}
            style={{
              width: '100%',
              padding: '14px',
              border: 'none',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {'\u25b6'} {t('overview.startShift')}
          </button>
        )}
      </div>

      {/* Today shift summary banner */}
      {todaySummary && (
        <div style={{
          background: theme.card2,
          border: '1px solid ' + theme.border,
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: theme.dim,
        }}>
          <span>{'\ud83d\ude9b'}</span>
          <span>
            {t('overview.today') + ' '}{todaySummary.count}{' '}{todaySummary.count === 1 ? '\u0441\u043c\u0435\u043d\u0430' : todaySummary.count < 5 ? '\u0441\u043c\u0435\u043d\u044b' : '\u0441\u043c\u0435\u043d'}
            {' \u00b7 '}{formatNumber(Math.round(todaySummary.totalKm))}{' '}{unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}
            {' \u00b7 '}{Math.floor(todaySummary.totalMinutes / 60)}{'\u0447 '}{String(todaySummary.totalMinutes % 60).padStart(2, '0')}{'\u043c\u0438\u043d'}
          </span>
        </div>
      )}

      {/* Shift modal */}
      {shiftModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }} onClick={() => closeShiftModal()}>
          <div style={{
            background: theme.card,
            border: '1px solid ' + theme.border,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '360px',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: theme.text }}>
              {shiftModal === 'start' ? t('overview.startShiftTitle') : t('overview.endShiftTitle')}
            </div>
            <label style={{ fontSize: '14px', color: theme.dim, display: 'block', marginBottom: '6px' }}>
              {t('overview.mileageKm')}
            </label>
            <input
              type="number"
              value={shiftOdometer}
              onChange={e => setShiftOdometer(e.target.value)}
              placeholder={t('overview.currentOdometer')}
              autoFocus
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid ' + theme.border,
                background: theme.bg,
                color: theme.text,
                fontSize: '18px',
                fontFamily: 'monospace',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px dashed ' + theme.border,
              background: theme.bg,
              color: theme.dim,
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '12px',
              justifyContent: 'center',
            }}>
              <span>{'\ud83d\udcf7'}</span>
              <span>{shiftPhoto ? shiftPhoto.name : t('overview.odometerPhoto')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleShiftPhotoChange}
                style={{ display: 'none' }}
              />
            </label>
            {shiftPhotoPreview && (
              <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                <img
                  src={shiftPhotoPreview}
                  alt="Odometer preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '200px',
                    borderRadius: '10px',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
            {aiOdometerStatus === 'loading' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '10px', marginBottom: '12px', borderRadius: '10px',
                background: theme.bg, color: theme.dim, fontSize: '14px',
              }}>
                <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid ' + theme.dim, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span>{t('ai.recognizing')}</span>
              </div>
            )}
            {aiOdometerStatus === 'success' && aiOdometerValue !== null && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '10px',
                background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                fontSize: '14px', fontWeight: 600, textAlign: 'center',
              }}>
                AI: {aiOdometerValue.toLocaleString('ru-RU')} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'} {'\u2705'}
              </div>
            )}
            {aiOdometerStatus === 'error' && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '10px',
                background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                fontSize: '14px', textAlign: 'center',
              }}>
                {t('ai.recognizeFailed')}
              </div>
            )}
            {shiftModal === 'end' && shiftOdometer && activeShift && (
              <div style={{
                background: theme.bg,
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: '13px', color: theme.dim }}>{t('overview.forShift')}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>
                  {Math.max(0, parseInt(shiftOdometer, 10) - (activeShift.odometer_start || 0))}{' '}{unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => closeShiftModal()}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: 'transparent',
                  color: theme.dim,
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={shiftModal === 'start' ? handleStartShift : handleEndShift}
                disabled={!shiftOdometer}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: shiftOdometer
                    ? (shiftModal === 'start'
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)')
                    : theme.border,
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: shiftOdometer ? 'pointer' : 'default',
                }}
              >
                {shiftModal === 'start' ? t('overview.start') : t('overview.finish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift analytics */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83d\udcca'} {t('overview.shiftAnalytics')}</div>

        {/* Period toggle */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[
            { key: 'week', label: t('overview.week') },
            { key: 'month', label: t('overview.month') },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setShiftPeriod(p.key)}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                background: shiftPeriod === p.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.bg,
                color: shiftPeriod === p.key ? '#fff' : theme.dim,
                transition: 'all 0.2s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: t('overview.shiftsLabel'), value: String(shiftStats.count) },
            { label: t('overview.kmLabel'), value: formatNumber(Math.round(shiftStats.totalKm)) },
            { label: t('overview.hoursLabel'), value: shiftStats.totalHours.toFixed(1) },
          ].map((s, i) => (
            <div key={i} style={{
              background: theme.bg,
              borderRadius: '10px',
              padding: '10px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* History (team driving: color-coded by driver) */}
        <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\udcc3'} {t('overview.shiftHistory')}</div>
        {shiftHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: theme.dim, fontSize: '13px' }}>
            {t('overview.noCompletedShifts')}
          </div>
        ) : (() => {
            const DRIVER_COLORS = ['#f59e0b', '#3b82f6']
            const driverNames = [...new Set(shiftHistory.map(s => s.driver_name || '').filter(Boolean))]
            const isTeamDriving = driverNames.length > 1
            const driverColorMap = {}
            driverNames.forEach((name, idx) => { driverColorMap[name] = DRIVER_COLORS[idx] || DRIVER_COLORS[0] })

            return shiftHistory.map((sh, i) => {
              const start = new Date(sh.started_at)
              const end = sh.ended_at ? new Date(sh.ended_at) : null
              const durationMin = end ? Math.round((end - start) / 60000) : 0
              const durationH = Math.floor(durationMin / 60)
              const durationM = durationMin % 60
              const durationStr = durationH > 0
                ? `${durationH}\u0447 ${durationM}\u043c\u0438\u043d`
                : `${durationM}\u043c\u0438\u043d`
              const dateStr = start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
              const timeStart = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              const timeEnd = end ? end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u2014'
              const kmDriven = sh.km_driven || 0
              const driverName = sh.driver_name || ''
              const driverColor = driverColorMap[driverName] || theme.dim

              return (
                <div key={sh.id || i} style={{
                  background: theme.bg,
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: i < shiftHistory.length - 1 ? '8px' : 0,
                  borderLeft: isTeamDriving ? `3px solid ${driverColor}` : 'none',
                }}>
                  {driverName ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: isTeamDriving ? driverColor : theme.text }}>
                        {driverName} {'\u2014'} {formatNumber(kmDriven)} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}, {durationStr}
                      </span>
                      <span style={{ fontSize: '12px', color: theme.dim }}>{dateStr}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px' }}>{'\ud83d\udcc5'} {dateStr}</span>
                      <span style={{ fontSize: '13px', color: theme.dim }}>
                        {timeStart} {'\u2014'} {timeEnd} ({durationStr})
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: theme.dim }}>
                      {timeStart} {'\u2014'} {timeEnd}
                      {!driverName && ` (${durationStr})`}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>
                      +{formatNumber(kmDriven)} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}
                    </span>
                  </div>
                </div>
              )
            })
          })()
        }
      </div>

      {/* Driver stats summary — only when 2+ drivers on same vehicle */}
      {(() => {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthShifts = shiftHistory.filter(s => s.ended_at && new Date(s.started_at) >= monthStart)
        const driverNamesAll = [...new Set(monthShifts.map(s => s.driver_name || '').filter(Boolean))]
        if (driverNamesAll.length < 2) return null
        const DRIVER_COLORS = ['#f59e0b', '#3b82f6']
        const driverColorMap = {}
        driverNamesAll.forEach((name, idx) => { driverColorMap[name] = DRIVER_COLORS[idx] || DRIVER_COLORS[0] })
        const driverStats = driverNamesAll.map(name => {
          const shifts = monthShifts.filter(s => s.driver_name === name)
          const totalKm = shifts.reduce((sum, s) => sum + (s.km_driven || 0), 0)
          const totalMinutes = shifts.reduce((sum, s) => {
            const start = new Date(s.started_at).getTime()
            const end = new Date(s.ended_at).getTime()
            return sum + (end - start) / 60000
          }, 0)
          return { name, count: shifts.length, totalKm, totalMinutes }
        })
        return (
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83d\udc65'} {t('overview.driverStats')}</div>
            {driverStats.map((d, i) => {
              const hours = Math.floor(d.totalMinutes / 60)
              const mins = Math.round(d.totalMinutes % 60)
              const timeStr = hours > 0 ? `${hours}\u0447 ${mins}\u043c\u0438\u043d` : `${mins}\u043c\u0438\u043d`
              const color = driverColorMap[d.name]
              return (
                <div key={d.name} style={{
                  background: theme.bg,
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: i < driverStats.length - 1 ? '8px' : 0,
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color, marginBottom: '8px' }}>
                    {d.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>{formatNumber(Math.round(d.totalKm))}</div>
                      <div style={{ fontSize: '11px', color: theme.dim }}>{unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>{d.count}</div>
                      <div style={{ fontSize: '11px', color: theme.dim }}>{'\u0441\u043c\u0435\u043d'}</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>{timeStr}</div>
                      <div style={{ fontSize: '11px', color: theme.dim }}>{t('overview.behindWheel')}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Monthly summary */}
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcc5'} {getMonthName(new Date())}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={dimText}>{t('overview.income')}</div>
                <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>
                  {formatNumber(Math.round(monthData.income))} {cs}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={dimText}>{t('overview.expense')}</div>
                <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                  {formatNumber(Math.round(totalExpenses))} {cs}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '8px', textAlign: 'center' }}>
              <div style={dimText}>{t('overview.netProfit')}</div>
              <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {profit >= 0 ? '+' : ''}{formatNumber(Math.round(profit))} {cs}
              </div>
            </div>
          </div>

          {/* Mini cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: t('overview.mileage'), value: formatNumber(Math.round(monthData.totalKm)), unit: unitSys === 'imperial' ? 'mi' : '\u043a\u043c', icon: '\ud83d\udea3' },
              { label: t('overview.consumption'), value: monthData.avgConsumption > 0 ? monthData.avgConsumption.toFixed(1) : '\u2014', unit: unitSys === 'imperial' ? 'MPG' : '\u043b/100\u043a\u043c', icon: '\u26fd' },
              { label: t('overview.tripsLabel'), value: String(monthData.tripCount), unit: '', icon: '\ud83d\ude9a' },
              { label: t('overview.costPerKm'), value: monthData.totalKm > 0 ? (totalExpenses / monthData.totalKm).toFixed(1) : '\u2014', unit: cs + '/' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c'), icon: '\ud83d\udcb0' },
            ].map((item, i) => (
              <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>{item.icon}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>{item.value}</div>
                <div style={{ fontSize: '11px', color: theme.dim }}>{item.unit}</div>
                <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Expenses chart */}
          {expenseBreakdown.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '12px' }}>
              <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcca'} {t('overview.expenses')}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '120px', gap: '8px' }}>
                {expenseBreakdown.map((e, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '10px', color: theme.dim, marginBottom: '4px' }}>
                      {e.value >= 1000 ? `${Math.round(e.value / 1000)}k` : e.value}
                    </div>
                    <div style={{
                      width: '100%',
                      maxWidth: '36px',
                      height: `${(e.value / maxExpense) * 90}px`,
                      background: e.color,
                      borderRadius: '4px 4px 0 0',
                      minHeight: '8px',
                    }} />
                    <div style={{ fontSize: '10px', color: theme.dim, marginTop: '4px' }}>{e.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Forecast */}
          <AIForecast userId={userId} activeVehicleId={activeVehicleId} />

          {/* Achievements preview */}
          <div
            style={{ ...cardStyle, marginBottom: '12px', cursor: 'pointer' }}
            onClick={() => setShowAchievements(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>{'\ud83c\udfc6'}</span>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  {t('achievements.title')}: {achievementUnlocked}/{ACHIEVEMENTS.length}
                </span>
              </div>
              <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>
                {t('achievements.viewAll')} {'\u2192'}
              </span>
            </div>
            {achievementStats && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                {ACHIEVEMENTS.map(a => {
                  const unlocked = (achievementStats[a.stat] || 0) >= a.target
                  return (
                    <div key={a.key} style={{
                      fontSize: '18px',
                      filter: unlocked ? 'none' : 'grayscale(1)',
                      opacity: unlocked ? 1 : 0.3,
                    }}>{a.icon}</div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reminders */}
          {reminders.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udd14'} {t('overview.reminders')}</div>
              {reminders.map((r, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: i > 0 ? '1px solid ' + theme.border : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>{r.icon}</span>
                    <span style={{ fontSize: '14px' }}>{r.text}</span>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#f59e0b' }}>{r.sub}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
