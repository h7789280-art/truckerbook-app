import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchInsurance, fetchVehicleExpenses, getActiveShift, startShift, endShift, getCompletedShifts, getShiftStats, getTodayShiftSummary, startDrivingSession, endDrivingSession } from '../lib/api'

function getGreeting(name) {
  const h = new Date().getHours()
  const n = name || '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c'
  if (h >= 6 && h < 12) return { text: `\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e, ${n}!`, icon: '\u2600\ufe0f' }
  if (h >= 12 && h < 18) return { text: `\u0414\u043e\u0431\u0440\u044b\u0439 \u0434\u0435\u043d\u044c, ${n}!`, icon: '\ud83d\udc4b' }
  if (h >= 18 && h < 23) return { text: `\u0414\u043e\u0431\u0440\u044b\u0439 \u0432\u0435\u0447\u0435\u0440, ${n}!`, icon: '\ud83c\udf05' }
  return { text: `\u0414\u043e\u0431\u0440\u043e\u0439 \u043d\u043e\u0447\u0438, ${n}!`, icon: '\ud83c\udf19' }
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

const THEME_OPTIONS = [
  { key: 'light', label: '\u2600\ufe0f \u0414\u0435\u043d\u044c' },
  { key: 'dark', label: '\ud83c\udf19 \u041d\u043e\u0447\u044c' },
  { key: 'red_night', label: '\ud83d\udd34 \u041a\u0440\u0430\u0441\u043d\u0430\u044f' },
  { key: 'auto', label: '\ud83d\udd04 \u0410\u0432\u0442\u043e' },
]

export default function Overview({ userName, userId, profile, onOpenProfile, refreshKey }) {
  const { theme, mode, setMode } = useTheme()
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
  const [shiftPeriod, setShiftPeriod] = useState('week')
  const [shiftStats, setShiftStats] = useState({ count: 0, totalKm: 0, totalHours: 0 })
  const [shiftHistory, setShiftHistory] = useState([])
  const [todaySummary, setTodaySummary] = useState(null)

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
      if (fuelCost > 0) breakdown.push({ label: '\u0422\u043e\u043f\u043b', value: fuelCost, color: '#f59e0b' })
      if (serviceCost > 0) breakdown.push({ label: '\u0420\u0435\u043c', value: serviceCost, color: '#ef4444' })
      if (vehicleExpCost > 0) breakdown.push({ label: '\u041c\u0430\u0448\u0438\u043d\u0430', value: vehicleExpCost, color: '#8b5cf6' })
      // Group byt by category
      const bytByCategory = {}
      monthByt.forEach(e => {
        const cat = e.category || 'other'
        bytByCategory[cat] = (bytByCategory[cat] || 0) + (e.amount || 0)
      })
      if (bytByCategory.food) breakdown.push({ label: '\u0415\u0434\u0430', value: bytByCategory.food, color: '#22c55e' })
      if (bytByCategory.hotel) breakdown.push({ label: '\u0416\u0438\u043b\u044c\u0451', value: bytByCategory.hotel, color: '#3b82f6' })
      const otherByt = Object.entries(bytByCategory)
        .filter(([k]) => k !== 'food' && k !== 'hotel')
        .reduce((s, [, v]) => s + v, 0)
      if (otherByt > 0) breakdown.push({ label: '\u041f\u0440\u043e\u0447', value: otherByt, color: '#06b6d4' })
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
      setReminders(reminderList)
    } catch (err) {
      console.error('Overview loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  // Load active shift
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getActiveShift(userId).then(shift => {
      if (!cancelled) setActiveShift(shift)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  // Load shift analytics
  const loadShiftAnalytics = useCallback(async () => {
    if (!userId) return
    try {
      const [stats, history, today] = await Promise.all([
        getShiftStats(userId, shiftPeriod),
        getCompletedShifts(userId, 10),
        getTodayShiftSummary(userId),
      ])
      setShiftStats(stats)
      setShiftHistory(history)
      setTodaySummary(today)
    } catch (err) {
      console.error('loadShiftAnalytics error:', err)
    }
  }, [userId, shiftPeriod])

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
      const shift = await startShift(userId, null, shiftOdometer, profileName || '')
      setActiveShift(shift)
      setShiftModal(null)
      setShiftOdometer('')
    } catch (err) {
      console.error('startShift error:', err)
    }
  }

  const handleEndShift = async () => {
    if (!shiftOdometer || !activeShift) return
    try {
      await endShift(activeShift.id, shiftOdometer)
      setActiveShift(null)
      setShiftModal(null)
      setShiftOdometer('')
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
            }
          } else {
            if (next === 27000) { // 7h30m
              setHosWarning('\u26A0\uFE0F \u0427\u0435\u0440\u0435\u0437 30 \u043C\u0438\u043D \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0440\u044B\u0432 30 \u043C\u0438\u043D\u0443\u0442 (DOT)')
            }
            if (next === 37800) { // 10h30m
              setHosWarning('\u26A0\uFE0F \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 30 \u043C\u0438\u043D\u0443\u0442 \u0434\u043E \u0441\u0443\u0442\u043E\u0447\u043D\u043E\u0433\u043E \u043B\u0438\u043C\u0438\u0442\u0430!')
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

  const greeting = getGreeting(profileName)
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

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '16px', paddingBottom: '80px' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '20px', fontWeight: 600 }}>
          {greeting.icon} {greeting.text}
        </div>
        {onOpenProfile && (
          <button
            onClick={onOpenProfile}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '22px',
              padding: '4px',
              lineHeight: 1,
            }}
          >{'\u2699\ufe0f'}</button>
        )}
      </div>

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
        {THEME_OPTIONS.map(t => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            style={{
              flex: 1,
              padding: '8px 4px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === t.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
              color: mode === t.key ? '#fff' : theme.dim,
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Driving timer */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: theme.dim }}>{'\u23f1\ufe0f'} {'\u0412\u0440\u0435\u043c\u044f \u0437\u0430 \u0440\u0443\u043b\u0451\u043c'}</span>
          <span style={{ fontSize: '12px', color: theme.dim }}>
            {hosMode === 'usa' ? '\u043c\u0430\u043a\u0441 11\u0447 (DOT)' : '\u043c\u0430\u043a\u0441 9\u0447'}
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
            {'\u26A0\uFE0F \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0440\u044B\u0432 30 \u043C\u0438\u043D (DOT)'}
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
            {'\uD83D\uDED1 \u041B\u0418\u041C\u0418\u0422 \u041F\u0420\u0415\u0412\u042B\u0428\u0415\u041D'}
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
        <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83d\udee3\ufe0f'} {'\u0421\u043c\u0435\u043d\u0430'}</div>
        {activeShift ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px' }}>
                {'\u2705'} {'\u041d\u0430\u0447\u0430\u0442\u0430 \u0432 '}{new Date(activeShift.started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>
                {formatTimer(shiftElapsed)}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: theme.dim, marginBottom: '12px' }}>
              {'\u041e\u0434\u043e\u043c\u0435\u0442\u0440 \u043d\u0430\u0447\u0430\u043b\u0430: '}{formatNumber(activeShift.odometer_start || 0)}{' \u043a\u043c'}
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
              {'\u23f9'} {'\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c \u0441\u043c\u0435\u043d\u0443'}
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
            {'\u25b6'} {'\u041d\u0430\u0447\u0430\u0442\u044c \u0441\u043c\u0435\u043d\u0443'}
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
            {'\u0421\u0435\u0433\u043e\u0434\u043d\u044f: '}{todaySummary.count}{' '}{todaySummary.count === 1 ? '\u0441\u043c\u0435\u043d\u0430' : todaySummary.count < 5 ? '\u0441\u043c\u0435\u043d\u044b' : '\u0441\u043c\u0435\u043d'}
            {' \u00b7 '}{formatNumber(Math.round(todaySummary.totalKm))}{' \u043a\u043c'}
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
        }} onClick={() => setShiftModal(null)}>
          <div style={{
            background: theme.card,
            border: '1px solid ' + theme.border,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '360px',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: theme.text }}>
              {shiftModal === 'start' ? '\u041d\u0430\u0447\u0430\u043b\u043e \u0441\u043c\u0435\u043d\u044b' : '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435 \u0441\u043c\u0435\u043d\u044b'}
            </div>
            <label style={{ fontSize: '14px', color: theme.dim, display: 'block', marginBottom: '6px' }}>
              {'\u041f\u0440\u043e\u0431\u0435\u0433 (\u043a\u043c)'}
            </label>
            <input
              type="number"
              value={shiftOdometer}
              onChange={e => setShiftOdometer(e.target.value)}
              placeholder={'\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0434\u043e\u043c\u0435\u0442\u0440'}
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
            {shiftModal === 'end' && shiftOdometer && activeShift && (
              <div style={{
                background: theme.bg,
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: '13px', color: theme.dim }}>{'\u0417\u0430 \u0441\u043c\u0435\u043d\u0443: '}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>
                  {Math.max(0, parseInt(shiftOdometer, 10) - (activeShift.odometer_start || 0))}{' \u043a\u043c'}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShiftModal(null)}
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
                {'\u041e\u0442\u043c\u0435\u043d\u0430'}
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
                {shiftModal === 'start' ? '\u041d\u0430\u0447\u0430\u0442\u044c' : '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift analytics */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '10px' }}>{'\ud83d\udcca'} {'\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u0441\u043c\u0435\u043d'}</div>

        {/* Period toggle */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[
            { key: 'week', label: '\u041d\u0435\u0434\u0435\u043b\u044f' },
            { key: 'month', label: '\u041c\u0435\u0441\u044f\u0446' },
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
            { label: '\u0421\u043c\u0435\u043d', value: String(shiftStats.count) },
            { label: '\u041a\u043c', value: formatNumber(Math.round(shiftStats.totalKm)) },
            { label: '\u0427\u0430\u0441\u043e\u0432', value: shiftStats.totalHours.toFixed(1) },
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

        {/* History */}
        <div style={{ ...dimText, marginBottom: '8px' }}>{'\ud83d\udcc3'} {'\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0441\u043c\u0435\u043d'}</div>
        {shiftHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: theme.dim, fontSize: '13px' }}>
            {'\u041d\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d\u043d\u044b\u0445 \u0441\u043c\u0435\u043d'}
          </div>
        ) : (
          shiftHistory.map((sh, i) => {
            const start = new Date(sh.started_at)
            const end = sh.ended_at ? new Date(sh.ended_at) : null
            const durationMin = end ? Math.round((end - start) / 60000) : 0
            const durationH = Math.floor(durationMin / 60)
            const durationM = durationMin % 60
            const durationStr = durationH > 0
              ? `${durationH} \u0447 ${durationM} \u043c\u0438\u043d`
              : `${durationM} \u043c\u0438\u043d`
            const dateStr = start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            const timeStart = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            const timeEnd = end ? end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u2014'
            const kmDriven = sh.km_driven || 0

            return (
              <div key={sh.id || i} style={{
                background: theme.bg,
                borderRadius: '10px',
                padding: '12px',
                marginBottom: i < shiftHistory.length - 1 ? '8px' : 0,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px' }}>{'\ud83d\udcc5'} {dateStr}</span>
                  <span style={{ fontSize: '13px', color: theme.dim }}>
                    {timeStart} {'\u2014'} {timeEnd} ({durationStr})
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: theme.dim }}>
                    {'\u041e\u0434\u043e\u043c\u0435\u0442\u0440: '}{formatNumber(sh.odometer_start || 0)} {'\u2192'} {formatNumber(sh.odometer_end || 0)} {'\u043a\u043c'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>
                    +{formatNumber(kmDriven)} {'\u043a\u043c'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
        </div>
      ) : (
        <>
          {/* Monthly summary */}
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcc5'} {getMonthName(new Date())}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={dimText}>{'\u0414\u043e\u0445\u043e\u0434'}</div>
                <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>
                  {formatNumber(Math.round(monthData.income))} {'\u20bd'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={dimText}>{'\u0420\u0430\u0441\u0445\u043e\u0434'}</div>
                <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                  {formatNumber(Math.round(totalExpenses))} {'\u20bd'}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '8px', textAlign: 'center' }}>
              <div style={dimText}>{'\u0427\u0438\u0441\u0442\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c'}</div>
              <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {profit >= 0 ? '+' : ''}{formatNumber(Math.round(profit))} {'\u20bd'}
              </div>
            </div>
          </div>

          {/* Mini cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: '\u041f\u0440\u043e\u0431\u0435\u0433', value: formatNumber(Math.round(monthData.totalKm)), unit: '\u043a\u043c', icon: '\ud83d\udea3' },
              { label: '\u0420\u0430\u0441\u0445\u043e\u0434', value: monthData.avgConsumption > 0 ? monthData.avgConsumption.toFixed(1) : '\u2014', unit: '\u043b/100\u043a\u043c', icon: '\u26fd' },
              { label: '\u0420\u0435\u0439\u0441\u044b', value: String(monthData.tripCount), unit: '', icon: '\ud83d\ude9a' },
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
              <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcca'} {'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'}</div>
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

          {/* Reminders */}
          {reminders.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udd14'} {'\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f'}</div>
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
    </div>
  )
}
