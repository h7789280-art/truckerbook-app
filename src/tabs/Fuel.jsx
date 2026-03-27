import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFuels, deleteFuel } from '../lib/api'

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SwipeRow({ children, onDelete }) {
  const rowRef = useRef(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const swiping = useRef(false)
  const longPressTimer = useRef(null)
  const [offset, setOffset] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    swiping.current = false
    longPressTimer.current = setTimeout(() => {
      setShowConfirm(true)
    }, 600)
  }

  const handleTouchMove = (e) => {
    clearTimeout(longPressTimer.current)
    const diff = e.touches[0].clientX - startX.current
    if (diff < -10) {
      swiping.current = true
      currentX.current = Math.max(diff, -90)
      setOffset(currentX.current)
    }
  }

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current)
    if (offset < -50) {
      setShowConfirm(true)
    }
    setOffset(0)
  }

  if (showConfirm) {
    return (
      <div style={{
        backgroundColor: '#111827',
        borderRadius: '12px',
        padding: '14px',
        border: '1px solid #ef4444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 14 }}>{'\u0423\u0434\u0430\u043b\u0438\u0442\u044c?'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowConfirm(false)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid #1e2a3f', background: '#1a2235',
              color: '#e2e8f0', fontSize: 13, cursor: 'pointer',
            }}
          >{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
          <button
            onClick={onDelete}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: 'none', background: '#ef4444',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >{'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}</button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rowRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${offset}px)`,
        transition: offset === 0 ? 'transform 0.2s' : 'none',
      }}
    >
      {children}
    </div>
  )
}

export default function Fuel({ userId, refreshKey }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchFuels(userId)
      setEntries(data)
    } catch (err) {
      console.error('Failed to load fuels:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleDelete = async (id) => {
    try {
      await deleteFuel(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to delete fuel:', err)
    }
  }

  // Monthly totals
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEntries = entries.filter((e) => e.date >= monthStart)
  const totalMonth = monthEntries.reduce((s, e) => s + (e.cost || 0), 0)
  const totalLiters = monthEntries.reduce((s, e) => s + (e.liters || 0), 0)

  return (
    <div style={{ padding: '16px', minHeight: '100vh', backgroundColor: '#0a0e1a' }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <div
          style={{
            flex: 1,
            backgroundColor: '#111827',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #1e2a3f',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {'\u0422\u041e\u041f\u041b\u0418\u0412\u041e/\u041c\u0415\u0421'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(Math.round(totalMonth))} {'\u20bd'}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: '#111827',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #1e2a3f',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
            {'\u041b\u0418\u0422\u0420\u041e\u0412'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatNumber(Math.round(totalLiters))}
          </div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>
          {'\u0417\u0410\u041f\u0420\u0410\u0412\u041a\u0418'}
        </div>
      </div>

      {/* Fuel entries */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          {'\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u043f\u0440\u0430\u0432\u043e\u043a. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 + \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0435\u0440\u0432\u0443\u044e'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {entries.map((item) => {
            const perLiter = item.liters > 0 ? (item.cost / item.liters).toFixed(1) : 0
            return (
              <SwipeRow key={item.id} onDelete={() => handleDelete(item.id)}>
                <div
                  style={{
                    backgroundColor: '#111827',
                    borderRadius: '12px',
                    padding: '14px',
                    border: '1px solid #1e2a3f',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      backgroundColor: '#1a2235',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      flexShrink: 0,
                    }}
                  >
                    {'\u26fd\ufe0f'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 600 }}>
                      {item.station || '\u0417\u0430\u043f\u0440\u0430\u0432\u043a\u0430'}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                      {formatDate(item.date)} · {item.liters} {'\u043b'} · {formatNumber(item.odometer || 0)} {'\u043a\u043c'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#f59e0b', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatNumber(Math.round(item.cost || 0))} {'\u20bd'}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                      {perLiter} {'\u20bd/\u043b'}
                    </div>
                  </div>
                </div>
              </SwipeRow>
            )
          })}
        </div>
      )}
    </div>
  )
}
