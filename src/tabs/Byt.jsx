import { useState } from 'react'

const CATEGORIES = [
  { key: 'all', icon: '', label: '\u0412\u0441\u0435' },
  { key: 'food', icon: '\ud83c\udf7d', label: '\u0415\u0434\u0430', color: '#f59e0b' },
  { key: 'hotel', icon: '\ud83c\udfe8', label: '\u041e\u0442\u0435\u043b\u044c', color: '#3b82f6' },
  { key: 'shower', icon: '\ud83d\udebf', label: '\u0414\u0443\u0448', color: '#06b6d4' },
  { key: 'laundry', icon: '\ud83e\uddfa', label: '\u0421\u0442\u0438\u0440\u043a\u0430', color: '#a855f7' },
  { key: 'supplies', icon: '\ud83d\udd27', label: '\u0420\u0430\u0441\u0445\u043e\u0434\u043d\u0438\u043a\u0438', color: '#ef4444' },
  { key: 'other', icon: '\ud83d\udce6', label: '\u041f\u0440\u043e\u0447\u0435\u0435', color: '#22c55e' },
]

const DEMO_DATA = [
  { id: 1, category: 'food', name: '\u041a\u0430\u0444\u0435 \u00ab\u0414\u0430\u043b\u044c\u043d\u043e\u0431\u043e\u0439\u00bb', amount: 450, date: '2026-03-21' },
  { id: 2, category: 'food', name: '\u041c\u0430\u0433\u043d\u0438\u0442 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u044b', amount: 820, date: '2026-03-22' },
  { id: 3, category: 'food', name: '\u0421\u0442\u043e\u043b\u043e\u0432\u0430\u044f \u041a\u0430\u0437\u0430\u043d\u044c', amount: 380, date: '2026-03-20' },
  { id: 4, category: 'hotel', name: '\u041c\u043e\u0442\u0435\u043b\u044c \u041c7', amount: 1500, date: '2026-03-21' },
  { id: 5, category: 'hotel', name: '\u0425\u043e\u0441\u0442\u0435\u043b \u0415\u043a\u0431', amount: 800, date: '2026-03-24' },
  { id: 6, category: 'shower', name: 'Shell \u041d.\u041d\u043e\u0432\u0433\u043e\u0440\u043e\u0434', amount: 0, date: '2026-03-17' },
  { id: 7, category: 'shower', name: '\u0421\u0442\u043e\u044f\u043d\u043a\u0430 \u0427\u0435\u0431\u043e\u043a\u0441\u0430\u0440\u044b', amount: 200, date: '2026-03-18' },
  { id: 8, category: 'shower', name: '\u041c\u043e\u0442\u0435\u043b\u044c \u041c7', amount: 0, date: '2026-03-21' },
  { id: 9, category: 'laundry', name: '\u041f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f \u041a\u0430\u0437\u0430\u043d\u044c', amount: 600, date: '2026-03-21' },
  { id: 10, category: 'laundry', name: '\u0421\u0430\u043c\u043e\u043e\u0431\u0441\u043b\u0443\u0436. \u0415\u043a\u0431', amount: 400, date: '2026-03-24' },
  { id: 11, category: 'supplies', name: '\u041f\u0435\u0440\u0447\u0430\u0442\u043a\u0438 \u04453', amount: 450, date: '2026-03-15' },
  { id: 12, category: 'supplies', name: '\u041d\u0435\u0437\u0430\u043c\u0435\u0440\u0437\u0430\u0439\u043a\u0430 5\u043b', amount: 380, date: '2026-03-12' },
  { id: 13, category: 'supplies', name: '\u0422\u0440\u044f\u043f\u043a\u0438 \u0441\u043a\u043e\u0442\u0447', amount: 290, date: '2026-03-10' },
  { id: 14, category: 'supplies', name: 'WD-40', amount: 520, date: '2026-03-08' },
  { id: 15, category: 'other', name: '\u0422\u0435\u0440\u043c\u043e\u0441 \u043d\u043e\u0432\u044b\u0439', amount: 1800, date: '2026-03-14' },
  { id: 16, category: 'other', name: '\u0417\u0430\u0440\u044f\u0434\u043a\u0430 USB-C', amount: 650, date: '2026-03-20' },
]

function getCat(key) {
  return CATEGORIES.find(c => c.key === key)
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Byt() {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? DEMO_DATA : DEMO_DATA.filter(e => e.category === filter)

  // Totals by category (always from full data for pie chart)
  const totals = {}
  CATEGORIES.filter(c => c.key !== 'all').forEach(c => { totals[c.key] = 0 })
  DEMO_DATA.forEach(e => { totals[e.category] += e.amount })
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)

  // Pie chart data
  const pieData = CATEGORIES.filter(c => c.key !== 'all' && totals[c.key] > 0)
  let cumAngle = 0
  const slices = pieData.map(cat => {
    const fraction = totals[cat.key] / grandTotal
    const startAngle = cumAngle
    cumAngle += fraction * 360
    return { ...cat, fraction, startAngle, endAngle: cumAngle, total: totals[cat.key] }
  })

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

  return (
    <div style={{ padding: '16px', minHeight: '100vh' }}>
      {/* Pie chart + legend */}
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
        {/* SVG Pie */}
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
            <div style={{ fontSize: '11px', color: 'var(--dim, #64748b)' }}>{'\u0418\u0442\u043e\u0433\u043e'}</div>
            <div style={{
              fontSize: '18px',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: 'var(--text, #e2e8f0)',
            }}>
              {grandTotal.toLocaleString('ru-RU')}{'\u20bd'}
            </div>
          </div>
        </div>

        {/* Legend */}
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
                {s.total.toLocaleString('ru-RU')}{'\u20bd'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px',
        marginBottom: '16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {CATEGORIES.map(cat => {
          const active = filter === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setFilter(cat.key)}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                background: active
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : 'var(--card, #111827)',
                color: active ? '#000' : 'var(--dim, #64748b)',
                transition: 'all 0.2s',
              }}
            >
              {cat.icon ? `${cat.icon} ${cat.label}` : cat.label}
            </button>
          )
        })}
      </div>

      {/* Expense list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(entry => {
          const cat = getCat(entry.category)
          const isFree = entry.amount === 0
          return (
            <div
              key={entry.id}
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
                </div>
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '15px',
                fontWeight: 700,
                color: isFree ? '#22c55e' : 'var(--text, #e2e8f0)',
                flexShrink: 0,
              }}>
                {isFree ? '\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e' : `${entry.amount.toLocaleString('ru-RU')}\u20bd`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
