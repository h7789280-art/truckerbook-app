import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { uploadTrailerPhoto, deleteVehiclePhoto } from '../lib/api'
import { validateAndCompressFile, interpolate } from '../lib/fileUtils'

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

function getTrailerPhotoTypes(t) {
  return [
    { key: 'overview', label: t('service.trailerOverview') },
    { key: 'damage', label: t('service.trailerDamage') },
    { key: 'number', label: t('service.trailerNumber') },
    { key: 'seal', label: t('service.trailerSeal') },
  ]
}

function getTrailerPhotoTypeLabels(t) {
  return {
    trailer_overview: t('service.trailerOverview'),
    trailer_damage: t('service.trailerDamage'),
    trailer_number: t('service.trailerNumber'),
    trailer_seal: t('service.trailerSeal'),
  }
}

export default function TrailerInspectionContent({ userId, vehicleId, userRole }) {
  const { t } = useLanguage()
  const TRAILER_LABELS = getTrailerPhotoTypeLabels(t)
  const TRAILER_PHOTO_TYPES = getTrailerPhotoTypes(t)
  const [tPhotos, setTPhotos] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [downloadingPhotos, setDownloadingPhotos] = useState(false)
  const now2 = new Date()
  const [filterMode, setFilterMode] = useState('month')
  const [filterMonth, setFilterMonth] = useState(now2.getMonth() + 1)
  const [filterYear, setFilterYear] = useState(now2.getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const MONTH_NAMES = [
    '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
    '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
    '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
    '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
  ]
  const tYears = []
  for (let y = now2.getFullYear(); y >= now2.getFullYear() - 3; y--) tYears.push(y)

  const getTDateRange = useCallback(() => {
    if (filterMode === 'period') {
      if (!dateFrom || !dateTo) return null
      return { start: dateFrom + 'T00:00:00', end: dateTo + 'T23:59:59' }
    }
    const start = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`
    const endMonth = filterMonth === 12 ? 1 : filterMonth + 1
    const endYear = filterMonth === 12 ? filterYear + 1 : filterYear
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
    return { start: start + 'T00:00:00', end: end + 'T00:00:00' }
  }, [filterMode, filterMonth, filterYear, dateFrom, dateTo])

  const loadPhotos = useCallback(async () => {
    if (!userId) return
    const range = getTDateRange()
    if (!range) { setTPhotos([]); setLoadingPhotos(false); return }
    try {
      setLoadingPhotos(true)
      let query = supabase
        .from('vehicle_photos')
        .select('*')
        .eq('user_id', userId)
        .like('photo_type', 'trailer_%')
        .gte('created_at', range.start)
        .order('created_at', { ascending: false })
      if (filterMode === 'period') {
        query = query.lte('created_at', range.end)
      } else {
        query = query.lt('created_at', range.end)
      }
      if (vehicleId) query = query.eq('vehicle_id', vehicleId)
      const { data, error } = await query
      if (error) throw error
      setTPhotos(data || [])
    } catch (err) {
      console.error('loadTrailerPhotos error:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }, [userId, vehicleId, filterMode, filterMonth, filterYear, dateFrom, dateTo, getTDateRange])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const handleDeletePhoto = async (photo) => {
    if (!confirm(t('service.deletePhoto'))) return
    try {
      await deleteVehiclePhoto(photo.id, photo.photo_url)
      setTPhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      console.error('deleteTrailerPhoto error:', err)
    }
  }

  const handleDownloadZip = async () => {
    if (tPhotos.length === 0 || downloadingPhotos) return
    setDownloadingPhotos(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const usedNames = {}
      for (const photo of tPhotos) {
        if (!photo.photo_url) continue
        try {
          const resp = await fetch(photo.photo_url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const dateStr = photo.created_at ? new Date(photo.created_at).toISOString().slice(0, 10) : 'nodate'
          const typePart = (TRAILER_LABELS[photo.photo_type] || photo.photo_type || 'photo').replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
          const ext = (photo.photo_url.split('.').pop() || 'jpg').split('?')[0]
          let baseName = `${typePart}_${dateStr}`
          if (usedNames[baseName]) { usedNames[baseName]++; baseName = `${baseName}_${usedNames[baseName]}` } else { usedNames[baseName] = 1 }
          zip.file(`${baseName}.${ext}`, blob)
        } catch (err) { console.warn('Skip photo:', photo.id, err) }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const { saveAs } = await import('file-saver')
      const zipName = filterMode === 'period'
        ? `Trailer_${dateFrom}_${dateTo}.zip`
        : `Trailer_${String(filterMonth).padStart(2, '0')}_${filterYear}.zip`
      saveAs(content, zipName)
    } catch (err) {
      console.error('Trailer ZIP error:', err)
      alert('ZIP error: ' + (err?.message || 'Unknown'))
    } finally {
      setDownloadingPhotos(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '13px',
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', background: 'var(--card2)', borderRadius: '10px', padding: '3px' }}>
        {['month', 'period'].map(mode => (
          <button key={mode} onClick={() => setFilterMode(mode)} style={{
            flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none',
            background: filterMode === mode ? 'var(--card)' : 'transparent',
            color: filterMode === mode ? 'var(--text)' : 'var(--dim)',
            fontSize: '13px', fontWeight: filterMode === mode ? 600 : 400, cursor: 'pointer',
            boxShadow: filterMode === mode ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
          }}>
            {mode === 'month' ? (t('service.filterMonth') || t('common.month')) : (t('service.filterPeriod') || t('common.period'))}
          </button>
        ))}
      </div>

      {filterMode === 'month' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={selectStyle}>
            {tYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
      {filterMode === 'period' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {userRole !== 'company' && (
          <button onClick={() => setShowAddModal(true)} style={{
            flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          }}>
            {'\uD83D\uDCF7 ' + t('service.addTrailerPhoto')}
          </button>
        )}
        <button onClick={handleDownloadZip} disabled={downloadingPhotos || tPhotos.length === 0} style={{
          flex: userRole === 'company' ? 1 : undefined,
          padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)',
          background: (downloadingPhotos || tPhotos.length === 0) ? 'var(--border)' : 'var(--card2)',
          color: (downloadingPhotos || tPhotos.length === 0) ? 'var(--dim)' : '#3b82f6',
          fontSize: '14px', fontWeight: 700,
          cursor: (downloadingPhotos || tPhotos.length === 0) ? 'default' : 'pointer',
        }}>
          {downloadingPhotos ? '\u23f3' : '\uD83D\uDCE6'} ZIP
        </button>
      </div>

      {loadingPhotos ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>{t('common.loading')}</div>
      ) : tPhotos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>{t('service.noTrailerPhotoPeriod')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {tPhotos.map(photo => (
            <div key={photo.id} style={{ ...cardStyle, padding: '0', overflow: 'hidden', position: 'relative' }}>
              <img src={photo.photo_url} alt="" onClick={() => setFullscreenPhoto(photo)}
                style={{ width: '100%', height: '140px', objectFit: 'cover', cursor: 'pointer', display: 'block' }} />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', marginBottom: '2px' }}>
                  {TRAILER_LABELS[photo.photo_type] || photo.photo_type}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dim)' }}>{formatDate(photo.created_at)}</div>
                {photo.notes && <div style={{ fontSize: '11px', color: 'var(--text)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.notes}</div>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo) }} style={{
                position: 'absolute', top: '6px', right: '6px', width: '28px', height: '28px',
                borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
                fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{'\uD83D\uDDD1\uFE0F'}</button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <TrailerPhotoModal userId={userId} vehicleId={vehicleId} photoTypes={TRAILER_PHOTO_TYPES}
          onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadPhotos() }} />
      )}

      {fullscreenPhoto && (
        <div onClick={() => setFullscreenPhoto(null)}
          onTouchStart={e => { window._fsTrailerTouchY = e.touches[0].clientY }}
          onTouchEnd={e => { const dy = e.changedTouches[0].clientY - (window._fsTrailerTouchY || 0); if (dy > 80) setFullscreenPhoto(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '100%' }}>
            <img src={fullscreenPhoto.photo_url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }} />
            <div style={{ color: '#fff', fontSize: '14px', marginTop: '12px', textAlign: 'center' }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{TRAILER_LABELS[fullscreenPhoto.photo_type] || fullscreenPhoto.photo_type}</span>
              {' \u00b7 '}{formatDate(fullscreenPhoto.created_at)}
              {fullscreenPhoto.notes && <div style={{ marginTop: '4px', color: '#ccc' }}>{fullscreenPhoto.notes}</div>}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null) }} style={{
            position: 'absolute', top: '50px', right: '16px', zIndex: 10000,
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '22px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}>{'\u2715'}</button>
        </div>
      )}
    </>
  )
}

function TrailerPhotoModal({ userId, vehicleId, photoTypes, onClose, onSaved }) {
  const { t } = useLanguage()
  const [photoType, setPhotoType] = useState('overview')
  const [notes, setNotes] = useState('')
  const [tpFiles, setTpFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const maxPhotos = 5

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''
    const remaining = maxPhotos - tpFiles.length
    const toAdd = []
    for (const f of files.slice(0, remaining)) {
      const v = await validateAndCompressFile(f, userId)
      if (!v.ok) { alert(interpolate(t(v.errorKey), v.errorParams)); continue }
      toAdd.push({ file: v.file, preview: URL.createObjectURL(v.file) })
    }
    if (toAdd.length > 0) setTpFiles(prev => [...prev, ...toAdd])
  }

  const removePhoto = (idx) => {
    setTpFiles(prev => {
      const removed = prev[idx]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async () => {
    if (tpFiles.length === 0) return
    setSaving(true)
    try {
      for (const p of tpFiles) {
        await uploadTrailerPhoto(userId, vehicleId || null, p.file, photoType, notes)
      }
      tpFiles.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      onSaved()
    } catch (err) {
      console.error('Save trailer photo error:', JSON.stringify(err))
      alert(err?.message || t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const tpInputStyle = { display: 'none' }
  const btnPhotoStyle = {
    flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', fontWeight: 600,
    cursor: tpFiles.length >= maxPhotos ? 'default' : 'pointer',
    opacity: tpFiles.length >= maxPhotos ? 0.4 : 1, textAlign: 'center',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>{'\uD83D\uDE9B ' + t('service.addTrailerPhoto')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '22px', cursor: 'pointer', padding: '4px' }}>{'\u2715'}</button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>{t('service.incidentType')}</div>
          <select value={photoType} onChange={e => setPhotoType(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px' }}>
            {photoTypes.map(pt => <option key={pt.key} value={pt.key}>{pt.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>{t('service.notesOptional')}</div>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '8px' }}>{'\uD83D\uDCF7 ' + tpFiles.length + '/' + maxPhotos}</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={tpInputStyle} onChange={handleFiles} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={tpInputStyle} onChange={handleFiles} />
            <button type="button" style={btnPhotoStyle} onClick={() => tpFiles.length < maxPhotos && cameraRef.current?.click()}>{'\uD83D\uDCF7 ' + t('trips.takePhoto')}</button>
            <button type="button" style={btnPhotoStyle} onClick={() => tpFiles.length < maxPhotos && galleryRef.current?.click()}>{'\uD83D\uDDBC\uFE0F ' + t('trips.fromGallery')}</button>
          </div>
          {tpFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tpFiles.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: '60px', height: '60px' }}>
                  <img src={p.preview} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'\u2715'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={tpFiles.length === 0 || saving} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: tpFiles.length === 0 ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: tpFiles.length === 0 ? 'var(--dim)' : '#000', fontSize: '15px', fontWeight: 700, cursor: tpFiles.length === 0 ? 'default' : 'pointer' }}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
