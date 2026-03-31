import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchBytExpenses, deleteBytExpense } from '../lib/api'
import { useLanguage, getCurrencySymbol } from '../lib/i18n'
import { exportToExcel, exportToPDF } from '../utils/export'

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

export default function Byt({ userId, refreshKey }) {
  const { t } = useLanguage()
  const cs = getCurrencySymbol()

  const CATEGORIES = useMemo(() => [
    { key: 'all', icon: '', label: t('byt.all') },
    { key: 'food', icon: '\ud83c\udf7d', label: t('byt.food'), color: '#f59e0b' },
    { key: 'shower', icon: '\ud83d\udebf', label: t('byt.shower'), color: '#06b6d4' },
    { key: 'laundry', icon: '\ud83e\uddfa', label: t('byt.laundry'), color: '#a855f7' },
    { key: 'personal', icon: '\ud83d\uded2', label: t('byt.personal'), color: '#3b82f6' },
    { key: 'other', icon: '\ud83d\udce6', label: t('byt.other'), color: '#22c55e' },
  ], [t])

  function getCat(key) {
    return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1]
  }

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const exportRef = useRef(null)
  const filterRef = useRef(null)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchBytExpenses(userId)
      setEntries(data)
    } catch (err) {
      console.error('Failed to load byt expenses:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleDelete = async (id) => {
    try {
      await deleteBytExpense(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete byt expense:', err)
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

  const handleExport = (format) => {
    setShowExportMenu(false)
    const columns = [
      { header: t('fuel.exportDate'), key: 'date' },
      { header: t('fuel.exportCategory'), key: 'category' },
      { header: t('fuel.exportDescription'), key: 'description' },
      { header: `${t('fuel.exportAmount')} (${cs})`, key: 'amount' },
    ]
    const rows = entries.map(e => {
      const cat = getCat(e.category)
      return {
        date: e.date || '',
        category: cat.label,
        description: e.name || '',
        amount: Math.round(e.amount || 0),
      }
    })
    const now2 = new Date()
    const ym = `${now2.getFullYear()}_${String(now2.getMonth() + 1).padStart(2, '0')}`
    if (format === 'excel') {
      exportToExcel(rows, columns, `personal_expenses_${ym}.xlsx`)
    } else {
      exportToPDF(rows, columns, t('byt.personalExpenses'), `personal_expenses_${ym}.pdf`)
    }
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.category === filter)

  // Totals by category (always from full data for pie chart)
  const totals = {}
  CATEGORIES.filter(c => c.key !== 'all').forEach(c => { totals[c.key] = 0 })
  entries.forEach(e => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0) })
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)

  // Pie chart data
  const pieData = CATEGORIES.filter(c => c.key !== 'all' && totals[c.key] > 0)
  let cumAngle = 0
  const slices = pieData.map(cat => {
    const fraction = grandTotal > 0 ? totals[cat.key] / grandTotal : 0
    const startAngle = cumAngle
    cumAngle += fraction * 360
    return { ...cat, fraction, startAngle, endAngle: cumAngle, total: totals[cat.key] }
  })

  return (
    <div style={{ padding: '16px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingRight: 44 }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text, #e2e8f0)', margin: 0 }}>
          {t('byt.personalExpenses')}
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
              <div style={{ fontSize: '11px', color: 'var(--dim, #64748b)' }}>{t('byt.total')}</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: 'var(--text, #e2e8f0)',
              }}>
                {grandTotal.toLocaleString('ru-RU')}{cs}
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
                  {s.total.toLocaleString('ru-RU')}{cs}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter dropdown */}
      <div ref={filterRef} style={{ position: 'relative', marginBottom: '16px' }}>
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
            {t('byt.categoryLabel')}: {(() => {
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

      {/* Expense list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          {t('byt.noEntries')}
        </div>
      ) : (
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
                    {entry.name || cat.label}
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
                  {isFree ? t('byt.free') : `${entry.amount.toLocaleString('ru-RU')}${cs}`}
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
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
