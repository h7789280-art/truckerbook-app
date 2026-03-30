import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchTrips, deleteTrip, getActiveTrailer, getTrailerHistory, pickUpTrailer, dropOffTrailer, deleteTrailer, uploadTrailerPhoto, fetchFuels } from '../lib/api'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { exportToExcel, exportToPDF } from '../utils/export'

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
  const { t } = useLanguage()
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
        {t('trips.photo') + ' (' + photos.length + '/' + maxPhotos + ')'}
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
          {'\ud83d\udcf7 ' + t('trips.takePhoto')}
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => photos.length < maxPhotos && galleryRef.current?.click()}
        >
          {'\ud83d\uddbc\ufe0f ' + t('trips.fromGallery')}
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
  const { t } = useLanguage()
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
                {'\ud83d\ude9b ' + t('trips.trailer') + ': '}{active.trailer_number}
              </div>
              <div style={{ color: theme.dim, fontSize: '13px', marginTop: '4px' }}>
                {t('trips.pickedUp') + ': '}{formatDateTime(active.picked_up_at)}
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
              {t('trips.dropOff')}
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
          {'\ud83d\ude9b ' + t('trips.pickUpTrailer')}
        </button>
      )}

      {/* History */}
      {history.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ color: theme.dim, fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {t('trips.history')}
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
          {t('trips.noTrailerHistory')}
        </div>
      )}

      {/* Pick Up Modal */}
      {showModal && (
        <div style={modalOverlay} onClick={() => { if (!uploading) { setShowModal(false); setPickupPhotos([]); } }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ color: theme.text, fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              {'\ud83d\ude9b ' + t('trips.pickUpTrailer')}
            </div>
            <input
              type="text"
              placeholder={t('trips.trailerNumber')}
              value={trailerNumber}
              onChange={e => setTrailerNumber(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder={t('trips.notes')}
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
                {t('common.cancel')}
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
                {uploading ? t('trips.uploading') : t('trips.pickUp')}
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
              {'\ud83d\ude9b ' + t('trips.dropOffTrailer')}
            </div>
            <div style={{ color: theme.dim, fontSize: '14px', marginBottom: '16px' }}>
              {t('trips.trailer') + ': '}<span style={{ color: theme.text, fontWeight: 600 }}>{active?.trailer_number}</span>
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
                {t('common.cancel')}
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
                {uploading ? t('trips.uploading') : t('trips.dropOff')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TripsTab({ userId, refreshKey, theme }) {
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef(null)

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

  const handleExport = (format) => {
    setShowExportMenu(false)
    const distLabel = unitSys === 'imperial' ? 'mi' : t('trips.km')
    const columns = [
      { header: t('fuel.exportDate'), key: 'date' },
      { header: t('trips.from'), key: 'from' },
      { header: t('trips.to'), key: 'to' },
      { header: `${t('trips.distance')} (${distLabel})`, key: 'distance' },
      { header: `${t('trips.income')} (${cs})`, key: 'income' },
    ]
    const rows = entries.map(e => ({
      date: formatDate(e.created_at),
      from: e.origin || '',
      to: e.destination || '',
      distance: e.distance_km || 0,
      income: e.income || 0,
    }))
    const now2 = new Date()
    const ym = `${now2.getFullYear()}_${String(now2.getMonth() + 1).padStart(2, '0')}`
    if (format === 'excel') {
      exportToExcel(rows, columns, `trips_report_${ym}.xlsx`)
    } else {
      exportToPDF(rows, columns, t('trips.tripsHeader'), `trips_report_${ym}.pdf`)
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
            {t('trips.income')}
          </div>
          <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalIncome)} {cs}
          </div>
        </div>
        <div style={miniCard}>
          <div style={{ color: theme.dim, fontSize: '11px', marginBottom: '4px' }}>
            {t('trips.kmLabel')}
          </div>
          <div style={{ color: theme.text, fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(totalKm)}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: theme.dim, fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
          {t('trips.tripsHeader')}
        </div>
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid ' + theme.border,
              background: theme.card,
              color: theme.text,
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
              background: theme.card,
              border: '1px solid ' + theme.border,
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
                  color: theme.text,
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
                  borderTop: '1px solid ' + theme.border,
                  background: 'transparent',
                  color: theme.text,
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

      {/* Trip cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
          {t('trips.noTrips')}
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
                  {formatDate(trip.created_at)} {'\u00b7'} {fmtFull(trip.distance_km || 0)} {t('trips.km')}
                </div>
              </div>
              <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
                +{fmtFull(trip.income || 0)} {cs}
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
                {t('trips.delete')}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function IFTATab({ userId, theme }) {
  const { t } = useLanguage()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [fuelData, setFuelData] = useState([])
  const [loading, setLoading] = useState(true)
  const [stateMiles, setStateMiles] = useState({})
  const [taxRates, setTaxRates] = useState({})
  const DEFAULT_TAX_RATE = 0.55

  const storageKey = 'ifta_' + userId + '_' + year + '_Q' + quarter

  // Load saved miles from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setStateMiles(parsed.miles || {})
        setTaxRates(parsed.rates || {})
      } else {
        setStateMiles({})
        setTaxRates({})
      }
    } catch { setStateMiles({}); setTaxRates({}) }
  }, [storageKey])

  // Save to localStorage on change
  useEffect(() => {
    if (Object.keys(stateMiles).length > 0 || Object.keys(taxRates).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify({ miles: stateMiles, rates: taxRates }))
    }
  }, [stateMiles, taxRates, storageKey])

  // Load fuel entries
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    fetchFuels(userId).then(data => {
      setFuelData(data || [])
    }).catch(err => {
      console.error('IFTA fuel load error:', err)
    }).finally(() => setLoading(false))
  }, [userId])

  // Filter fuel entries for selected quarter
  const quarterStart = new Date(year, (quarter - 1) * 3, 1)
  const quarterEnd = new Date(year, quarter * 3, 1)

  const quarterFuels = useMemo(() => {
    return fuelData.filter(f => {
      if (!f.date || !f.state) return false
      const d = new Date(f.date)
      return d >= quarterStart && d < quarterEnd
    })
  }, [fuelData, year, quarter])

  // Group gallons by state
  const gallonsByState = useMemo(() => {
    const map = {}
    quarterFuels.forEach(f => {
      const st = (f.state || '').toUpperCase()
      if (!st) return
      // liters -> gallons (1 gallon = 3.78541 liters)
      const gallons = (f.liters || 0) / 3.78541
      map[st] = (map[st] || 0) + gallons
    })
    return map
  }, [quarterFuels])

  // Collect all states (from fuel + from manually entered miles)
  const allStates = useMemo(() => {
    const set = new Set()
    Object.keys(gallonsByState).forEach(s => set.add(s))
    Object.keys(stateMiles).forEach(s => { if (stateMiles[s]) set.add(s) })
    const arr = Array.from(set)
    arr.sort()
    return arr
  }, [gallonsByState, stateMiles])

  const totalGallons = allStates.reduce((s, st) => s + (gallonsByState[st] || 0), 0)
  const totalMiles = allStates.reduce((s, st) => s + (parseFloat(stateMiles[st]) || 0), 0)
  const overallMpg = totalGallons > 0 ? totalMiles / totalGallons : 0

  const [addStateInput, setAddStateInput] = useState('')

  const handleAddState = () => {
    const st = addStateInput.trim().toUpperCase()
    if (st && st.length === 2 && !stateMiles[st]) {
      setStateMiles(prev => ({ ...prev, [st]: '' }))
      setAddStateInput('')
    }
  }

  const card = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '16px' }
  const inputStyle = {
    width: '70px',
    padding: '6px 8px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '13px',
    fontFamily: 'monospace',
    textAlign: 'right',
    boxSizing: 'border-box',
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Quarter selector */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: '1px solid ' + theme.border,
              background: theme.bg, color: theme.text, fontSize: '14px', fontWeight: 600,
            }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
            {[1, 2, 3, 4].map(q => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: q === quarter ? '2px solid #f59e0b' : '1px solid ' + theme.border,
                  background: q === quarter ? '#f59e0b22' : 'transparent',
                  color: q === quarter ? '#f59e0b' : theme.dim,
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>
        <div style={{ color: theme.dim, fontSize: '12px' }}>
          {['Jan\u2013Mar', 'Apr\u2013Jun', 'Jul\u2013Sep', 'Oct\u2013Dec'][quarter - 1]} {year}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {[
          { label: t('trips.totalGallons'), value: totalGallons.toFixed(1), color: theme.text },
          { label: t('trips.totalMiles'), value: totalMiles.toLocaleString('en-US'), color: theme.text },
          { label: t('trips.avgMpg'), value: overallMpg > 0 ? overallMpg.toFixed(2) : '\u2014', color: '#3b82f6' },
        ].map((item, i) => (
          <div key={i} style={{ background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
            <div style={{ color: theme.dim, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
            <div style={{ color: item.color, fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* IFTA Table */}
      <div style={{ ...card, padding: '12px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: theme.dim, fontSize: 14 }}>{t('common.loading')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid ' + theme.border }}>
                {[t('trips.state'), t('trips.gallons'), t('trips.miles'), t('trips.taxRate'), t('trips.taxOwed')].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 6px', textAlign: i === 0 ? 'left' : 'right',
                    color: theme.dim, fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allStates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: theme.dim }}>
                    {t('trips.noFuelData')}
                  </td>
                </tr>
              ) : allStates.map(st => {
                const gallons = gallonsByState[st] || 0
                const miles = parseFloat(stateMiles[st]) || 0
                const rate = parseFloat(taxRates[st]) || DEFAULT_TAX_RATE
                const taxableGallons = overallMpg > 0 ? miles / overallMpg : 0
                const taxOwed = (taxableGallons - gallons) * rate
                return (
                  <tr key={st} style={{ borderBottom: '1px solid ' + theme.border }}>
                    <td style={{ padding: '10px 6px', color: theme.text, fontWeight: 700 }}>{st}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: theme.text }}>{gallons.toFixed(1)}</td>
                    <td style={{ padding: '10px 2px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={stateMiles[st] || ''}
                        onChange={e => setStateMiles(prev => ({ ...prev, [st]: e.target.value }))}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '10px 2px', textAlign: 'right' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={taxRates[st] !== undefined ? taxRates[st] : ''}
                        onChange={e => setTaxRates(prev => ({ ...prev, [st]: e.target.value }))}
                        placeholder={DEFAULT_TAX_RATE.toFixed(2)}
                        style={{ ...inputStyle, width: '60px' }}
                      />
                    </td>
                    <td style={{
                      padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                      color: miles === 0 ? theme.dim : taxOwed < 0 ? '#22c55e' : taxOwed > 0 ? '#ef4444' : theme.text,
                    }}>
                      {miles === 0 ? '\u2014' : (taxOwed >= 0 ? '' : '-') + '$' + Math.abs(taxOwed).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
              {allStates.length > 0 && (
                <tr style={{ borderTop: '2px solid ' + theme.border }}>
                  <td style={{ padding: '10px 6px', color: '#f59e0b', fontWeight: 700 }}>TOTAL</td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700 }}>
                    {totalGallons.toFixed(1)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700 }}>
                    {totalMiles.toLocaleString('en-US')}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: theme.dim }}>
                    {overallMpg > 0 ? overallMpg.toFixed(2) + ' mpg' : '\u2014'}
                  </td>
                  <td style={{
                    padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                    color: (() => {
                      const total = allStates.reduce((s, st) => {
                        const miles = parseFloat(stateMiles[st]) || 0
                        if (miles === 0) return s
                        const g = gallonsByState[st] || 0
                        const r = parseFloat(taxRates[st]) || DEFAULT_TAX_RATE
                        const tg = overallMpg > 0 ? miles / overallMpg : 0
                        return s + (tg - g) * r
                      }, 0)
                      return total < 0 ? '#22c55e' : total > 0 ? '#ef4444' : theme.text
                    })(),
                  }}>
                    {(() => {
                      const total = allStates.reduce((s, st) => {
                        const miles = parseFloat(stateMiles[st]) || 0
                        if (miles === 0) return s
                        const g = gallonsByState[st] || 0
                        const r = parseFloat(taxRates[st]) || DEFAULT_TAX_RATE
                        const tg = overallMpg > 0 ? miles / overallMpg : 0
                        return s + (tg - g) * r
                      }, 0)
                      return (total >= 0 ? '' : '-') + '$' + Math.abs(total).toFixed(2)
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add state */}
      <div style={{ ...card, display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          maxLength={2}
          value={addStateInput}
          onChange={e => setAddStateInput(e.target.value.toUpperCase())}
          placeholder="e.g. TX"
          style={{
            flex: 1, padding: '10px 12px', borderRadius: '10px',
            border: '1px solid ' + theme.border, background: theme.bg,
            color: theme.text, fontSize: '14px', textTransform: 'uppercase',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleAddState}
          disabled={!addStateInput.trim() || addStateInput.trim().length !== 2}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: addStateInput.trim().length === 2 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : theme.border,
            color: '#fff', fontSize: '14px', fontWeight: 600, cursor: addStateInput.trim().length === 2 ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
          }}
        >
          {t('trips.addStateMiles')}
        </button>
      </div>

      {/* Export IFTA */}
      {allStates.length > 0 && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {['excel', 'pdf'].map(fmt => (
            <button
              key={fmt}
              onClick={() => {
                const columns = [
                  { header: t('trips.state'), key: 'state' },
                  { header: t('trips.gallons'), key: 'gallons' },
                  { header: t('trips.miles'), key: 'miles' },
                  { header: t('trips.taxRate'), key: 'taxRate' },
                  { header: t('trips.taxableGallons'), key: 'taxableGallons' },
                  { header: t('trips.taxOwed'), key: 'taxOwed' },
                ]
                const rows = allStates.map(st => {
                  const gallons = gallonsByState[st] || 0
                  const miles = parseFloat(stateMiles[st]) || 0
                  const rate = parseFloat(taxRates[st]) || DEFAULT_TAX_RATE
                  const taxableGal = overallMpg > 0 ? miles / overallMpg : 0
                  const taxO = (taxableGal - gallons) * rate
                  return {
                    state: st,
                    gallons: gallons.toFixed(1),
                    miles: miles.toLocaleString('en-US'),
                    taxRate: '$' + rate.toFixed(2),
                    taxableGallons: taxableGal.toFixed(1),
                    taxOwed: (taxO >= 0 ? '' : '-') + '$' + Math.abs(taxO).toFixed(2),
                  }
                })
                const totalTax = allStates.reduce((s, st) => {
                  const miles = parseFloat(stateMiles[st]) || 0
                  if (miles === 0) return s
                  const g = gallonsByState[st] || 0
                  const r = parseFloat(taxRates[st]) || DEFAULT_TAX_RATE
                  const tg = overallMpg > 0 ? miles / overallMpg : 0
                  return s + (tg - g) * r
                }, 0)
                rows.push({
                  state: 'TOTAL',
                  gallons: totalGallons.toFixed(1),
                  miles: totalMiles.toLocaleString('en-US'),
                  taxRate: overallMpg > 0 ? overallMpg.toFixed(2) + ' mpg' : '\u2014',
                  taxableGallons: '',
                  taxOwed: (totalTax >= 0 ? '' : '-') + '$' + Math.abs(totalTax).toFixed(2),
                })
                const title = t('trips.iftaReportTitle') + ' Q' + quarter + ' ' + year
                const fn = `ifta_report_${year}_Q${quarter}`
                if (fmt === 'excel') {
                  exportToExcel(rows, columns, fn + '.xlsx')
                } else {
                  exportToPDF(rows, columns, title, fn + '.pdf')
                }
              }}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid ' + theme.border,
                background: theme.card, color: theme.text, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {'\uD83D\uDCE5 ' + t('trips.exportIfta') + ' ' + fmt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Trips({ userId, refreshKey, profile }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const showIfta = profile?.hos_mode === 'usa' || profile?.units === 'imperial'
  const [subTab, setSubTab] = useState('trips')

  const tabBtn = (key) => ({
    flex: 1,
    padding: '10px 4px',
    borderRadius: '10px',
    border: subTab === key ? '2px solid #f59e0b' : '1px solid ' + theme.border,
    background: subTab === key ? '#f59e0b22' : 'transparent',
    color: subTab === key ? '#f59e0b' : theme.dim,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
  })

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      {showIfta && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <button onClick={() => setSubTab('trips')} style={tabBtn('trips', null)}>
            {'\ud83d\ude9a ' + t('trips.tripsSubTab')}
          </button>
          <button onClick={() => setSubTab('ifta')} style={tabBtn('ifta', null)}>
            {'\ud83d\udcca ' + t('trips.iftaSubTab')}
          </button>
        </div>
      )}
      {subTab === 'trips' || !showIfta ? (
        <TripsTab userId={userId} refreshKey={refreshKey} theme={theme} />
      ) : (
        <IFTATab userId={userId} theme={theme} />
      )}
    </div>
  )
}
