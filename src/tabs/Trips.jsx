import { useState, useEffect, useCallback } from 'react'
import { fetchTrips, deleteTrip, getActiveTrailer, getTrailerHistory, pickUpTrailer, dropOffTrailer, deleteTrailer, uploadTrailerPhoto } from '../lib/api'
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

function PhotoPicker({ photos, setPhotos, theme, maxPhotos = 5 }) {
  const cameraRef = { current: null }
  const galleryRef = { current: null }

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = maxPhotos - photos.length
    const toAdd = files.slice(0, remaining).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPhotos(prev => [...prev, ...toAdd])
    e.target.value = ''
  }

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const removed = prev[idx]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const inputStyle = { display: 'none' }
  const btnStyle = {
    flex: 1,
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '13px',
    fontWeight: 600,
    cursor: photos.length >= maxPhotos ? 'default' : 'pointer',
    opacity: photos.length >= maxPhotos ? 0.4 : 1,
    textAlign: 'center',
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: theme.dim, fontSize: '12px', marginBottom: '8px' }}>
        {'\u0424\u043e\u0442\u043e (' + photos.length + '/' + maxPhotos + ')'}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          ref={r => cameraRef.current = r}
          type="file"
          accept="image/*"
          capture="environment"
          style={inputStyle}
          onChange={handleFiles}
        />
        <input
          ref={r => galleryRef.current = r}
          type="file"
          accept="image/*"
          multiple
          style={inputStyle}
          onChange={handleFiles}
        />
        <button
          type="button"
          style={btnStyle}
          onClick={() => photos.length < maxPhotos && cameraRef.current?.click()}
        >
          {'\ud83d\udcf7 \u0421\u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0440\u043e\u0432\u0430\u0442\u044c'}
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => photos.length < maxPhotos && galleryRef.current?.click()}
        >
          {'\ud83d\uddbc\ufe0f \u0418\u0437 \u0433\u0430\u043b\u0435\u0440\u0435\u0438'}
        </button>
      </div>
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative', width: '60px', height: '60px' }}>
              <img
                src={p.preview}
                alt=""
                style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid ' + theme.border }}
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: '#ef4444', border: 'none', color: '#fff',
                  fontSize: '12px', lineHeight: '20px', textAlign: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {'\u00d7'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrailerBlock({ userId, theme }) {
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showDropOffModal, setShowDropOffModal] = useState(false)
  const [trailerNumber, setTrailerNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [pickupPhotos, setPickupPhotos] = useState([])
  const [dropoffPhotos, setDropoffPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

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

  const uploadPhotos = async (trailerId, photoItems) => {
    const urls = []
    for (const item of photoItems) {
      const url = await uploadTrailerPhoto(userId, trailerId, item.file)
      urls.push(url)
    }
    return urls
  }

  const handlePickUp = async () => {
    if (!trailerNumber.trim()) return
    try {
      setUploading(true)
      const tempId = Date.now().toString()
      let photoUrls = []
      if (pickupPhotos.length > 0) {
        photoUrls = await uploadPhotos(tempId, pickupPhotos)
      }
      await pickUpTrailer(userId, null, trailerNumber.trim(), '', notes.trim(), photoUrls)
      pickupPhotos.forEach(p => p.preview && URL.revokeObjectURL(p.preview))
      setTrailerNumber('')
      setNotes('')
      setPickupPhotos([])
      setShowModal(false)
      await load()
    } catch (err) {
      console.error('Failed to pick up trailer:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDropOff = async () => {
    if (!active) return
    try {
      setUploading(true)
      let photoUrls = []
      if (dropoffPhotos.length > 0) {
        photoUrls = await uploadPhotos(active.id, dropoffPhotos)
      }
      await dropOffTrailer(active.id, photoUrls)
      dropoffPhotos.forEach(p => p.preview && URL.revokeObjectURL(p.preview))
      setDropoffPhotos([])
      setShowDropOffModal(false)
      await load()
    } catch (err) {
      console.error('Failed to drop off trailer:', err)
    } finally {
      setUploading(false)
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

  const modalOverlay = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  }

  const modalBox = {
    background: theme.card,
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '360px',
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid ' + theme.border,
  }

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '15px',
    marginBottom: '10px',
    boxSizing: 'border-box',
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
                {active.photos && active.photos.length > 0 && (
                  <span style={{ marginLeft: '8px' }}>{'\ud83d\udcf7 ' + active.photos.length}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowDropOffModal(true)}
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
          {history.map((t) => {
            const photoCount = (t.photos && t.photos.length) || 0
            const isExpanded = expandedId === t.id
            return (
              <div key={t.id} style={{ ...card, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div
                    style={{ color: theme.text, fontSize: '14px', cursor: photoCount > 0 ? 'pointer' : 'default', flex: 1 }}
                    onClick={() => photoCount > 0 && setExpandedId(isExpanded ? null : t.id)}
                  >
                    {'\ud83d\ude9b '}{t.trailer_number}
                    {photoCount > 0 && (
                      <span style={{ color: '#f59e0b', fontSize: '12px', marginLeft: '6px' }}>
                        {'\ud83d\udcf7 ' + photoCount}
                      </span>
                    )}
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
                {isExpanded && photoCount > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid ' + theme.border }}>
                    {t.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt=""
                          style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '1px solid ' + theme.border }}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ color: theme.dim, fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
          {'\u041d\u0435\u0442 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u0442\u0440\u0435\u0439\u043b\u0435\u0440\u043e\u0432'}
        </div>
      )}

      {/* Pick Up Modal */}
      {showModal && (
        <div style={modalOverlay} onClick={() => { if (!uploading) { setShowModal(false); setPickupPhotos([]); } }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ color: theme.text, fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              {'\ud83d\ude9b \u0417\u0430\u0431\u0440\u0430\u0442\u044c \u0442\u0440\u0435\u0439\u043b\u0435\u0440'}
            </div>
            <input
              type="text"
              placeholder={'\u041d\u043e\u043c\u0435\u0440 \u0442\u0440\u0435\u0439\u043b\u0435\u0440\u0430 *'}
              value={trailerNumber}
              onChange={e => setTrailerNumber(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder={'\u0417\u0430\u043c\u0435\u0442\u043a\u0438'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={inputStyle}
            />
            <PhotoPicker photos={pickupPhotos} setPhotos={setPickupPhotos} theme={theme} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowModal(false); setPickupPhotos([]) }}
                disabled={uploading}
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
                disabled={!trailerNumber.trim() || uploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: trailerNumber.trim() && !uploading ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.border,
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: trailerNumber.trim() && !uploading ? 'pointer' : 'default',
                }}
              >
                {uploading ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...' : '\u0417\u0430\u0431\u0440\u0430\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop Off Modal */}
      {showDropOffModal && (
        <div style={modalOverlay} onClick={() => { if (!uploading) { setShowDropOffModal(false); setDropoffPhotos([]) } }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ color: theme.text, fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              {'\ud83d\ude9b \u0421\u0434\u0430\u0442\u044c \u0442\u0440\u0435\u0439\u043b\u0435\u0440'}
            </div>
            <div style={{ color: theme.dim, fontSize: '14px', marginBottom: '16px' }}>
              {'\u0422\u0440\u0435\u0439\u043b\u0435\u0440: '}<span style={{ color: theme.text, fontWeight: 600 }}>{active?.trailer_number}</span>
            </div>
            <PhotoPicker photos={dropoffPhotos} setPhotos={setDropoffPhotos} theme={theme} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowDropOffModal(false); setDropoffPhotos([]) }}
                disabled={uploading}
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
                onClick={handleDropOff}
                disabled={uploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: uploading ? theme.border : '#ef4444',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: uploading ? 'default' : 'pointer',
                }}
              >
                {uploading ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...' : '\u0421\u0434\u0430\u0442\u044c'}
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
