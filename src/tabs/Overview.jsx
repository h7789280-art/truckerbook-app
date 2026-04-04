import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { validateAndCompressFile, interpolate } from '../lib/fileUtils'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchInsurance, fetchVehicleExpenses, getActiveShift, startShift, endShift, getCompletedShifts, getShiftStats, getTodayShiftSummary, getVehicleShifts, startDrivingSession, endDrivingSession, fetchFleetSummary, fetchVehicleReport, fetchDriverReport, fetchAllDriversComparison, fetchFleetAnalytics, fetchDriversSalaryData, fetchAchievementStats, uploadOdometerPhoto } from '../lib/api'
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
  // Countries with mandatory ELD/tachograph — hide HOS timer
  const ELD_COUNTRIES = ['US','CA','DE','FR','PL','GB','NL','BE','AT','CZ','SK','IT','ES','SE','DK','FI','NO','HU','RO','BG','HR','LT','LV','EE','SI','IE','PT','GR','LU']
  const userCountry = (() => { try { return localStorage.getItem('truckerbook_country') || 'RU' } catch { return 'RU' } })()
  const showHOS = !ELD_COUNTRIES.includes(userCountry)
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
  const shiftBlockRef = useRef(null)
  const [shiftPhoto, setShiftPhoto] = useState(null)
  const [shiftPhotoPreview, setShiftPhotoPreview] = useState(null)
  const [aiOdometerStatus, setAiOdometerStatus] = useState(null) // 'loading' | 'success' | 'error' | null
  const [aiOdometerValue, setAiOdometerValue] = useState(null)
  const [shiftPeriod, setShiftPeriod] = useState('week')
  const [shiftCustomFrom, setShiftCustomFrom] = useState('')
  const [shiftCustomTo, setShiftCustomTo] = useState('')
  const [shiftStats, setShiftStats] = useState({ count: 0, totalKm: 0, totalHours: 0 })
  const [shiftHistory, setShiftHistory] = useState([])
  const [shiftHistoryExpanded, setShiftHistoryExpanded] = useState(false)
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
      const msStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const msEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthStart = `${msStart.getFullYear()}-${String(msStart.getMonth() + 1).padStart(2, '0')}-${String(msStart.getDate()).padStart(2, '0')}`
      const monthEnd = `${msEnd.getFullYear()}-${String(msEnd.getMonth() + 1).padStart(2, '0')}-${String(msEnd.getDate()).padStart(2, '0')}`

      const [fuels, trips, bytExps, serviceRecs, insuranceRecs, vehicleExps] = await Promise.all([
        fetchFuels(userId),
        fetchTrips(userId),
        fetchBytExpenses(userId),
        fetchServiceRecords(userId).catch(() => []),
        fetchInsurance(userId).catch(() => []),
        fetchVehicleExpenses(userId).catch(() => []),
      ])

      // Filter to current month
      const inMonth = (dateStr) => {
        if (!dateStr) return false
        const d = dateStr.slice(0, 10)
        return d >= monthStart && d < monthEnd
      }
      const monthFuels = fuels.filter(e => inMonth(e.date))
      const monthTrips = trips.filter(e => inMonth(e.created_at))
      const monthByt = bytExps.filter(e => inMonth(e.date))
      const monthService = serviceRecs.filter(e => inMonth(e.date))
      const monthVehicleExp = vehicleExps.filter(e => inMonth(e.date))

      const fuelCost = monthFuels.reduce((s, e) => s + (e.cost || 0), 0)
      const bytCost = monthByt.reduce((s, e) => s + (e.amount || 0), 0)
      const serviceCost = monthService.reduce((s, e) => s + (e.cost || 0), 0)
      const vehicleExpCost = monthVehicleExp.reduce((s, e) => s + (e.amount || 0), 0)
      const income = monthTrips.reduce((s, t) => s + (t.income || 0), 0)
      const driverPay = monthTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
      const totalKm = monthTrips.reduce((s, t) => s + (t.distance_km || 0), 0)
      const totalLiters = monthFuels.reduce((s, e) => s + (e.liters || 0), 0)
      const avgConsumption = totalKm > 0 ? (totalLiters / totalKm * 100) : 0

      setMonthData({
        income,
        driverPay,
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
      if (fuelCost > 0) breakdown.push({ label: t('overview.fuelShort'), value: fuelCost, color: '#f59e0b', isPersonal: false })
      if (serviceCost > 0) breakdown.push({ label: t('overview.repairShort'), value: serviceCost, color: '#ef4444', isPersonal: false })
      if (vehicleExpCost > 0) breakdown.push({ label: t('overview.vehicleShort'), value: vehicleExpCost, color: '#8b5cf6', isPersonal: false })
      // Group byt by category (personal expenses — hidden for company role)
      if (profile?.role !== 'company') {
        const bytByCategory = {}
        monthByt.forEach(e => {
          const cat = e.category || 'other'
          bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
        })
        if (bytByCategory.food) breakdown.push({ label: t('overview.foodShort'), value: bytByCategory.food, color: '#22c55e', isPersonal: true })
        if (bytByCategory.hotel) breakdown.push({ label: t('overview.housingShort'), value: bytByCategory.hotel, color: '#3b82f6', isPersonal: true })
        const otherByt = Object.entries(bytByCategory)
          .filter(([k]) => k !== 'food' && k !== 'hotel')
          .reduce((s, [, v]) => s + v, 0)
        if (otherByt > 0) breakdown.push({ label: t('overview.otherShort'), value: otherByt, color: '#06b6d4', isPersonal: true })
      }
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
    if (profile?.role === 'company') {
      loadSalaryData()
    }
  }, [profile?.role, loadSalaryData]) // eslint-disable-line react-hooks/exhaustive-deps

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
        getShiftStats(userId, shiftPeriod, shiftCustomFrom, shiftCustomTo),
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
  }, [userId, shiftPeriod, activeVehicleId, shiftCustomFrom, shiftCustomTo])

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
      let photoUrl = null
      if (shiftPhoto && userId) {
        try {
          photoUrl = await uploadOdometerPhoto(userId, shiftPhoto)
        } catch (photoErr) {
          console.error('Odometer photo upload failed:', photoErr)
        }
      }
      const shift = await startShift(userId, vehicleId, shiftOdometer, profileName || '', photoUrl)
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
    const v = await validateAndCompressFile(file, userId)
    if (!v.ok) { alert(interpolate(t(v.errorKey), v.errorParams)); return }
    if (shiftPhotoPreview) URL.revokeObjectURL(shiftPhotoPreview)
    setShiftPhoto(v.file)
    setShiftPhotoPreview(URL.createObjectURL(v.file))
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
      let photoUrl = null
      if (shiftPhoto && userId) {
        try {
          photoUrl = await uploadOdometerPhoto(userId, shiftPhoto)
        } catch (photoErr) {
          console.error('Odometer photo upload failed:', photoErr)
        }
      }
      await endShift(activeShift.id, shiftOdometer, photoUrl)
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
  const isCompanyRole = profile?.role === 'company'
  const role = profile?.role || 'owner_operator'
  const isHiredDriver = role === 'driver' || profile?.pay_type === 'per_mile' || profile?.pay_type === 'percent'
  const totalExpenses = monthData.fuelCost + (isCompanyRole ? 0 : monthData.bytCost) + monthData.serviceCost + (monthData.vehicleExpCost || 0)
  const profit = monthData.income - totalExpenses

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const dimText = { color: theme.dim, fontSize: '13px' }

  // Achievements full view — not for company role
  if (showAchievements && !isCompanyRole) {
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
                { label: t('overview.reportMileage'), value: formatNumber(Math.round(rd.totalKm)) + ' ' + distUnit, icon: '\ud83d\udee3\ufe0f', color: '#3b82f6' },
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
                { label: distUnit, value: formatNumber(Math.round(dd.totalKm)), icon: '\ud83d\udee3\ufe0f', color: '#f59e0b' },
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingRight: 44 }}>
        <div style={{ fontSize: '20px', fontWeight: 600 }}>
          {greeting.icon} {greeting.text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '22px', padding: '8px', lineHeight: 1,
                minWidth: 40, minHeight: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{'\ud83d\udc64'}</button>
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

      {/* Theme switcher — for company role, placed right after greeting/trial banner */}
      {isCompanyRole && (
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
      )}

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
          {/* Summary cards — compact 2x2 grid */}
          {(() => {
            const fleetVehicleCount = fleetData.totalVehicles + (profile?.brand ? 1 : 0)
            const fleetIncome = fleetData.totalIncome
            const fleetExpense = fleetData.totalExpenses
            const fleetGross = fleetIncome - fleetExpense
            const onTrip = fleetData.onTripCount || 0
            const freeVehicles = Math.max(0, fleetVehicleCount - onTrip)
            const gridItems = [
              { label: t('overview.fleetVehicles'), value: String(fleetVehicleCount), color: '#3b82f6' },
              { label: t('overview.fleetIncome'), value: formatNumber(Math.round(fleetIncome)) + ' ' + cs, color: '#22c55e' },
              { label: t('overview.fleetExpense'), value: formatNumber(Math.round(fleetExpense)) + ' ' + cs, color: '#ef4444' },
              { label: t('overview.grossProfit'), value: (fleetGross >= 0 ? '+' : '') + formatNumber(Math.round(fleetGross)) + ' ' + cs, color: fleetGross >= 0 ? '#22c55e' : '#ef4444' },
            ]
            return (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginBottom: '10px',
                }}>
                  {gridItems.map((item, i) => (
                    <div key={i} style={{
                      ...cardStyle,
                      textAlign: 'center',
                      padding: '10px 8px',
                    }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                {/* Fleet status — one row */}
                <div style={{
                  ...cardStyle,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '24px',
                  padding: '10px 16px',
                  marginBottom: '12px',
                }}>
                  <div style={{ fontSize: '12px', color: theme.dim }}>
                    {t('overview.fleetStatusTitle')}:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontSize: '13px', color: theme.text }}>{t('overview.fleetOnTrip')}: {onTrip}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }} />
                    <span style={{ fontSize: '13px', color: theme.text }}>{t('overview.fleetFree')}: {freeVehicles}</span>
                  </div>
                </div>
              </>
            )
          })()}
          {/* Vehicle cards — driver-first */}
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
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>
                    {v.driver_name || t('overview.fleetNoDriver')}
                  </div>
                  {v.plate_number && <div style={{ fontSize: '13px', color: theme.dim, marginTop: '2px' }}>{v.plate_number}</div>}
                  <div style={{ fontSize: '12px', color: theme.dim }}>{v.brand} {v.model}</div>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: v.isOnTrip ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                  color: v.isOnTrip ? '#22c55e' : '#64748b',
                }}>{v.isOnTrip ? t('overview.fleetBadgeOnTrip') : t('overview.fleetBadgeFree')}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: theme.text }}>
                <span>{'\ud83d\udee3\ufe0f'} {formatNumber(Math.round(v.monthKm))} {unitSys === 'imperial' ? 'mi' : '\u043a\u043c'}</span>
                <span>{'\u26fd'} {formatNumber(Math.round(v.monthFuelCost))} {cs}</span>
                <span>{'\ud83d\ude9a'} {v.monthTrips} {t('overview.fleetTrips').toLowerCase()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Theme switcher — for non-company roles (company has it above fleet panel) */}
      {!isCompanyRole && (
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
      )}

      {/* Shift blocks — hidden for company and job_seeker roles */}
      {role !== 'company' && role !== 'job_seeker' && (<>
      {/* Combined Shift + HOS card */}
      <div ref={shiftBlockRef} style={{ ...cardStyle, marginBottom: '12px' }}>
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
        {/* HOS timer — only for countries without mandatory ELD/tachograph */}
        {showHOS && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid ' + theme.border }}>
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
                background: seconds >= hosMaxSeconds ? '#ef4444' : '#f59e0b',
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
        <div style={{ display: 'flex', gap: '6px', marginBottom: shiftPeriod === 'custom' ? '8px' : '12px' }}>
          {[
            { key: 'week', label: t('overview.week') },
            { key: 'month', label: t('overview.month') },
            { key: 'custom', label: t('overview.customPeriod') || '\u041f\u0435\u0440\u0438\u043e\u0434' },
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
        {shiftPeriod === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px' }}>{t('overview.dateFrom') || '\u041e\u0442'}</div>
              <input
                type="date"
                value={shiftCustomFrom}
                onChange={e => setShiftCustomFrom(e.target.value)}
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
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px' }}>{t('overview.dateTo') || '\u0414\u043e'}</div>
              <input
                type="date"
                value={shiftCustomTo}
                onChange={e => setShiftCustomTo(e.target.value)}
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

            const filteredHistory = shiftPeriod === 'custom' && shiftCustomFrom && shiftCustomTo
              ? shiftHistory.filter(s => {
                  const d = new Date(s.started_at)
                  const from = new Date(shiftCustomFrom); from.setHours(0,0,0,0)
                  const to = new Date(shiftCustomTo); to.setHours(23,59,59,999)
                  return d >= from && d <= to
                })
              : shiftHistory
            const visibleShifts = shiftHistoryExpanded ? filteredHistory : filteredHistory.slice(0, 1)

            return <>
            {visibleShifts.map((sh, i) => {
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
                  marginBottom: i < visibleShifts.length - 1 ? '8px' : 0,
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
            })}
            {filteredHistory.length > 1 && (
              <div
                onClick={() => setShiftHistoryExpanded(prev => !prev)}
                style={{
                  textAlign: 'center',
                  padding: '10px 0',
                  marginTop: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#f59e0b',
                }}
              >
                {shiftHistoryExpanded
                  ? `${t('overview.collapse') || '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c'} \u25b2`
                  : `${t('overview.allShifts') || '\u0412\u0441\u0435 \u0441\u043c\u0435\u043d\u044b'} \u25bc`}
              </div>
            )}
            </>
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
      </>)}

      {/* Quick links — for owner_operator only, shown here (before finance); for company/driver — shown inside loading block at bottom */}
      {onExtraNav && role !== 'job_seeker' && role !== 'company' && role !== 'driver' && (
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ ...dimText, marginBottom: '10px' }}>{'\u2b50'} {t('overview.quickLinks')}</div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { key: 'jobs', icon: '\ud83d\udcbc', label: t('overview.qlJobs') },
              { key: 'news', icon: '\ud83d\udcf0', label: t('overview.qlNews') },
              { key: 'marketplace', icon: '\ud83d\udce2', label: t('overview.qlMarketplace') },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => onExtraNav(item.key)}
                style={{
                  flex: '0 0 80px',
                  width: '80px',
                  height: '80px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: theme.card,
                  border: '1px solid ' + theme.border,
                  borderRadius: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: theme.text, lineHeight: 1.2, textAlign: 'center' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Job seeker — only quick links */}
      {role === 'job_seeker' && onExtraNav && (
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ ...dimText, marginBottom: '10px' }}>{'\u2b50'} {t('overview.quickLinks')}</div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { key: 'jobs', icon: '\ud83d\udcbc', label: t('overview.qlJobs') },
              { key: 'news', icon: '\ud83d\udcf0', label: t('overview.qlNews') },
              { key: 'marketplace', icon: '\ud83d\udce2', label: t('overview.qlMarketplace') },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => onExtraNav(item.key)}
                style={{
                  flex: '0 0 80px',
                  width: '80px',
                  height: '80px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: theme.card,
                  border: '1px solid ' + theme.border,
                  borderRadius: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: theme.text, lineHeight: 1.2, textAlign: 'center' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {role !== 'job_seeker' && (loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Finance card — 3 modes: hired driver / owner-operator / fleet owner (hidden for job_seeker) */}
          {role !== 'job_seeker' && (
          <div onClick={() => onExtraNav?.('finance')} style={{ ...cardStyle, marginBottom: '12px', cursor: 'pointer', position: 'relative', transition: 'opacity 0.15s' }} onPointerDown={e => e.currentTarget.style.opacity = '0.6'} onPointerUp={e => e.currentTarget.style.opacity = '1'} onPointerLeave={e => e.currentTarget.style.opacity = '1'}>
            <div style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '14px', color: theme.dim, opacity: 0.5 }}>{'\u203a'}</div>
            {isCompanyRole ? (
              <>
                {(() => {
                  const calcSalaryForCard = (d) => {
                    if (salaryMode === 'per_km') return d.km * salaryRate
                    if (salaryMode === 'percent') return d.income * (salaryRate / 100)
                    return salaryRate
                  }
                  const fleetTotalSalary = salaryData.reduce((s, d) => s + calcSalaryForCard(d), 0)
                  const fleetIncome = fleetData ? fleetData.totalIncome : monthData.income
                  const fleetExpense = fleetData ? fleetData.totalExpenses : totalExpenses
                  const fleetGrossProfit = fleetIncome - fleetExpense
                  const fleetNetProfit = fleetGrossProfit - fleetTotalSalary
                  const fleetVehicleCount = fleetData ? fleetData.totalVehicles + (profile?.brand ? 1 : 0) : 1
                  return (
                    <>
                      <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83c\udfe2'} {t('overview.fleetFinances')} — {getMonthName(new Date())}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>{fleetVehicleCount}</div>
                          <div style={{ fontSize: '11px', color: theme.dim }}>{t('overview.fleetVehicles')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>{formatNumber(Math.round(fleetIncome))} {cs}</div>
                          <div style={{ fontSize: '11px', color: theme.dim }}>{t('overview.fleetIncome')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>{formatNumber(Math.round(fleetExpense))} {cs}</div>
                          <div style={{ fontSize: '11px', color: theme.dim }}>{t('overview.fleetExpense')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: fleetGrossProfit >= 0 ? '#22c55e' : '#ef4444' }}>{fleetGrossProfit >= 0 ? '+' : ''}{formatNumber(Math.round(fleetGrossProfit))} {cs}</div>
                          <div style={{ fontSize: '11px', color: theme.dim }}>{t('overview.grossProfit')}</div>
                        </div>
                      </div>
                      {fleetTotalSalary > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed ' + theme.border }}>
                          <div style={{ fontSize: '12px', color: theme.dim }}>
                            {t('overview.salariesLabel')}: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f59e0b' }}>{formatNumber(Math.round(fleetTotalSalary))} {cs}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: theme.dim }}>
                            {t('overview.netLabel')}: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: fleetNetProfit >= 0 ? '#22c55e' : '#ef4444' }}>{formatNumber(Math.round(fleetNetProfit))} {cs}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </>
            ) : isHiredDriver ? (
              <>
                <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcb5'} {t('pay.myEarnings')} — {getMonthName(new Date())}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={dimText}>{t('pay.earnedMonth')}</div>
                    <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>
                      {formatNumber(Math.round(monthData.driverPay || 0))} {cs}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={dimText}>{t('byt.personalExpenses')}</div>
                    <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                      {formatNumber(Math.round(monthData.bytCost))} {cs}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '8px', textAlign: 'center' }}>
                  <div style={dimText}>{t('pay.netClean')}</div>
                  {(() => { const driverNet = (monthData.driverPay || 0) - monthData.bytCost; return (
                    <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: driverNet >= 0 ? '#22c55e' : '#ef4444' }}>
                      {driverNet >= 0 ? '+' : ''}{formatNumber(Math.round(driverNet))} {cs}
                    </div>
                  ) })()}
                </div>
              </>
            ) : (
              <>
                <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcca'} {t('overview.finances')} — {getMonthName(new Date())}</div>
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
              </>
            )}

            {/* Donut chart breakdown — hired driver sees only personal expenses */}
            {(() => {
              const chartData = isHiredDriver ? expenseBreakdown.filter(e => e.isPersonal) : expenseBreakdown
              if (chartData.length === 0) return null
              const donutTotal = chartData.reduce((s, e) => s + e.value, 0)
              const radius = 50
              const strokeWidth = 14
              const circumference = 2 * Math.PI * radius
              let cumulativeOffset = 0
              const segments = chartData.map(e => {
                const pct = e.value / donutTotal
                const dashLen = pct * circumference
                const offset = cumulativeOffset
                cumulativeOffset += dashLen
                return { ...e, pct, dashLen, offset }
              })
              return (
                <>
                  <div style={{ borderTop: '1px solid ' + theme.border, margin: '12px 0 0 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
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
                            {formatNumber(Math.round(seg.value))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
          )}

          {/* Mini cards — mode-specific (hidden for job_seeker, driver, and company) */}
          {role !== 'job_seeker' && role !== 'driver' && !isCompanyRole && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {(isCompanyRole ? [
              { label: t('overview.fleetVehicles') || '\u041c\u0430\u0448\u0438\u043d', value: String(fleetData ? fleetData.totalVehicles + (profile?.brand ? 1 : 0) : (profile?.brand ? 1 : 0)), unit: '', icon: '\ud83d\ude9b', action: () => {} },
              { label: t('overview.mileage'), value: formatNumber(Math.round(fleetData ? fleetData.totalKm : monthData.totalKm)), unit: unitSys === 'imperial' ? 'mi' : '\u043a\u043c', icon: '\ud83d\udee3\ufe0f', action: () => {} },
              { label: t('overview.tripsLabel'), value: String(fleetData ? fleetData.tripCount : monthData.tripCount), unit: '', icon: '\ud83d\ude9a', action: () => onExtraNav?.('trips') },
              { label: t('overview.costPerKm'), value: (() => { const km = fleetData ? fleetData.totalKm : monthData.totalKm; const exp = fleetData ? fleetData.totalExpenses : totalExpenses; return km > 0 ? (exp / km).toFixed(1) : '\u2014' })(), unit: cs + '/' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c'), icon: '\ud83d\udcb0', action: () => onExtraNav?.('trips') },
            ] : isHiredDriver ? [
              { label: t('overview.mileage'), value: formatNumber(Math.round(monthData.totalKm)), unit: unitSys === 'imperial' ? 'mi' : '\u043a\u043c', icon: '\ud83d\udee3\ufe0f', action: () => shiftBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
              { label: t('overview.tripsLabel'), value: String(monthData.tripCount), unit: '', icon: '\ud83d\ude9a', action: () => onExtraNav?.('trips') },
            ] : [
              { label: t('overview.mileage'), value: formatNumber(Math.round(monthData.totalKm)), unit: unitSys === 'imperial' ? 'mi' : '\u043a\u043c', icon: '\ud83d\udee3\ufe0f', action: () => shiftBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
              { label: t('overview.consumption'), value: monthData.avgConsumption > 0 ? monthData.avgConsumption.toFixed(1) : '\u2014', unit: unitSys === 'imperial' ? 'MPG' : '\u043b/100\u043a\u043c', icon: '\u26fd', action: () => onExtraNav?.('expenses') },
              { label: t('overview.tripsLabel'), value: String(monthData.tripCount), unit: '', icon: '\ud83d\ude9a', action: () => onExtraNav?.('trips') },
              { label: t('overview.costPerKm'), value: monthData.totalKm > 0 ? (totalExpenses / monthData.totalKm).toFixed(1) : '\u2014', unit: cs + '/' + (unitSys === 'imperial' ? 'mi' : '\u043a\u043c'), icon: '\ud83d\udcb0', action: () => onExtraNav?.('trips') },
            ]).map((item, i) => (
              <div key={i} onClick={item.action} style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px', cursor: 'pointer', position: 'relative', transition: 'opacity 0.15s' }} onPointerDown={e => e.currentTarget.style.opacity = '0.6'} onPointerUp={e => e.currentTarget.style.opacity = '1'} onPointerLeave={e => e.currentTarget.style.opacity = '1'}>
                <div style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '10px', color: theme.dim, opacity: 0.5 }}>{'\u203a'}</div>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>{item.icon}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>{item.value}</div>
                <div style={{ fontSize: '11px', color: theme.dim }}>{item.unit}</div>
                <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>{item.label}</div>
              </div>
            ))}
          </div>
          )}

          {/* AI Forecast — hidden for job_seeker and driver */}
          {role !== 'job_seeker' && role !== 'driver' && (
            <AIForecast userId={userId} activeVehicleId={activeVehicleId} />
          )}

          {/* Achievements preview — hidden for job_seeker and company */}
          {role !== 'job_seeker' && role !== 'company' && (
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
          )}

          {/* Quick links — for company and driver roles, shown at bottom */}
          {(isCompanyRole || role === 'driver') && onExtraNav && (
            <div style={{ ...cardStyle, marginBottom: '12px' }}>
              <div style={{ ...dimText, marginBottom: '10px' }}>{'\u2b50'} {t('overview.quickLinks')}</div>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                {[
                  { key: 'jobs', icon: '\ud83d\udcbc', label: t('overview.qlJobs') },
                  { key: 'news', icon: '\ud83d\udcf0', label: t('overview.qlNews') },
                  { key: 'marketplace', icon: '\ud83d\udce2', label: t('overview.qlMarketplace') },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => onExtraNav(item.key)}
                    style={{
                      flex: '0 0 80px',
                      width: '80px',
                      height: '80px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: theme.card,
                      border: '1px solid ' + theme.border,
                      borderRadius: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
                    onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    <span style={{ fontSize: '28px', lineHeight: 1 }}>{item.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: theme.text, lineHeight: 1.2, textAlign: 'center' }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reminders */}
          {role !== 'job_seeker' && reminders.length > 0 && (
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
      ))}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
