import React, { useState, useEffect, useRef } from 'react'

function getGreeting(name) {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return { text: `\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e, ${name}!`, icon: '\u2600\ufe0f' }
  if (h >= 12 && h < 17) return { text: `\u0414\u043e\u0431\u0440\u044b\u0439 \u0434\u0435\u043d\u044c, ${name}!`, icon: '\ud83d\udc4b' }
  if (h >= 17 && h < 22) return { text: `\u0414\u043e\u0431\u0440\u044b\u0439 \u0432\u0435\u0447\u0435\u0440, ${name}!`, icon: '\ud83c\udf05' }
  return { text: `\u0414\u043e\u0431\u0440\u043e\u0439 \u043d\u043e\u0447\u0438, ${name}!`, icon: '\ud83c\udf19' }
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

const expenses = [
  { label: '\u0422\u043e\u043f\u043b', value: 72000, color: '#f59e0b' },
  { label: '\u0420\u0435\u043c', value: 140000, color: '#ef4444' },
  { label: '\u0415\u0434\u0430', value: 12000, color: '#22c55e' },
  { label: '\u0416\u0438\u043b\u044c\u0451', value: 15000, color: '#3b82f6' },
  { label: '\u0414\u043e\u0440', value: 8200, color: '#a855f7' },
  { label: '\u041f\u0440\u043e\u0447', value: 7900, color: '#06b6d4' },
]

const maxExpense = Math.max(...expenses.map(e => e.value))

const reminders = [
  { icon: '\ud83d\udee2\ufe0f', text: '\u0417\u0430\u043c\u0435\u043d\u0430 \u043c\u0430\u0441\u043b\u0430', sub: '\u0447\u0435\u0440\u0435\u0437 3 700 \u043a\u043c' },
  { icon: '\ud83d\udcc4', text: '\u041e\u0421\u0410\u0413\u041e', sub: '294 \u0434\u043d' },
  { icon: '\ud83d\udd27', text: '\u0422\u041e', sub: '\u0447\u0435\u0440\u0435\u0437 7 700 \u043a\u043c' },
]

export default function Overview() {
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef(null)

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

  const greeting = getGreeting('\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c')

  const cardStyle = {
    background: '#111827',
    border: '1px solid #1e2a3f',
    borderRadius: '12px',
    padding: '16px',
  }

  const dimText = { color: '#64748b', fontSize: '13px' }

  return (
    <div style={{ background: '#0a0e1a', minHeight: '100vh', color: '#e2e8f0', padding: '16px', paddingBottom: '80px' }}>
      {/* Greeting */}
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        {greeting.icon} {greeting.text}
      </div>

      {/* Driving timer */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: '#64748b' }}>{'\u23f1\ufe0f'} {'\u0412\u0440\u0435\u043c\u044f \u0437\u0430 \u0440\u0443\u043b\u0451\u043c'}</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{'\u043c\u0430\u043a\u0441 9\u0447'}</span>
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
        <div style={{ marginTop: '8px', background: '#1e2a3f', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min((seconds / 32400) * 100, 100)}%`,
            height: '100%',
            background: seconds > 28800 ? '#ef4444' : '#f59e0b',
            transition: 'width 1s linear',
          }} />
        </div>
      </div>

      {/* Monthly summary */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcc5'} {'\u041c\u0430\u0440\u0442 2026'}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={dimText}>{'\u0414\u043e\u0445\u043e\u0434'}</div>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>263 000 ₽</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={dimText}>{'\u0420\u0430\u0441\u0445\u043e\u0434'}</div>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>253 104 ₽</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e2a3f', paddingTop: '8px', textAlign: 'center' }}>
          <div style={dimText}>{'\u0427\u0438\u0441\u0442\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c'}</div>
          <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>+9 896 ₽</div>
        </div>
      </div>

      {/* Mini cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        {[
          { label: '\u041f\u0440\u043e\u0431\u0435\u0433', value: '3 560', unit: '\u043a\u043c', icon: '\ud83d\udea3' },
          { label: '\u0420\u0430\u0441\u0445\u043e\u0434', value: '34.4', unit: '\u043b/100\u043a\u043c', icon: '\u26fd' },
          { label: '\u0420\u0435\u0439\u0441\u044b', value: '3', unit: '', icon: '\ud83d\ude9a' },
        ].map((item, i) => (
          <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>{item.icon}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>{item.value}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{item.unit}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Expenses chart */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udcca'} {'\u0420\u0430\u0441\u0445\u043e\u0434\u044b'}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '120px', gap: '8px' }}>
          {expenses.map((e, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
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
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{e.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reminders */}
      <div style={{ ...cardStyle }}>
        <div style={{ ...dimText, marginBottom: '12px' }}>{'\ud83d\udd14'} {'\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f'}</div>
        {reminders.map((r, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderTop: i > 0 ? '1px solid #1e2a3f' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>{r.icon}</span>
              <span style={{ fontSize: '14px' }}>{r.text}</span>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#f59e0b' }}>{r.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
