import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchTrips, deleteTrip, getActiveTrailer, getTrailerHistory, pickUpTrailer, dropOffTrailer, deleteTrailer, uploadTrailerPhoto, fetchFuels, fetchWaypoints, fetchVehicles } from '../lib/api'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { validateAndCompressFile, interpolate } from '../lib/fileUtils'
import { exportToExcel, exportToPDF, exportDriverReportExcel, exportFleetReportExcel } from '../utils/export'
import { fetchDriverReportExportData, fetchFleetReportExportData } from '../lib/api'
import { startTracking, stopTracking, isTracking as isGpsTracking } from '../lib/gpsTracker'
import TripMap from '../components/TripMap'
import { calculateTripStateMiles } from '../utils/iftaCalculator'

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

function PhotoPicker({ photos, setPhotos, theme, maxPhotos = 5, userId }) {
  const { t } = useLanguage()
  const cameraRef = { current: null }
  const galleryRef = { current: null }

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''
    const remaining = maxPhotos - photos.length
    const toAdd = []
    for (const f of files.slice(0, remaining)) {
      const v = await validateAndCompressFile(f, userId)
      if (!v.ok) { alert(interpolate(t(v.errorKey), v.errorParams)); continue }
      toAdd.push({ file: v.file, preview: URL.createObjectURL(v.file) })
    }
    if (toAdd.length > 0) setPhotos(prev => [...prev, ...toAdd])
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
            <PhotoPicker photos={pickupPhotos} setPhotos={setPickupPhotos} theme={theme} userId={userId} />
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
            <PhotoPicker photos={dropoffPhotos} setPhotos={setDropoffPhotos} theme={theme} userId={userId} />
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

function TripsTab({ userId, refreshKey, theme, profile }) {
  const { t, lang } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const isCompanyRole = profile?.role === 'company'
  const [entries, setEntries] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef(null)
  const [trackingTripId, setTrackingTripId] = useState(null)
  const [currentPos, setCurrentPos] = useState(null)
  const [showMapTripId, setShowMapTripId] = useState(null)
  const [waypointCounts, setWaypointCounts] = useState({})
  const [expandedVehicleId, setExpandedVehicleId] = useState(null)
  // Company filters
  const [filterVehicleId, setFilterVehicleId] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchTrips(userId)
      setEntries(data)
      if (isCompanyRole) {
        const v = await fetchVehicles(userId)
        setVehicles(v || [])
      }
      // Check which trip is currently tracking
      const tracking = data.find(t => t.is_tracking)
      if (tracking && !isGpsTracking()) {
        setTrackingTripId(tracking.id)
      } else if (tracking) {
        setTrackingTripId(tracking.id)
      }
      // Load waypoint counts for route buttons
      if (!isCompanyRole) {
        const counts = {}
        for (const trip of data) {
          try {
            const wp = await fetchWaypoints(trip.id)
            if (wp.length > 0) counts[trip.id] = wp.length
          } catch {}
        }
        setWaypointCounts(counts)
      }
    } catch (err) {
      console.error('Failed to load trips:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, isCompanyRole])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (isGpsTracking()) stopTracking()
    }
  }, [])

  const handleStartTracking = (tripId) => {
    const ok = startTracking(tripId, userId, (pos) => setCurrentPos(pos))
    if (ok) {
      setTrackingTripId(tripId)
      setEntries(prev => prev.map(e => e.id === tripId ? { ...e, is_tracking: true } : e))
    }
  }

  const handleStopTracking = (tripId) => {
    stopTracking(tripId)
    setTrackingTripId(null)
    setCurrentPos(null)
    setEntries(prev => prev.map(e => e.id === tripId ? { ...e, is_tracking: false } : e))
    // Refresh waypoint counts
    fetchWaypoints(tripId).then(wp => {
      setWaypointCounts(prev => ({ ...prev, [tripId]: wp.length }))
    }).catch(() => {})
    // IFTA: calculate state miles asynchronously (non-blocking)
    calculateTripStateMiles(tripId).catch(err => {
      console.error('IFTA calculateTripStateMiles error:', err)
    })
  }

  const handleDelete = async (id) => {
    try {
      if (trackingTripId === id) handleStopTracking(id)
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

  const handleExport = async (format) => {
    setShowExportMenu(false)
    const distLabel = unitSys === 'imperial' ? 'mi' : t('trips.km')
    const isImperial = unitSys === 'imperial'
    const now2 = new Date()
    const year = now2.getFullYear()
    const month = now2.getMonth() + 1
    const ym = `${year}_${String(month).padStart(2, '0')}`

    if (format === 'excel') {
      try {
        if (isCompanyRole) {
          // Fleet export for company role
          const data = await fetchFleetReportExportData(userId, year, month)

          // Defensive: ensure all arrays exist
          const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : []
          const drivers = Array.isArray(data?.drivers) ? data.drivers : []
          const fuelsArr = Array.isArray(data?.fuels) ? data.fuels : []
          const tripsArr2 = Array.isArray(data?.trips) ? data.trips : []
          const serviceRecsArr = Array.isArray(data?.serviceRecs) ? data.serviceRecs : []
          const tireRecsArr = Array.isArray(data?.tireRecs) ? data.tireRecs : []
          const vehicleExpsArr = Array.isArray(data?.vehicleExps) ? data.vehicleExps : []
          const bytExpsArr = Array.isArray(data?.bytExps) ? data.bytExps : []
          const sessionsArr = Array.isArray(data?.sessions) ? data.sessions : []
          const advancesArr = Array.isArray(data?.advances) ? data.advances : []

          const driverMap = {}
          drivers.forEach(d => {
            driverMap[d.id] = {
              name: d.full_name || d.name || '',
              pay_type: d.pay_type || '',
              pay_rate: d.pay_rate ? parseFloat(d.pay_rate) : 0,
            }
          })
          driverMap[userId] = {
            name: profile?.full_name || profile?.name || 'Owner',
            pay_type: '',
            pay_rate: 0,
          }
          const vehicleMap = {}
          vehicles.forEach(v => {
            const label = ((v.brand || '') + ' ' + (v.model || '')).trim()
            vehicleMap[v.id] = {
              label,
              plate: v.plate_number || '',
              driver: v.driver_name || (v.driver_id && driverMap[v.driver_id] ? driverMap[v.driver_id].name : ''),
            }
          })
          const monthNames = ['\u042f\u043d\u0432\u0430\u0440\u044c','\u0424\u0435\u0432\u0440\u0430\u043b\u044c','\u041c\u0430\u0440\u0442','\u0410\u043f\u0440\u0435\u043b\u044c','\u041c\u0430\u0439','\u0418\u044e\u043d\u044c','\u0418\u044e\u043b\u044c','\u0410\u0432\u0433\u0443\u0441\u0442','\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c','\u041e\u043a\u0442\u044f\u0431\u0440\u044c','\u041d\u043e\u044f\u0431\u0440\u044c','\u0414\u0435\u043a\u0430\u0431\u0440\u044c']
          await exportFleetReportExcel({
            vehicles,
            drivers,
            fuels: fuelsArr,
            trips: tripsArr2,
            serviceRecs: serviceRecsArr,
            tireRecs: tireRecsArr,
            vehicleExps: vehicleExpsArr,
            bytExps: bytExpsArr,
            sessions: sessionsArr,
            advances: advancesArr,
            period: monthNames[month - 1] + ' ' + year,
            distLabel,
            cs,
            isImperial,
            ownerProfile: profile,
            driverMap,
            vehicleMap,
            t,
            filename: `fleet_report_${String(month).padStart(2, '0')}_${year}.xlsx`,
          })
        } else {
          // Driver export
          const data = await fetchDriverReportExportData(userId, year, month)

          const tripsArr = data.trips.map(tr => ({
            date: (tr.created_at || '').slice(0, 10),
            origin: tr.origin || '',
            destination: tr.destination || '',
            miles: isImperial ? Math.round((tr.distance_km || 0) * 0.621371) : Math.round(tr.distance_km || 0),
            income: tr.income || 0,
            driverPay: tr.driver_pay || 0,
          }))

          const expensesArr = []
          data.fuels.forEach(f => expensesArr.push({
            date: f.date || '', description: f.station || 'Fuel', category: 'Fuel',
            gallons: isImperial ? Math.round((f.liters || 0) * 0.264172 * 100) / 100 : (f.liters || 0),
            amount: f.cost || 0, odometer: f.odometer ? (isImperial ? Math.round(f.odometer * 0.621371) : f.odometer) : '',
          }))
          data.bytExps.forEach(e => expensesArr.push({
            date: e.date || '', description: e.description || e.category || '', category: e.category || 'Personal',
            gallons: '', amount: e.amount || 0, odometer: '',
          }))
          data.serviceRecs.forEach(e => expensesArr.push({
            date: e.date || '', description: e.description || e.type || 'Service', category: 'Service',
            gallons: '', amount: e.cost || 0, odometer: '',
          }))
          data.vehicleExps.forEach(e => expensesArr.push({
            date: e.date || '', description: e.description || '', category: e.category || 'Vehicle',
            gallons: '', amount: e.amount || 0, odometer: '',
          }))
          data.tireRecs.forEach(e => expensesArr.push({
            date: e.installed_at || '', description: (e.brand || '') + ' ' + (e.model || ''), category: 'Tires',
            gallons: '', amount: e.cost || 0, odometer: '',
          }))

          const fuelTotal = data.fuels.reduce((s, f) => s + (f.cost || 0), 0)
          const serviceTotal = data.serviceRecs.reduce((s, e) => s + (e.cost || 0), 0)
          const tireTotal = data.tireRecs.reduce((s, e) => s + (e.cost || 0), 0)
          const vExpByCat = {}
          data.vehicleExps.forEach(e => { const cat = e.category || 'other'; vExpByCat[cat] = (vExpByCat[cat] || 0) + (e.amount || 0) })

          const vehicleExpenseCategories = []
          if (fuelTotal > 0) vehicleExpenseCategories.push({ label: 'Fuel', amount: fuelTotal })
          if (vExpByCat.def) vehicleExpenseCategories.push({ label: 'DEF', amount: vExpByCat.def })
          if (serviceTotal > 0) vehicleExpenseCategories.push({ label: 'Repair', amount: serviceTotal })
          if (tireTotal > 0) vehicleExpenseCategories.push({ label: 'Tires', amount: tireTotal })
          const knownVCats = ['def', 'oil', 'supplies', 'hotel']
          Object.entries(vExpByCat).filter(([k]) => !knownVCats.includes(k)).forEach(([k, v]) => {
            if (v > 0) vehicleExpenseCategories.push({ label: k, amount: v })
          })

          const vehicleExpenseTotal = vehicleExpenseCategories.reduce((s, c) => s + c.amount, 0)
          const totalMiles = tripsArr.reduce((s, tr) => s + (tr.miles || 0), 0)
          const totalHours = data.sessions.reduce((s, sh) => {
            if (!sh.ended_at) return s
            return s + (new Date(sh.ended_at).getTime() - new Date(sh.started_at).getTime()) / 3600000
          }, 0)

          const payType = profile?.pay_type || 'none'
          const payRate = profile?.pay_rate ? parseFloat(profile.pay_rate) : 0
          const tripIncome = data.trips.reduce((s, tr) => s + (tr.income || 0), 0)
          const earned = data.trips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
          const personalExpenses = data.bytExps.reduce((s, e) => s + (e.amount || 0), 0)

          const payRows = data.trips.map(tr => {
            const miles = isImperial ? Math.round((tr.distance_km || 0) * 0.621371) : Math.round(tr.distance_km || 0)
            let rate = ''
            if (payType === 'per_mile') rate = '$' + payRate + '/' + distLabel
            else if (payType === 'percent') rate = payRate + '%'
            return { date: (tr.created_at || '').slice(0, 10), route: (tr.origin || '') + ' \u2192 ' + (tr.destination || ''), miles, rate, earned: tr.driver_pay || 0 }
          })

          const payTotal = payRows.reduce((s, r) => s + (r.earned || 0), 0)
          const advancesTotal = data.advances.reduce((s, a) => s + (a.amount || 0), 0)
          const vehicleInfo = profile?.brand ? (profile.brand + ' ' + (profile.model || '') + (profile.plate_number ? ' (' + profile.plate_number + ')' : '')) : ''
          const monthNames = ['\u042f\u043d\u0432\u0430\u0440\u044c','\u0424\u0435\u0432\u0440\u0430\u043b\u044c','\u041c\u0430\u0440\u0442','\u0410\u043f\u0440\u0435\u043b\u044c','\u041c\u0430\u0439','\u0418\u044e\u043d\u044c','\u0418\u044e\u043b\u044c','\u0410\u0432\u0433\u0443\u0441\u0442','\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c','\u041e\u043a\u0442\u044f\u0431\u0440\u044c','\u041d\u043e\u044f\u0431\u0440\u044c','\u0414\u0435\u043a\u0430\u0431\u0440\u044c']

          await exportDriverReportExcel({
            driverName: profile?.full_name || profile?.name || '',
            driverPhone: profile?.phone || '',
            vehicleInfo,
            period: monthNames[month - 1] + ' ' + year,
            tripsCount: tripsArr.length,
            totalMileage: totalMiles,
            totalHours: Math.round(totalHours * 10) / 10,
            payType, payRate, earned, personalExpenses,
            netClean: earned - personalExpenses,
            vehicleExpenseCategories, vehicleExpenseTotal,
            tripIncome, netProfit: tripIncome - vehicleExpenseTotal - personalExpenses,
            trips: tripsArr, expenses: expensesArr, payRows, payTotal,
            advances: data.advances.map(a => ({ date: a.date, amount: a.amount || 0, note: a.note || '' })),
            advancesTotal, payDue: payTotal - advancesTotal,
            distLabel, cs,
            filename: `driver_report_${String(month).padStart(2, '0')}_${year}.xlsx`,
          })
        }
      } catch (err) {
        console.error('Export error:', err)
        alert('Export error: ' + (err?.message || JSON.stringify(err)))
      }
    } else {
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
      exportToPDF(rows, columns, t('trips.tripsHeader'), `trips_report_${ym}.pdf`, lang)
    }
  }

  const totalIncome = entries.reduce((s, t) => s + (t.income || 0), 0)
  const totalKm = entries.reduce((s, t) => s + (t.distance_km || 0), 0)
  const totalDeadhead = entries.reduce((s, t) => s + (t.deadhead_km || 0), 0)
  const distUnit = unitSys === 'imperial' ? 'mi' : t('trips.km')

  const card = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '16px' }
  const miniCard = { background: theme.card, border: '1px solid ' + theme.border, borderRadius: '12px', padding: '12px', textAlign: 'center' }

  // Period date range for company role
  const periodRange = useMemo(() => {
    const now = new Date()
    if (periodFilter === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
      d.setHours(0, 0, 0, 0)
      return { from: d, to: now }
    }
    if (periodFilter === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') }
    }
    // default: month
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  }, [periodFilter, customFrom, customTo])

  // Filtered trips for company role
  const companyTrips = useMemo(() => {
    if (!isCompanyRole) return []
    let filtered = entries.filter(tr => {
      const d = new Date(tr.created_at)
      return d >= periodRange.from && d <= periodRange.to
    })
    if (filterVehicleId !== 'all') {
      filtered = filtered.filter(tr => tr.vehicle_id === filterVehicleId)
    }
    return filtered
  }, [isCompanyRole, entries, periodRange, filterVehicleId])

  // Group trips by vehicle for company role
  const tripsByVehicle = useMemo(() => {
    if (!isCompanyRole || filterVehicleId !== 'all') return null
    const map = {}
    vehicles.forEach(v => { map[v.id] = [] })
    companyTrips.forEach(tr => {
      if (tr.vehicle_id && map[tr.vehicle_id]) {
        map[tr.vehicle_id].push(tr)
      }
    })
    return map
  }, [isCompanyRole, companyTrips, vehicles, filterVehicleId])

  const renderTripCard = (trip, compact) => (
    <div key={trip.id} style={{ padding: compact ? '8px 0' : '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: theme.text, fontSize: compact ? '14px' : '16px', fontWeight: 600 }}>
            {trip.origin || '?'} {'\u2192'} {trip.destination || '?'}
          </div>
          <div style={{ color: theme.dim, fontSize: '12px', marginTop: '2px' }}>
            {formatDate(trip.created_at)} {'\u00b7'} {fmtFull(trip.distance_km || 0)} {distUnit}
            {(trip.deadhead_km || 0) > 0 && (
              <span style={{ color: '#f59e0b', marginLeft: '6px' }}>
                {'\u00b7 '}{t('trips.deadhead')}{': '}{fmtFull(trip.deadhead_km)}{' '}{distUnit}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: '#22c55e', fontSize: compact ? '14px' : '16px', fontWeight: 700, fontFamily: 'monospace' }}>
            +{fmtFull(trip.income || 0)} {cs}
          </div>
          {trip.driver_pay != null && trip.driver_pay > 0 && isCompanyRole && (
            <div style={{ color: '#f59e0b', fontSize: '11px', fontFamily: 'monospace', marginTop: '2px', opacity: 0.8 }}>
              {t('trips.driverSalary')}: {fmtFull(trip.driver_pay)} {cs}
            </div>
          )}
        </div>
      </div>
      {isCompanyRole && (trip.started_at || trip.ended_at) && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: theme.dim }}>
          {trip.started_at && <span>{t('trips.tripStart')}: {formatDate(trip.started_at)}</span>}
          {trip.ended_at && <span>{t('trips.tripEnd')}: {formatDate(trip.ended_at)}</span>}
        </div>
      )}
    </div>
  )

  // Company totals

  const periodBtnStyle = (key) => ({
    flex: 1,
    padding: '8px 4px',
    borderRadius: '8px',
    border: periodFilter === key ? '2px solid #f59e0b' : '1px solid ' + theme.border,
    background: periodFilter === key ? '#f59e0b22' : 'transparent',
    color: periodFilter === key ? '#f59e0b' : theme.dim,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Trailer block for driver / Filters for company */}
      {isCompanyRole ? (
        <>
          {/* Vehicle filter */}
          {vehicles.length > 0 && (
            <select
              value={filterVehicleId}
              onChange={e => setFilterVehicleId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid ' + theme.border,
                background: theme.card,
                color: theme.text,
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                appearance: 'auto',
              }}
            >
              <option value="all">{'\ud83d\ude9b'} {t('expenses.allVehicles')}</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {'\ud83d\ude9b'} {`${v.brand || ''} ${v.model || ''} ${v.plate_number || ''}`.trim() || v.id}
                </option>
              ))}
            </select>
          )}
          {/* Period filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPeriodFilter('week')} style={periodBtnStyle('week')}>
              {t('trips.week')}
            </button>
            <button onClick={() => setPeriodFilter('month')} style={periodBtnStyle('month')}>
              {t('common.month')}
            </button>
            <button onClick={() => setPeriodFilter('custom')} style={periodBtnStyle('custom')}>
              {t('trips.periodFilter')}
            </button>
          </div>
          {periodFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.card,
                  color: theme.text,
                  fontSize: '14px',
                }}
              />
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.card,
                  color: theme.text,
                  fontSize: '14px',
                }}
              />
            </div>
          )}
        </>
      ) : (
        <TrailerBlock userId={userId} theme={theme} />
      )}

      {/* Mini cards — only for non-company */}
      {!isCompanyRole && (
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
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 44 }}>
        <div style={{ color: theme.dim, fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
          {t('trips.tripsHeader')}
          {isCompanyRole && <span style={{ fontWeight: 400, marginLeft: '8px' }}>({companyTrips.length} {t('trips.tripsCount')})</span>}
        </div>
        {!isCompanyRole && (
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
        )}
      </div>

      {/* Trip cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: theme.dim, fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : isCompanyRole ? (
        /* Company role */
        filterVehicleId !== 'all' ? (
          /* Single vehicle selected — flat list */
          companyTrips.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
              {t('trips.noTripsVehicle')}
            </div>
          ) : (
            companyTrips.map(tr => (
              <div key={tr.id} style={{ ...card, borderBottom: '1px solid ' + theme.border }}>
                {renderTripCard(tr, false)}
              </div>
            ))
          )
        ) : vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.dim, fontSize: 14 }}>
            {t('trips.noVehicles')}
          </div>
        ) : (
          /* Grouped by vehicles */
          vehicles.map(v => {
            const vTrips = tripsByVehicle[v.id] || []
            const visibleTrips = vTrips.slice(0, 3)
            const isExpanded = expandedVehicleId === v.id
            const vLabel = ((v.brand || '') + ' ' + (v.model || '')).trim()
            return (
              <div key={v.id} style={card}>
                {/* Vehicle header */}
                <div style={{ marginBottom: visibleTrips.length > 0 ? '10px' : 0 }}>
                  <div style={{ color: theme.text, fontSize: '16px', fontWeight: 700 }}>
                    {'\ud83d\udc64 '}{v.driver_name || '\u2014'}
                  </div>
                  <div style={{ color: theme.dim, fontSize: '13px', marginTop: '2px' }}>
                    {v.plate_number || ''}{vLabel ? ' \u00b7 ' + vLabel : ''}
                  </div>
                </div>
                {visibleTrips.length > 0 ? (
                  <>
                    <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '8px' }}>
                      {visibleTrips.map((tr, idx) => (
                        <div key={tr.id} style={idx > 0 ? { borderTop: '1px solid ' + theme.border } : {}}>
                          {renderTripCard(tr, true)}
                        </div>
                      ))}
                    </div>
                    {vTrips.length > 3 && (
                      <button
                        onClick={() => setExpandedVehicleId(isExpanded ? null : v.id)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          marginTop: '6px',
                          borderRadius: '8px',
                          border: '1px solid ' + theme.border,
                          background: 'transparent',
                          color: '#f59e0b',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        {isExpanded ? '\u25b2' : '\u25bc'} {t('trips.allTripsForPeriod')} ({vTrips.length})
                      </button>
                    )}
                    {isExpanded && vTrips.length > 3 && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid ' + theme.border }}>
                        {vTrips.slice(3).map(tr => (
                          <div key={tr.id} style={{ borderBottom: '1px solid ' + theme.border }}>
                            {renderTripCard(tr, true)}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: theme.dim, fontSize: '13px', textAlign: 'center', padding: '8px 0', borderTop: '1px solid ' + theme.border, marginTop: '8px' }}>
                    {t('trips.noTripsVehicle')}
                  </div>
                )}
              </div>
            )
          })
        )
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
                  {formatDate(trip.created_at)} {'\u00b7'} {fmtFull(trip.distance_km || 0)} {distUnit}
                  {(trip.deadhead_km || 0) > 0 && (
                    <span style={{ color: '#f59e0b', marginLeft: '6px' }}>
                      {'\u00b7 '}{t('trips.deadhead')}{': '}{fmtFull(trip.deadhead_km)}{' '}{distUnit}
                    </span>
                  )}
                </div>
                {(trip.deadhead_km || 0) > 0 && (trip.income || 0) > 0 && (
                  <div style={{ color: theme.dim, fontSize: '12px', marginTop: '2px' }}>
                    {t('trips.costPerKmTotal')}{': '}{((trip.income || 0) / ((trip.distance_km || 0) + (trip.deadhead_km || 0))).toFixed(2)} {cs}/{distUnit}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>
                  +{fmtFull(trip.income || 0)} {cs}
                </div>
                {(trip.driver_pay != null && trip.driver_pay > 0) && (
                  <div style={{ color: '#22c55e', fontSize: '12px', fontFamily: 'monospace', marginTop: '2px', opacity: 0.8 }}>
                    {t('pay.myEarnings')}: {fmtFull(trip.driver_pay)} {cs}
                  </div>
                )}
              </div>
            </div>
            <div style={{ borderTop: '1px solid ' + theme.border, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {trip.is_tracking && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%' }} />
                    {'GPS \u25cf'}
                  </span>
                )}
                {trackingTripId === trip.id ? (
                  <button
                    onClick={() => handleStopTracking(trip.id)}
                    style={{
                      background: 'none',
                      border: '1px solid #ef444466',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '12px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {'\u23f9\ufe0f ' + t('gps.stopTracking')}
                  </button>
                ) : !trackingTripId && (
                  <button
                    onClick={() => handleStartTracking(trip.id)}
                    style={{
                      background: 'none',
                      border: '1px solid #22c55e66',
                      borderRadius: '8px',
                      color: '#22c55e',
                      fontSize: '12px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {'\u25b6\ufe0f ' + t('gps.startTracking')}
                  </button>
                )}
                {waypointCounts[trip.id] > 0 && (
                  <button
                    onClick={() => setShowMapTripId(trip.id)}
                    style={{
                      background: 'none',
                      border: '1px solid #3b82f666',
                      borderRadius: '8px',
                      color: '#3b82f6',
                      fontSize: '12px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {'\ud83d\uddfa ' + t('gps.showRoute')}
                  </button>
                )}
              </div>
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

      {/* Trip Map overlay */}
      {showMapTripId && (
        <TripMap
          tripId={showMapTripId}
          tripOrigin={(entries.find(tr => tr.id === showMapTripId) || {}).origin}
          tripDestination={(entries.find(tr => tr.id === showMapTripId) || {}).destination}
          isActive={trackingTripId === showMapTripId}
          currentPosition={trackingTripId === showMapTripId ? currentPos : null}
          onClose={() => setShowMapTripId(null)}
        />
      )}
    </div>
  )
}

function IFTATab({ userId, theme }) {
  const { t, lang } = useLanguage()
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
                  exportToPDF(rows, columns, title, fn + '.pdf', lang)
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
  const isCompanyRole = profile?.role === 'company'
  const showIfta = !isCompanyRole && (profile?.hos_mode === 'usa' || profile?.units === 'imperial')
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
        <TripsTab userId={userId} refreshKey={refreshKey} theme={theme} profile={profile} />
      ) : (
        <IFTATab userId={userId} theme={theme} />
      )}
    </div>
  )
}
