import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { fetchFuels, fetchTrips, fetchBytExpenses, fetchServiceRecords, fetchInsurance } from '../lib/api'

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

export default function Overview({ userName, userId, onOpenProfile }) {
  const { theme, mode, setMode } = useTheme()
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef(null)
  const [profileName, setProfileName] = useState(userName || null)
  const [loading, setLoading] = useState(true)
  const [monthData, setMonthData] = useState({ income: 0, fuelCost: 0, bytCost: 0, serviceCost: 0, tripCount: 0, totalKm: 0, avgConsumption: 0 })
  const [expenseBreakdown, setExpenseBreakdown] = useState([])
  const [reminders, setReminders] = useState([])

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

      const [fuels, trips, bytExps, serviceRecs, insuranceRecs] = await Promise.all([
        fetchFuels(userId),
        fetchTrips(userId),
        fetchBytExpenses(userId),
        fetchServiceRecords(userId).catch(() => []),
        fetchInsurance(userId).catch(() => []),
      ])

      // Filter to current month
      const monthFuels = fuels.filter(e => e.date >= monthStart)
      const monthTrips = trips.filter(e => (e.created_at || '').slice(0, 10) >= monthStart)
      const monthByt = bytExps.filter(e => e.date >= monthStart)
      const monthService = serviceRecs.filter(e => e.date >= monthStart)

      const fuelCost = monthFuels.reduce((s, e) => s + (e.cost || 0), 0)
      const bytCost = monthByt.reduce((s, e) => s + (e.amount || 0), 0)
      const serviceCost = monthService.reduce((s, e) => s + (e.cost || 0), 0)
      const income = monthTrips.reduce((s, t) => s + (t.income || 0), 0)
      const totalKm = monthTrips.reduce((s, t) => s + (t.distance_km || 0), 0)
      const totalLiters = monthFuels.reduce((s, e) => s + (e.liters || 0), 0)
      const avgConsumption = totalKm > 0 ? (totalLiters / totalKm * 100) : 0

      setMonthData({
        income,
        fuelCost,
        bytCost,
        serviceCost,
        tripCount: monthTrips.length,
        totalKm,
        avgConsumption,
      })

      // Expense breakdown for chart
      const breakdown = []
      if (fuelCost > 0) breakdown.push({ label: '\u0422\u043e\u043f\u043b', value: fuelCost, color: '#f59e0b' })
      if (serviceCost > 0) breakdown.push({ label: '\u0420\u0435\u043c', value: serviceCost, color: '#ef4444' })
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
  }, [loadData])

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => prev + 1)
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [timerRunning])

  const greeting = getGreeting(profileName)
  const totalExpenses = monthData.fuelCost + monthData.bytCost + monthData.serviceCost
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
          <span style={{ fontSize: '12px', color: theme.dim }}>{'\u043c\u0430\u043a\u0441 9\u0447'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '32px', fontFamily: 'monospace', fontWeight: 700 }}>
            {formatTimer(seconds)}
          </span>
          <button
            onClick={() => setTimerRunning(prev => !prev)}
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
        {/* Progress bar (9h = 32400s) */}
        <div style={{ marginTop: '8px', background: theme.border, borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min((seconds / 32400) * 100, 100)}%`,
            height: '100%',
            background: seconds > 28800 ? '#ef4444' : '#f59e0b',
            transition: 'width 1s linear',
          }} />
        </div>
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
