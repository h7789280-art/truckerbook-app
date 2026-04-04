import { useState, useEffect, useCallback, useRef } from 'react'
import { useLanguage } from '../lib/i18n'
import { addIncidentRecord, getIncidentRecords, deleteIncidentRecord } from '../lib/api'
import { validateAndCompressFile, interpolate } from '../lib/fileUtils'

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

function getIncidentTypes(t) {
  return [
    { key: 'fine', label: t('service.incidentFine'), color: '#ef4444', icon: '\uD83D\uDCB8' },
    { key: 'inspection_record', label: t('service.incidentInspection'), color: '#3b82f6', icon: '\uD83D\uDD0D' },
    { key: 'accident', label: t('service.incidentAccident'), color: '#f59e0b', icon: '\uD83D\uDEA8' },
  ]
}

export default function IncidentsContent({ userId, vehicleId }) {
  const { t } = useLanguage()
  const INC_TYPES = getIncidentTypes(t)
  const INC_MAP = Object.fromEntries(INC_TYPES.map(it => [it.key, it]))
  const [records, setRecords] = useState([])
  const [incLoading, setIncLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)

  const [filterMode, setFilterMode] = useState('month')
  const now3 = new Date()
  const [filterMonth, setFilterMonth] = useState(now3.getMonth() + 1)
  const [filterYear, setFilterYear] = useState(now3.getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const MONTH_NAMES = [
    '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
    '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
    '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
    '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
  ]
  const incYears = []
  for (let y = now3.getFullYear(); y >= now3.getFullYear() - 3; y--) incYears.push(y)

  const getIncDateRange = useCallback(() => {
    if (filterMode === 'week') {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      return { start: weekAgo.toISOString(), end: new Date().toISOString() }
    }
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

  const loadRecords = useCallback(async () => {
    if (!userId) return
    const range = getIncDateRange()
    if (!range) { setRecords([]); setIncLoading(false); return }
    try {
      setIncLoading(true)
      const data = await getIncidentRecords(userId, vehicleId || null, range.start, range.end)
      setRecords(data)
    } catch (err) {
      console.error('loadIncidents error:', err)
    } finally {
      setIncLoading(false)
    }
  }, [userId, vehicleId, getIncDateRange])

  useEffect(() => { loadRecords() }, [loadRecords])

  const handleDelete = async (rec) => {
    if (!confirm(t('service.deleteDoc'))) return
    try {
      for (const rid of rec.ids) {
        await deleteIncidentRecord(rid)
      }
      const idSet = new Set(rec.ids)
      setRecords(prev => prev.filter(r => !idSet.has(r.id)))
    } catch (err) {
      console.error('deleteIncident error:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const parseNotes = (notesStr) => {
    try { return JSON.parse(notesStr) } catch { return {} }
  }

  const grouped = []
  const seen = new Map()
  for (const rec of records) {
    const meta = parseNotes(rec.notes)
    const groupKey = `${rec.type}_${rec.title}_${meta.date || ''}_${meta.amount || ''}`
    if (seen.has(groupKey)) {
      const existing = grouped[seen.get(groupKey)]
      if (rec.file_url) existing.photos.push({ url: rec.file_url, id: rec.id })
      existing.ids.push(rec.id)
    } else {
      seen.set(groupKey, grouped.length)
      grouped.push({
        id: rec.id,
        ids: [rec.id],
        type: rec.type,
        title: rec.title,
        date: meta.date || rec.created_at,
        amount: meta.amount || null,
        created_at: rec.created_at,
        photos: rec.file_url ? [{ url: rec.file_url, id: rec.id }] : [],
      })
    }
  }

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '13px',
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', background: 'var(--card2)', borderRadius: '10px', padding: '3px' }}>
        {['week', 'month', 'period'].map(mode => (
          <button key={mode} onClick={() => setFilterMode(mode)} style={{
            flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none',
            background: filterMode === mode ? 'var(--card)' : 'transparent',
            color: filterMode === mode ? 'var(--text)' : 'var(--dim)',
            fontSize: '13px', fontWeight: filterMode === mode ? 600 : 400, cursor: 'pointer',
            boxShadow: filterMode === mode ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
          }}>
            {mode === 'week' ? t('service.filterWeek') : mode === 'month' ? t('service.filterMonth') : t('service.filterPeriod')}
          </button>
        ))}
      </div>

      {filterMode === 'month' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={selectStyle}>
            {incYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
      {filterMode === 'period' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
        </div>
      )}

      <button onClick={() => setShowAddModal(true)} style={{
        width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        color: '#000', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '16px',
      }}>
        {t('service.addIncident')}
      </button>

      {incLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>{t('common.loading')}</div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>{t('service.noIncidentsPeriod')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {grouped.map(rec => {
            const typeInfo = INC_MAP[rec.type] || { label: rec.type, color: '#64748b', icon: '\u2753' }
            return (
              <div key={rec.id} style={{ ...cardStyle, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    background: typeInfo.color + '22', color: typeInfo.color,
                    padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                  }}>
                    {typeInfo.icon + ' ' + typeInfo.label}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--dim)', marginLeft: 'auto' }}>{formatDate(rec.date)}</span>
                </div>
                {rec.title && <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '6px', lineHeight: '1.4' }}>{rec.title}</div>}
                {rec.amount && <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>{Number(rec.amount).toLocaleString()}</div>}
                {rec.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {rec.photos.map((ph, i) => (
                      <img key={i} src={ph.url} alt="" onClick={() => setFullscreenPhoto(ph.url)}
                        style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }} />
                    ))}
                  </div>
                )}
                <button onClick={() => handleDelete(rec)} style={{
                  position: 'absolute', top: '10px', right: '10px', width: '28px', height: '28px',
                  borderRadius: '50%', border: 'none', background: 'var(--card2)', color: 'var(--dim)',
                  fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{'\uD83D\uDDD1\uFE0F'}</button>
              </div>
            )
          })}
        </div>
      )}

      {showAddModal && (
        <IncidentModal userId={userId} vehicleId={vehicleId}
          onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadRecords() }} />
      )}

      {fullscreenPhoto && (
        <div onClick={() => setFullscreenPhoto(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <img src={fullscreenPhoto} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }} />
          <button onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null) }} style={{
            position: 'absolute', top: '50px', right: '16px', zIndex: 10000,
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '22px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{'\u2715'}</button>
        </div>
      )}
    </>
  )
}

function IncidentModal({ userId, vehicleId, onClose, onSaved }) {
  const { t } = useLanguage()
  const INC_TYPES = getIncidentTypes(t)
  const [incidentType, setIncidentType] = useState('fine')
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [incFiles, setIncFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const maxPhotos = 5

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''
    const remaining = maxPhotos - incFiles.length
    const toAdd = []
    for (const f of files.slice(0, remaining)) {
      const v = await validateAndCompressFile(f, userId)
      if (!v.ok) { alert(interpolate(t(v.errorKey), v.errorParams)); continue }
      toAdd.push({ file: v.file, preview: URL.createObjectURL(v.file) })
    }
    if (toAdd.length > 0) setIncFiles(prev => [...prev, ...toAdd])
  }

  const removePhoto = (idx) => {
    setIncFiles(prev => {
      const removed = prev[idx]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async () => {
    if (!description.trim() && incFiles.length === 0) return
    setSaving(true)
    try {
      const files = incFiles.length > 0 ? incFiles.map(p => p.file) : null
      await addIncidentRecord(userId, vehicleId || null, incidentType, incidentDate, description, amount || null, files)
      incFiles.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      onSaved()
    } catch (err) {
      console.error('Save incident error:', JSON.stringify(err))
      alert(err?.message || t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const hiddenInput = { display: 'none' }
  const btnPhotoStyle = {
    flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', fontWeight: 600,
    cursor: incFiles.length >= maxPhotos ? 'default' : 'pointer',
    opacity: incFiles.length >= maxPhotos ? 0.4 : 1, textAlign: 'center',
  }
  const fieldLabelStyle = { color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }
  const fieldInputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>{'\u26A0\uFE0F ' + t('service.addIncident')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '22px', cursor: 'pointer', padding: '4px' }}>{'\u2715'}</button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={fieldLabelStyle}>{t('service.incidentType')}</div>
          <select value={incidentType} onChange={e => setIncidentType(e.target.value)} style={{ ...fieldInputStyle, width: '100%' }}>
            {INC_TYPES.map(it => <option key={it.key} value={it.key}>{it.icon + ' ' + it.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={fieldLabelStyle}>{t('service.incidentDate')}</div>
          <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} style={fieldInputStyle} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={fieldLabelStyle}>{t('service.incidentDescription')}</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...fieldInputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={fieldLabelStyle}>{t('service.incidentAmountOptional')}</div>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={fieldInputStyle} placeholder="0" />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '8px' }}>{t('service.incidentPhotos') + ' \uD83D\uDCF7 ' + incFiles.length + '/' + maxPhotos}</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={hiddenInput} onChange={handleFiles} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={hiddenInput} onChange={handleFiles} />
            <button type="button" style={btnPhotoStyle} onClick={() => incFiles.length < maxPhotos && cameraRef.current?.click()}>{'\uD83D\uDCF7 ' + t('trips.takePhoto')}</button>
            <button type="button" style={btnPhotoStyle} onClick={() => incFiles.length < maxPhotos && galleryRef.current?.click()}>{'\uD83D\uDDBC\uFE0F ' + t('trips.fromGallery')}</button>
          </div>
          {incFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {incFiles.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: '60px', height: '60px' }}>
                  <img src={p.preview} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'\u2715'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={(!description.trim() && incFiles.length === 0) || saving} style={{
          width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
          background: (!description.trim() && incFiles.length === 0) ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: (!description.trim() && incFiles.length === 0) ? 'var(--dim)' : '#000',
          fontSize: '15px', fontWeight: 700,
          cursor: (!description.trim() && incFiles.length === 0) ? 'default' : 'pointer',
        }}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
