import { useState, useEffect, useCallback } from 'react'
import { useLanguage } from '../lib/i18n'
import { fetchDVIRInspections, addDVIRInspection, uploadDVIRPhoto } from '../lib/api'
import { supabase } from '../lib/supabase'

const DVIR_ITEMS = [
  'brakes', 'tires', 'headlights', 'turnSignals', 'mirrors',
  'wipers', 'horn', 'steering', 'seatbelts', 'fireExtinguisher',
  'fluidLeaks', 'exhaust', 'couplingDevice', 'emergencyEquipment', 'bodyCab',
]

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--card2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

export default function DVIRInspection({ userId, vehicleId }) {
  const { t } = useLanguage()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | form | detail
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [inspType, setInspType] = useState('pre_trip')
  const [items, setItems] = useState(() =>
    DVIR_ITEMS.map(key => ({ key, ok: true, note: '' }))
  )
  const [photos, setPhotos] = useState({}) // { itemKey: File[] }
  const [generalNotes, setGeneralNotes] = useState('')

  const loadInspections = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await fetchDVIRInspections(userId, vehicleId)
      setInspections(data)
    } catch (err) {
      console.error('DVIR load error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, vehicleId])

  useEffect(() => { loadInspections() }, [loadInspections])

  const resetForm = () => {
    setInspType('pre_trip')
    setItems(DVIR_ITEMS.map(key => ({ key, ok: true, note: '' })))
    setPhotos({})
    setGeneralNotes('')
  }

  const toggleItem = (idx) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, ok: !it.ok, note: it.ok ? it.note : '' } : it
    ))
  }

  const setItemNote = (idx, note) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, note } : it
    ))
  }

  const handlePhotoSelect = (itemKey, files) => {
    if (!files || !files.length) return
    setPhotos(prev => ({
      ...prev,
      [itemKey]: [...(prev[itemKey] || []), ...Array.from(files)],
    }))
  }

  const removePhoto = (itemKey, fileIdx) => {
    setPhotos(prev => {
      const arr = [...(prev[itemKey] || [])]
      arr.splice(fileIdx, 1)
      return { ...arr.length ? { ...prev, [itemKey]: arr } : (() => { const p = { ...prev }; delete p[itemKey]; return p })() }
    })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const defects = items.filter(it => !it.ok)
      const status = defects.length > 0 ? 'fail' : 'pass'
      const itemsJson = items.map(it => ({
        key: it.key,
        label: t('dvir.' + it.key),
        ok: it.ok,
        note: it.note || '',
      }))

      const record = await addDVIRInspection({
        vehicle_id: vehicleId || null,
        inspection_type: inspType,
        status,
        items: itemsJson,
        notes: generalNotes,
        defects_count: defects.length,
      })

      const inspectionId = record.id
      // Upload photos
      for (const [itemKey, files] of Object.entries(photos)) {
        for (const file of files) {
          await uploadDVIRPhoto(userId, inspectionId, itemKey, file)
        }
      }

      resetForm()
      setView('list')
      await loadInspections()
    } catch (err) {
      console.error('DVIR save error:', err)
      alert(t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (insp) => {
    // Load photos for this inspection
    const { data: photoData } = await supabase
      .from('dvir_photos')
      .select('*')
      .eq('inspection_id', insp.id)
      .order('created_at', { ascending: true })
    setSelected({ ...insp, photos: photoData || [] })
    setView('detail')
  }

  // --- LIST VIEW ---
  if (view === 'list') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>
            DVIR
          </div>
          <button
            onClick={() => { resetForm(); setView('form') }}
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + {t('dvir.newInspection')}
          </button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '40px 0' }}>
            {t('common.loading')}
          </div>
        ) : inspections.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--dim)', padding: '40px 16px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\uD83D\uDD0D'}</div>
            <div>{t('dvir.noInspections')}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {inspections.map(insp => {
              const defects = (insp.defects_count != null)
                ? insp.defects_count
                : (insp.items || []).filter(it => !it.ok).length
              return (
                <div
                  key={insp.id}
                  onClick={() => openDetail(insp)}
                  style={{
                    ...cardStyle,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                      {insp.inspection_type === 'pre_trip' ? t('dvir.preTrip') : t('dvir.postTrip')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '4px' }}>
                      {new Date(insp.created_at).toLocaleDateString()} {new Date(insp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {defects > 0 && (
                      <span style={{
                        background: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {defects} {t('dvir.defectsShort')}
                      </span>
                    )}
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: insp.status === 'pass' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: insp.status === 'pass' ? '#22c55e' : '#ef4444',
                    }}>
                      {insp.status === 'pass' ? '\u2705 ' + t('dvir.pass') : '\u274C ' + t('dvir.fail')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // --- FORM VIEW ---
  if (view === 'form') {
    const defectsCount = items.filter(it => !it.ok).length
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setView('list')}
            style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '16px', cursor: 'pointer', padding: '4px' }}
          >
            {'\u2190'}
          </button>
          <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
            {t('dvir.newInspection')}
          </div>
        </div>

        {/* Type toggle */}
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--dim)', fontWeight: 600, marginBottom: '8px' }}>
            {t('dvir.inspectionType')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['pre_trip', 'post_trip'].map(tp => (
              <button
                key={tp}
                onClick={() => setInspType(tp)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: inspType === tp ? '2px solid #f59e0b' : '1px solid var(--border)',
                  background: inspType === tp ? 'rgba(245,158,11,0.1)' : 'var(--card2)',
                  color: inspType === tp ? '#f59e0b' : 'var(--text)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {tp === 'pre_trip' ? t('dvir.preTrip') : t('dvir.postTrip')}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist items */}
        <div style={{ ...cardStyle, marginBottom: '12px', padding: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--dim)', fontWeight: 600, marginBottom: '10px' }}>
            {t('dvir.checklistTitle')} ({items.filter(it => it.ok).length}/{items.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map((item, idx) => (
              <div key={item.key}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: item.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)',
                    border: item.ok ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {t('dvir.' + item.key)}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => { if (!item.ok) toggleItem(idx) }}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '8px',
                        border: item.ok ? '2px solid #22c55e' : '1px solid var(--border)',
                        background: item.ok ? 'rgba(34,197,94,0.15)' : 'transparent',
                        color: item.ok ? '#22c55e' : 'var(--dim)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {'\u2705'} OK
                    </button>
                    <button
                      onClick={() => { if (item.ok) toggleItem(idx) }}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '8px',
                        border: !item.ok ? '2px solid #ef4444' : '1px solid var(--border)',
                        background: !item.ok ? 'rgba(239,68,68,0.15)' : 'transparent',
                        color: !item.ok ? '#ef4444' : 'var(--dim)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {'\u274C'} {t('dvir.defect')}
                    </button>
                  </div>
                </div>
                {/* Defect details */}
                {!item.ok && (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder={t('dvir.defectNote')}
                      value={item.note}
                      onChange={e => setItemNote(idx, e.target.value)}
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <label style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {'\uD83D\uDCF7'} {t('dvir.addPhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          capture="environment"
                          style={{ display: 'none' }}
                          onChange={e => handlePhotoSelect(item.key, e.target.files)}
                        />
                      </label>
                      {(photos[item.key] || []).map((f, fi) => (
                        <span
                          key={fi}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--card2)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: 'var(--dim)',
                          }}
                        >
                          {'\uD83D\uDCCE'} {f.name.slice(0, 15)}
                          <button
                            onClick={() => removePhoto(item.key, fi)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}
                          >
                            {'\u00D7'}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* General notes */}
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--dim)', fontWeight: 600, marginBottom: '8px' }}>
            {t('dvir.generalNotes')}
          </div>
          <textarea
            value={generalNotes}
            onChange={e => setGeneralNotes(e.target.value)}
            placeholder={t('dvir.notesPlaceholder')}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Status preview */}
        <div style={{
          ...cardStyle,
          marginBottom: '12px',
          textAlign: 'center',
          background: defectsCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
          borderColor: defectsCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>
            {defectsCount > 0 ? '\u274C' : '\u2705'}
          </div>
          <div style={{
            fontWeight: 700,
            color: defectsCount > 0 ? '#ef4444' : '#22c55e',
            fontSize: '15px',
          }}>
            {defectsCount > 0
              ? t('dvir.fail') + ' \u2014 ' + defectsCount + ' ' + t('dvir.defectsShort')
              : t('dvir.pass')
            }
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: saving ? 'var(--dim)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '15px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    )
  }

  // --- DETAIL VIEW ---
  if (view === 'detail' && selected) {
    const inspItems = selected.items || []
    const inspPhotos = selected.photos || []
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => { setSelected(null); setView('list') }}
            style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '16px', cursor: 'pointer', padding: '4px' }}
          >
            {'\u2190'}
          </button>
          <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
            {selected.inspection_type === 'pre_trip' ? t('dvir.preTrip') : t('dvir.postTrip')}
          </div>
          <span style={{
            padding: '4px 10px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 700,
            background: selected.status === 'pass' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: selected.status === 'pass' ? '#22c55e' : '#ef4444',
          }}>
            {selected.status === 'pass' ? '\u2705 ' + t('dvir.pass') : '\u274C ' + t('dvir.fail')}
          </span>
        </div>

        <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '12px' }}>
          {new Date(selected.created_at).toLocaleDateString()} {new Date(selected.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Items */}
        <div style={{ ...cardStyle, marginBottom: '12px', padding: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inspItems.map((item, idx) => {
              const itemPhotos = inspPhotos.filter(p => p.item_key === item.key)
              return (
                <div key={idx}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: item.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)',
                  }}>
                    <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                      {item.label || t('dvir.' + item.key)}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: item.ok ? '#22c55e' : '#ef4444',
                    }}>
                      {item.ok ? '\u2705 OK' : '\u274C ' + t('dvir.defect')}
                    </span>
                  </div>
                  {!item.ok && item.note && (
                    <div style={{ padding: '4px 12px', fontSize: '13px', color: 'var(--dim)' }}>
                      {'\uD83D\uDCDD'} {item.note}
                    </div>
                  )}
                  {itemPhotos.length > 0 && (
                    <div style={{ padding: '4px 12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {itemPhotos.map(p => (
                        <img
                          key={p.id}
                          src={p.photo_url}
                          alt=""
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* General notes */}
        {selected.notes && (
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--dim)', fontWeight: 600, marginBottom: '4px' }}>
              {t('dvir.generalNotes')}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text)' }}>
              {selected.notes}
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
