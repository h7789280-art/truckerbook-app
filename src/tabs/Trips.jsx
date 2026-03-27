import { useState, useMemo, useEffect, useCallback } from 'react'
import { fetchTrips, deleteTrip } from '../lib/api'
import { useTheme } from '../lib/theme'

const TABS = [
  { key: 'trips', label: '\ud83d\ude9b \u0420\u0435\u0439\u0441\u044b' },
  { key: 'calc', label: '\ud83d\udcca \u041a\u0430\u043b\u044c\u043a\u0443\u043b\u044f\u0442\u043e\u0440' },
]

function fmt(n) {
  if (n >= 1000) {
    const k = n / 1000
    return k % 1 === 0 ? k + 'k' : k.toFixed(1) + 'k'
  }
  return n.toLocaleString('ru-RU')
}

function fmtFull(n) {
  return n.toLocaleString('ru-RU')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TripsTab({ userId, refreshKey, theme }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchTrips(userId)
      setEntries(data)
    } catch (err) {
      console.error('Failed to load trips:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleDelete = async (id) => {
    try {
      await deleteTrip(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete trip:', err)
    }
  }

  const totalIncome = entries.reduce((s, t) => s + (t.income || 0), 0)
  const totalKm = entries.reduce((s, t) => s + (t.distance_km || 0), 0)

  const card = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '16px' }
  const miniCard = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '12px', textAlign: 'center' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Mini cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={miniCard}>
          <div style={{ color: theme.dim, fontSize: '11px', marginBottom: '4px' }}>
            {'\u0414\u043e\u0445\u043e\u0434'}
          </div>
          <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalIncome)} {'\u20bd'}
          </div>
        </div>
        <div style={miniCard}>
          <div style={{ color: theme.dim, fontSize: '11px', marginBottom: '4px' }}>
            {'\u041a\u041c'}
          </div>
          <div style={{ color: theme.text, fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalKm)}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: theme.dim, fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
          {'\u0420\u0415\u0419\u0421\u042b'}
        </div>
      </div>

      {/* Trip cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
          {'\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0440\u0435\u0439\u0441\u043e\u0432. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 + \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0435\u0440\u0432\u044b\u0439'}
        </div>
      ) : (
        entries.map((trip) => (
          <div key={trip.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ color: theme.text, fontSize: '16px', fontWeight: 600 }}>
                  {trip.origin || '?'} {'\u2192'} {trip.destination || '?'}
                </div>
                <div style={{ color: theme.dim, fontSize: '13px', marginTop: '4px' }}>
                  {formatDate(trip.created_at)} {'\u00b7'} {fmtFull(trip.distance_km || 0)} {'\u043a\u043c'}
                </div>
              </div>
              <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
                +{fmtFull(trip.income || 0)} {'\u20bd'}
              </div>
            </div>
            <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleDelete(trip.id)}
                style={{
                  background: 'none',
                  border: '1px solid #ef444466',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '12px',
                  padding: '4px 12px',
                  cursor: 'pointer',
                }}
              >
                {'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function CalcTab({ theme }) {
  const [km, setKm] = useState(820)
  const [rate, setRate] = useState(65000)

  const calc = useMemo(() => {
    const fuel = km * 34.4 / 100 * 58.9
    const platon = km * 2.7
    const food = km / 250 * 450
    const housing = km / 800 * 1750
    const totalExp = fuel + platon + food + housing
    const profit = rate - totalExp
    const minRate = totalExp * 1.2
    const perKm = profit / km
    return { fuel, platon, food, housing, totalExp, profit, minRate, perKm }
  }, [km, rate])

  const profitable = calc.profit > 0
  const card = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Distance slider */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: theme.dim, fontSize: '13px' }}>{'\u0420\u0430\u0441\u0441\u0442\u043e\u044f\u043d\u0438\u0435'}</div>
          <div style={{ color: theme.text, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtFull(km)} {'\u043a\u043c'}</div>
        </div>
        <input
          type="range"
          min={100}
          max={3000}
          step={10}
          value={km}
          onChange={e => setKm(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#f59e0b' }}
        />
      </div>

      {/* Rate slider */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: theme.dim, fontSize: '13px' }}>{'\u0421\u0442\u0430\u0432\u043a\u0430'}</div>
          <div style={{ color: theme.text, fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtFull(rate)} {'\u20bd'}</div>
        </div>
        <input
          type="range"
          min={10000}
          max={300000}
          step={1000}
          value={rate}
          onChange={e => setRate(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#f59e0b' }}
        />
      </div>

      {/* Cost breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[
          { label: '\u26fd \u0422\u043e\u043f\u043b\u0438\u0432\u043e', value: calc.fuel, color: '#f59e0b' },
          { label: '\ud83d\ude9b \u041f\u043b\u0430\u0442\u043e\u043d/\u0434\u043e\u0440\u043e\u0433\u0438', value: calc.platon, color: '#3b82f6' },
          { label: '\ud83c\udf7d \u0415\u0434\u0430', value: calc.food, color: '#a855f7' },
          { label: '\ud83c\udfe0 \u0416\u0438\u043b\u044c\u0451', value: calc.housing, color: '#06b6d4' },
        ].map((item, i) => (
          <div key={i} style={card}>
            <div style={{ color: theme.dim, fontSize: '12px', marginBottom: '6px' }}>{item.label}</div>
            <div style={{ color: item.color, fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>
              {fmtFull(Math.round(item.value))} {'\u20bd'}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'}</div>
          <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(Math.round(calc.totalExp))} {'\u20bd'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{'\u0421\u0442\u0430\u0432\u043a\u0430'}</div>
          <div style={{ color: theme.text, fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(rate)} {'\u20bd'}
          </div>
        </div>
        <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ color: theme.dim, fontSize: '14px', fontWeight: 600 }}>{'\u041f\u0440\u0438\u0431\u044b\u043b\u044c'}</div>
          <div style={{ color: profitable ? '#22c55e' : '#ef4444', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {profitable ? '+' : ''}{fmtFull(Math.round(calc.profit))} {'\u20bd'}
          </div>
        </div>
      </div>

      {/* Profitable banner */}
      <div style={{
        ...card,
        background: profitable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${profitable ? '#22c55e33' : '#ef444433'}`,
        textAlign: 'center',
        padding: '14px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: profitable ? '#22c55e' : '#ef4444' }}>
          {profitable ? '\u2705 \u0420\u0435\u0439\u0441 \u043f\u0440\u0438\u0431\u044b\u043b\u044c\u043d\u044b\u0439' : '\u274c \u0420\u0435\u0439\u0441 \u0443\u0431\u044b\u0442\u043e\u0447\u043d\u044b\u0439'}
        </div>
      </div>

      {/* Extra metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={card}>
          <div style={{ color: theme.dim, fontSize: '11px', marginBottom: '4px' }}>
            {'\u041c\u0438\u043d. \u0441\u0442\u0430\u0432\u043a\u0430 (+20% \u043c\u0430\u0440\u0436\u0438)'}
          </div>
          <div style={{ color: '#f59e0b', fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(Math.round(calc.minRate))} {'\u20bd'}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: theme.dim, fontSize: '11px', marginBottom: '4px' }}>
            {'\u0414\u043e\u0445\u043e\u0434 \u043d\u0430 1 \u043a\u043c'}
          </div>
          <div style={{ color: profitable ? '#22c55e' : '#ef4444', fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>
            {calc.perKm.toFixed(1)} {'\u20bd'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Trips({ userId, refreshKey }) {
  const { theme } = useTheme()
  const [tab, setTab] = useState('trips')

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      {/* Sub-tab switcher */}
      <div style={{
        display: 'flex',
        background: theme.card,
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '16px',
        border: '1px solid ' + theme.border,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              background: tab === t.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
              color: tab === t.key ? '#fff' : theme.dim,
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trips' ? <TripsTab userId={userId} refreshKey={refreshKey} theme={theme} /> : <CalcTab theme={theme} />}
    </div>
  )
}
