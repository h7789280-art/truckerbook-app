import { useState, useEffect, useCallback } from 'react'
import { fetchFuels, deleteFuel, fetchVehicleExpenses, deleteVehicleExpense } from '../lib/api'

const CATEGORIES = [
  { key: 'all', icon: '', label: '\u0412\u0441\u0435' },
  { key: 'fuel', icon: '\u26fd', label: '\u0422\u043e\u043f\u043b\u0438\u0432\u043e', color: '#f59e0b' },
  { key: 'def', icon: '\ud83d\udca7', label: 'DEF', color: '#06b6d4' },
  { key: 'oil', icon: '\ud83d\udee2', label: '\u041c\u0430\u0441\u043b\u043e', color: '#a855f7' },
  { key: 'parts', icon: '\ud83d\udd27', label: '\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438', color: '#ef4444' },
  { key: 'equipment', icon: '\ud83d\udce6', label: '\u041e\u0431\u043e\u0440\u0443\u0434.', color: '#3b82f6' },
  { key: 'supplies', icon: '\ud83e\udde4', label: '\u0420\u0430\u0441\u0445\u043e\u0434\u043d.', color: '#22c55e' },
  { key: 'hotel', icon: '\ud83c\udfe8', label: '\u041c\u043e\u0442\u0435\u043b\u044c', color: '#ec4899' },
  { key: 'toll', icon: '\ud83c\udd7f\ufe0f', label: '\u0414\u043e\u0440\u043e\u0433\u0438', color: '#8b5cf6' },
  { key: 'platon', icon: '\ud83d\ude9b', label: '\u041f\u043b\u0430\u0442\u043e\u043d', color: '#14b8a6' },
]

function getCat(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[1]
}

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

export default function Fuel({ userId, refreshKey }) {
  const [fuelEntries, setFuelEntries] = useState([])
  const [vehicleExpenses, setVehicleExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

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

  // Normalize all entries into a unified list
  const allEntries = [
    ...fuelEntries.map(e => ({
      id: e.id,
      source: 'fuel',
      category: 'fuel',
      name: e.station || '\u0417\u0430\u043f\u0440\u0430\u0432\u043a\u0430',
      subtitle: e.liters ? `${e.liters} \u043b \u00b7 ${formatNumber(e.odometer || 0)} \u043a\u043c` : '',
      date: e.date,
      amount: e.cost || 0,
    })),
    ...vehicleExpenses.map(e => ({
      id: e.id,
      source: 'vehicle_expense',
      category: e.category || 'other',
      name: e.description || getCat(e.category).label,
      subtitle: '',
      date: e.date,
      amount: e.amount || 0,
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  // Month filter
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEntries = allEntries.filter(e => e.date >= monthStart)

  // Totals by category for the month
  const totals = {}
  CATEGORIES.filter(c => c.key !== 'all').forEach(c => { totals[c.key] = 0 })
  monthEntries.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount })
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)
  const totalCount = monthEntries.length

  // Pie chart
  const pieData = CATEGORIES.filter(c => c.key !== 'all' && totals[c.key] > 0)
  let cumAngle = 0
  const slices = pieData.map(cat => {
    const fraction = grandTotal > 0 ? totals[cat.key] / grandTotal : 0
    const startAngle = cumAngle
    cumAngle += fraction * 360
    return { ...cat, fraction, startAngle, endAngle: cumAngle, total: totals[cat.key] }
  })

  // Filter list
  const filtered = filter === 'all' ? allEntries : allEntries.filter(e => e.category === filter)

  return (
    <div style={{ padding: '16px', minHeight: '100vh' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text, #e2e8f0)', margin: '0 0 16px 0' }}>
        {'\u0420\u0430\u0441\u0445\u043e\u0434\u044b \u043d\u0430 \u043c\u0430\u0448\u0438\u043d\u0443'}
      </h2>

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
            {'\u0417\u0410 \u041c\u0415\u0421\u042f\u0426'}
          </div>
          <div style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(Math.round(grandTotal))} {'\u20bd'}
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
            {'\u0417\u0410\u041f\u0418\u0421\u0415\u0419'}
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
              <div style={{ fontSize: '11px', color: 'var(--dim, #64748b)' }}>{'\u0418\u0442\u043e\u0433\u043e'}</div>
              <div style={{
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: 'var(--text, #e2e8f0)',
              }}>
                {grandTotal.toLocaleString('ru-RU')}{'\u20bd'}
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
                  {s.total.toLocaleString('ru-RU')}{'\u20bd'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          {'\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0435\u0439. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 + \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(entry => {
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
                  {formatNumber(Math.round(entry.amount))}{'\u20bd'}
                </div>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
