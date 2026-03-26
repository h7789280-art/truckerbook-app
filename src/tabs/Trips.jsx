import React, { useState, useMemo } from 'react'

const TRIPS_DATA = [
  {
    from: '\u041c\u043e\u0441\u043a\u0432\u0430',
    to: '\u041a\u0430\u0437\u0430\u043d\u044c',
    date: '2026-03-20',
    km: 820,
    income: 65000,
    expenses: [
      { key: 'fuel', icon: '\u26fd\ufe0f', amount: 2800 },
      { key: 'repair', icon: '\ud83c\udfd7', amount: 3500 },
      { key: 'food', icon: '\ud83c\udf7d', amount: 400 },
      { key: 'housing', icon: '\ud83c\udfe0', amount: 600 },
      { key: 'toll', icon: '\ud83c\udd7f\ufe0f', amount: 800 },
      { key: 'platon', icon: '\ud83d\ude9b', amount: 2200 },
      { key: 'other', icon: '\ud83d\udce6', amount: 500 },
    ],
  },
  {
    from: '\u041a\u0430\u0437\u0430\u043d\u044c',
    to: '\u0415\u043a\u0430\u0442\u0435\u0440\u0438\u043d\u0431\u0443\u0440\u0433',
    date: '2026-03-23',
    km: 960,
    income: 78000,
    expenses: [
      { key: 'fuel', icon: '\u26fd\ufe0f', amount: 3200 },
      { key: 'repair', icon: '\ud83c\udfd7', amount: 4000 },
      { key: 'food', icon: '\ud83c\udf7d', amount: 400 },
      { key: 'toll', icon: '\ud83c\udd7f\ufe0f', amount: 1000 },
      { key: 'platon', icon: '\ud83d\ude9b', amount: 1800 },
      { key: 'other', icon: '\ud83d\udce6', amount: 300 },
    ],
  },
  {
    from: '\u0415\u043a\u0430\u0442\u0435\u0440\u0438\u043d\u0431\u0443\u0440\u0433',
    to: '\u041c\u043e\u0441\u043a\u0432\u0430',
    date: '2026-03-25',
    km: 1780,
    income: 120000,
    expenses: [
      { key: 'fuel', icon: '\u26fd\ufe0f', amount: 5500 },
      { key: 'repair', icon: '\ud83c\udfd7', amount: 7000 },
      { key: 'food', icon: '\ud83c\udf7d', amount: 800 },
      { key: 'housing', icon: '\ud83c\udfe0', amount: 600 },
      { key: 'toll', icon: '\ud83c\udd7f\ufe0f', amount: 1500 },
      { key: 'platon', icon: '\ud83d\ude9b', amount: 4200 },
      { key: 'other', icon: '\ud83d\udce6', amount: 1000 },
    ],
  },
]

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

function TripsTab() {
  const totalIncome = TRIPS_DATA.reduce((s, t) => s + t.income, 0)
  const totalExpenses = TRIPS_DATA.reduce(
    (s, t) => s + t.expenses.reduce((es, e) => es + e.amount, 0),
    0
  )
  const totalKm = TRIPS_DATA.reduce((s, t) => s + t.km, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Mini cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <div style={miniCard}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
            {'\u0414\u043e\u0445\u043e\u0434'}
          </div>
          <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalIncome)} {'\u20bd'}
          </div>
        </div>
        <div style={miniCard}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
            {'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'}
          </div>
          <div style={{ color: '#ef4444', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalExpenses)} {'\u20bd'}
          </div>
        </div>
        <div style={miniCard}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
            {'\u041a\u041c'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalKm)}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
          {'\u0420\u0415\u0419\u0421\u042b'}
        </div>
        <button style={addBtn}>+ {'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}</button>
      </div>

      {/* Trip cards */}
      {TRIPS_DATA.map((trip, i) => {
        const expTotal = trip.expenses.reduce((s, e) => s + e.amount, 0)
        const net = trip.income - expTotal
        return (
          <div key={i} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600 }}>
                  {trip.from} {'\u2192'} {trip.to}
                </div>
                <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                  {trip.date} {'\u00b7'} {fmtFull(trip.km)} {'\u043a\u043c'}
                </div>
              </div>
              <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
                +{fmtFull(trip.income)} {'\u20bd'}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {trip.expenses.map((e, j) => (
                <div key={j} style={{ color: '#64748b', fontSize: '12px' }}>
                  {e.icon} {fmtFull(e.amount)}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #1e2a3f', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ color: '#64748b', fontSize: '13px' }}>
                {'\u0418\u0442\u043e\u0433\u043e \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432: '}{fmtFull(expTotal)} {'\u20bd'}
              </div>
              <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 700, fontFamily: 'monospace' }}>
                {'\u0427\u0438\u0441\u0442\u044b\u0435: '}{fmtFull(net)} {'\u20bd'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalcTab() {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Distance slider */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: '#64748b', fontSize: '13px' }}>{'\u0420\u0430\u0441\u0441\u0442\u043e\u044f\u043d\u0438\u0435'}</div>
          <div style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtFull(km)} {'\u043a\u043c'}</div>
        </div>
        <input
          type="range"
          min={100}
          max={3000}
          step={10}
          value={km}
          onChange={e => setKm(Number(e.target.value))}
          style={sliderStyle}
        />
      </div>

      {/* Rate slider */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: '#64748b', fontSize: '13px' }}>{'\u0421\u0442\u0430\u0432\u043a\u0430'}</div>
          <div style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtFull(rate)} {'\u20bd'}</div>
        </div>
        <input
          type="range"
          min={10000}
          max={300000}
          step={1000}
          value={rate}
          onChange={e => setRate(Number(e.target.value))}
          style={sliderStyle}
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
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>{item.label}</div>
            <div style={{ color: item.color, fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>
              {fmtFull(Math.round(item.value))} {'\u20bd'}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: '#64748b', fontSize: '14px' }}>{'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'}</div>
          <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(Math.round(calc.totalExp))} {'\u20bd'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ color: '#64748b', fontSize: '14px' }}>{'\u0421\u0442\u0430\u0432\u043a\u0430'}</div>
          <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(rate)} {'\u20bd'}
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e2a3f', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>{'\u041f\u0440\u0438\u0431\u044b\u043b\u044c'}</div>
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
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
            {'\u041c\u0438\u043d. \u0441\u0442\u0430\u0432\u043a\u0430 (+20% \u043c\u0430\u0440\u0436\u0438)'}
          </div>
          <div style={{ color: '#f59e0b', fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtFull(Math.round(calc.minRate))} {'\u20bd'}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
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

const card = {
  background: '#111827',
  border: '1px solid #1e2a3f',
  borderRadius: '12px',
  padding: '16px',
}

const miniCard = {
  background: '#111827',
  border: '1px solid #1e2a3f',
  borderRadius: '12px',
  padding: '12px',
  textAlign: 'center',
}

const addBtn = {
  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '6px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const sliderStyle = {
  width: '100%',
  accentColor: '#f59e0b',
}

export default function Trips() {
  const [tab, setTab] = useState('trips')

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      {/* Sub-tab switcher */}
      <div style={{
        display: 'flex',
        background: '#111827',
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '16px',
        border: '1px solid #1e2a3f',
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
              color: tab === t.key ? '#fff' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trips' ? <TripsTab /> : <CalcTab />}
    </div>
  )
}
