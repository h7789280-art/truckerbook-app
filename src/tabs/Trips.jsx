import { useState, useEffect, useCallback } from 'react'
import { fetchTrips, deleteTrip, getActiveTrailer, getTrailerHistory, pickUpTrailer, dropOffTrailer, deleteTrailer } from '../lib/api'
import { useTheme } from '../lib/theme'

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

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function TrailerBlock({ userId, theme }) {
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [trailerNumber, setTrailerNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const card = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '16px' }

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const [a, h] = await Promise.all([
        getActiveTrailer(userId),
        getTrailerHistory(userId, 5),
      ])
      setActive(a)
      setHistory(h)
    } catch (err) {
      console.error('Failed to load trailers:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const handlePickUp = async () => {
    if (!trailerNumber.trim()) return
    try {
      await pickUpTrailer(userId, null, trailerNumber.trim(), '', notes.trim())
      setTrailerNumber('')
      setNotes('')
      setShowModal(false)
      await load()
    } catch (err) {
      console.error('Failed to pick up trailer:', err)
    }
  }

  const handleDropOff = async () => {
    if (!active) return
    try {
      await dropOffTrailer(active.id)
      await load()
    } catch (err) {
      console.error('Failed to drop off trailer:', err)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteTrailer(id)
      setHistory((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('Failed to delete trailer:', err)
    }
  }

  if (loading) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {active ? (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: theme.text, fontSize: '16px', fontWeight: 600 }}>
                {'\ud83d\ude9b \u0422\u0440\u0435\u0439\u043b\u0435\u0440: '}{active.trailer_number}
              </div>
              <div style={{ color: theme.dim, fontSize: '13px', marginTop: '4px' }}>
                {'\u0417\u0430\u0431\u0440\u0430\u043d: '}{formatDateTime(active.picked_up_at)}
              </div>
            </div>
            <button
              onClick={handleDropOff}
              style={{
                background: '#ef4444',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              {'\u0421\u0434\u0430\u0442\u044c'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 600,
            padding: '14px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          {'\ud83d\ude9b \u0417\u0430\u0431\u0440\u0430\u0442\u044c \u0442\u0440\u0435\u0439\u043b\u0435\u0440'}
        </button>
      )}

      {/* History */}
      {history.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ color: theme.dim, fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {'\u0418\u0421\u0422\u041e\u0420\u0418\u042f'}
          </div>
          {history.map((t) => (
            <div key={t.id} style={{ ...card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: theme.text, fontSize: '14px' }}>
                {'\ud83d\ude9b '}{t.trailer_number}
                <span style={{ color: theme.dim, fontSize: '12px', marginLeft: '8px' }}>
                  {formatDateTime(t.picked_up_at)}{' \u2192 '}{formatDateTime(t.dropped_off_at)}
                </span>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  lineHeight: 1,
                }}
              >
                {'\u00d7'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: theme.dim, fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
          {'\u041d\u0435\u0442 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u0442\u0440\u0435\u0439\u043b\u0435\u0440\u043e\u0432'}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: theme.card,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '360px',
            border: '1px solid ' + theme.border,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ color: theme.text, fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              {'\ud83d\ude9b \u0417\u0430\u0431\u0440\u0430\u0442\u044c \u0442\u0440\u0435\u0439\u043b\u0435\u0440'}
            </div>
            <input
              type="text"
              placeholder={'\u041d\u043e\u043c\u0435\u0440 \u0442\u0440\u0435\u0439\u043b\u0435\u0440\u0430 *'}
              value={trailerNumber}
              onChange={e => setTrailerNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid ' + theme.border,
                background: theme.bg,
                color: theme.text,
                fontSize: '15px',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              placeholder={'\u0417\u0430\u043c\u0435\u0442\u043a\u0438'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid ' + theme.border,
                background: theme.bg,
                color: theme.text,
                fontSize: '15px',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: 'transparent',
                  color: theme.dim,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {'\u041e\u0442\u043c\u0435\u043d\u0430'}
              </button>
              <button
                onClick={handlePickUp}
                disabled={!trailerNumber.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: trailerNumber.trim() ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.border,
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: trailerNumber.trim() ? 'pointer' : 'default',
                }}
              >
                {'\u0417\u0430\u0431\u0440\u0430\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
      {/* Trailer block */}
      <TrailerBlock userId={userId} theme={theme} />

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

export default function Trips({ userId, refreshKey }) {
  const { theme } = useTheme()

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      <TripsTab userId={userId} refreshKey={refreshKey} theme={theme} />
    </div>
  )
}
