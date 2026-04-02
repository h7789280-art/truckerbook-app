import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchServiceRecords, fetchInsurance, uploadVehiclePhoto, getVehiclePhotos, deleteVehiclePhoto, getTireRecords, addTireRecord, updateTireRecord, deleteTireRecord, uploadDocument, getDocuments, deleteDocument } from '../lib/api'
import DVIRInspection from '../components/DVIRInspection'
import { supabase } from '../lib/supabase'
import { useLanguage, getCurrencySymbol } from '../lib/i18n'
import { exportToExcel, exportToPDF } from '../utils/export'

const ELD_COUNTRIES = ['US','CA','DE','FR','PL','GB','NL','BE','AT','CZ','SK','IT','ES','SE','DK','FI','NO','HU','RO','BG','HR','LT','LV','EE','SI','IE','PT','GR','LU']

function getUserCountry() {
  try { return localStorage.getItem('truckerbook_country') || 'RU' } catch { return 'RU' }
}

function getSubTabs(t) {
  const country = getUserCountry()
  const showDVIR = !ELD_COUNTRIES.includes(country)
  const tabs = [
    { key: 'service', label: '\uD83D\uDD27 ' + t('service.service') },
    { key: 'tires', label: '\uD83D\uDEDE ' + t('service.tires') },
    { key: 'checklist', label: '\u2705 ' + t('service.checklist') },
    { key: 'docs', label: '\uD83D\uDCC4 ' + t('service.docs') },
  ]
  if (showDVIR) {
    tabs.push({ key: 'dvir', label: '\uD83D\uDD0D ' + t('service.inspection') })
  }
  return tabs
}

function getTirePositions(t) {
  return [
    { key: 'front_left', label: t('service.frontLeft') },
    { key: 'front_right', label: t('service.frontRight') },
    { key: 'rear_left_outer', label: t('service.rearLeftOuter') },
    { key: 'rear_left_inner', label: t('service.rearLeftInner') },
    { key: 'rear_right_outer', label: t('service.rearRightOuter') },
    { key: 'rear_right_inner', label: t('service.rearRightInner') },
    { key: 'spare', label: t('service.spare') },
  ]
}

function getTireConditions(t) {
  return [
    { key: 'new', label: t('service.condNew'), color: '#22c55e' },
    { key: 'good', label: t('service.condGood'), color: '#22c55e' },
    { key: 'worn', label: t('service.condWorn'), color: '#f59e0b' },
    { key: 'replace', label: t('service.condReplace'), color: '#ef4444' },
  ]
}

function getChecklistSections(t) {
  return [
    {
      key: 'pdd',
      title: '\uD83D\uDEA8 ' + t('service.pddRequired'),
      color: '#ef4444',
      items: [
        t('service.fireExtinguisher'), t('service.firstAidKit'),
        t('service.warningSign'), t('service.wheelChocks'),
        t('service.vest'), t('service.tachograph'),
        t('service.driverCard'), t('service.waybill'),
        t('service.adr'),
      ],
    },
    {
      key: 'recommended',
      title: '\u26A1\uFE0F ' + t('service.recommended'),
      color: '#f59e0b',
      items: [
        t('service.towRope'), t('service.jumperCables'),
        t('service.bulbs'), t('service.fuses'),
        t('service.tools'), t('service.jack'),
        t('service.chains'), t('service.canister'),
        t('service.flashlight'),
      ],
    },
    {
      key: 'comfort',
      title: '\uD83C\uDFE0 ' + t('service.comfort'),
      color: '#3b82f6',
      items: [
        t('service.antifreeze'), t('service.rags'),
        t('service.gloves'), t('service.tape'),
        t('service.zipTies'), t('service.wd40'),
        t('service.personalKit'), t('service.powerbank'),
        t('service.thermos'), t('service.sleepingBag'),
      ],
    },
  ]
}

function getDocTypes(t) {
  return [
    { key: 'license', icon: '\uD83D\uDCC4', label: t('service.docLicense') },
    { key: 'sts', icon: '\uD83D\uDCC4', label: t('service.docSts') },
    { key: 'osago', icon: '\uD83D\uDEE1\uFE0F', label: t('service.docOsago') },
    { key: 'kasko', icon: '\uD83D\uDEE1\uFE0F', label: t('service.docKasko') },
    { key: 'pts', icon: '\uD83D\uDCCB', label: t('service.docPts') },
    { key: 'contract', icon: '\uD83D\uDCDD', label: t('service.docContract') },
    { key: 'dopog', icon: '\u26A0\uFE0F', label: t('service.docDopog') },
    { key: 'bol', icon: '\uD83D\uDCE6', label: t('service.docBol') },
    { key: 'other', icon: '\uD83D\uDCCE', label: t('service.docOther') },
  ]
}

function getDocTypeSelect(t) {
  return [
    { key: 'license', label: t('service.docLicenseFull') },
    { key: 'sts', label: t('service.docSts') },
    { key: 'osago', label: t('service.docOsago') },
    { key: 'kasko', label: t('service.docKasko') },
    { key: 'pts', label: t('service.docPts') },
    { key: 'contract', label: t('service.docContract') },
    { key: 'dopog', label: t('service.docDopog') },
    { key: 'other', label: t('service.docOther') },
  ]
}

function getPhotoTypes(t) {
  return [
    { key: 'inspection', label: t('service.inspection') },
    { key: 'damage', label: t('service.damage') },
    { key: 'before', label: t('service.before') },
    { key: 'after', label: t('service.after') },
  ]
}

function getPhotoTypeLabels(t) {
  return {
    inspection: t('service.inspection'),
    damage: t('service.damage'),
    before: t('service.before'),
    after: t('service.after'),
  }
}

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

export default function Service({ userId, activeVehicleId }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('service')
  const [checkedItems, setCheckedItems] = useState({})
  const [repairs, setRepairs] = useState([])
  const [odometer, setOdometer] = useState(null)
  const [loading, setLoading] = useState(true)

  const SUB_TABS = getSubTabs(t)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const serviceRecs = await fetchServiceRecords(userId).catch(() => [])
      setRepairs(serviceRecs)

      // Get odometer from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('odometer')
        .eq('id', userId)
        .single()
      if (profile?.odometer) setOdometer(profile.odometer)
    } catch (err) {
      console.error('Service loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleCheck = (sectionKey, idx) => {
    const key = `${sectionKey}_${idx}`
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const getCheckedCount = (sectionKey, total) => {
    let count = 0
    for (let i = 0; i < total; i++) {
      if (checkedItems[`${sectionKey}_${i}`]) count++
    }
    return count
  }

  return (
    <div style={{ padding: '16px', minHeight: '100vh', backgroundColor: 'var(--bg)', paddingBottom: '80px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'var(--card)',
              color: activeTab === tab.key ? '#000' : 'var(--dim)',
              border: activeTab === tab.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'service' && <ServiceTab repairs={repairs} odometer={odometer} loading={loading} />}
      {activeTab === 'tires' && <TiresTab userId={userId} odometer={odometer} />}
      {activeTab === 'checklist' && (
        <ChecklistTab
          checkedItems={checkedItems}
          toggleCheck={toggleCheck}
          getCheckedCount={getCheckedCount}
        />
      )}
      {activeTab === 'docs' && <DocsTab userId={userId} vehicleId={activeVehicleId} />}
      {activeTab === 'dvir' && <DVIRInspection userId={userId} vehicleId={activeVehicleId} />}
    </div>
  )
}

/* ===== SERVICE TAB ===== */
function ServiceTab({ repairs, odometer, loading }) {
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef(null)

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
    const columns = [
      { header: t('fuel.exportDate'), key: 'date' },
      { header: t('service.repair'), key: 'type' },
      { header: t('fuel.exportDescription'), key: 'description' },
      { header: `${t('fuel.exportAmount')} (${cs})`, key: 'amount' },
    ]
    const rows = repairs.map(r => ({
      date: r.date || '',
      type: t('service.repair'),
      description: r.description || r.name || '',
      amount: Math.round(r.cost || 0),
    }))
    const now2 = new Date()
    const ym = `${now2.getFullYear()}_${String(now2.getMonth() + 1).padStart(2, '0')}`
    if (format === 'excel') {
      exportToExcel(rows, columns, `service_report_${ym}.xlsx`)
    } else {
      exportToPDF(rows, columns, t('service.repairHistory'), `service_report_${ym}.pdf`)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
        {t('common.loading')}
      </div>
    )
  }

  const totalRepair = repairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <>
      {/* Export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', paddingRight: 44 }}>
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
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{t('service.repair')}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>
            {totalRepair.toLocaleString('ru-RU')} {'\u20BD'}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{t('service.odometer')}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
            {odometer ? odometer.toLocaleString('ru-RU') : '\u2014'} {t('trips.km')}
          </div>
        </div>
      </div>

      {/* Repair history */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {t('service.repairHistory')}
      </div>
      {repairs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {t('service.noRepairs')}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, marginBottom: '16px' }}>
          {repairs.map((r, i) => (
            <div
              key={r.id || i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                width: '40px', height: '40px', backgroundColor: 'var(--card2)',
                borderRadius: '10px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px', flexShrink: 0,
              }}>
                {'\uD83D\uDD27'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.description || r.name || t('service.repair')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                  {r.date || ''} {r.odometer ? `\u00b7 ${r.odometer.toLocaleString('ru-RU')} ${t('trips.km')}` : ''} {r.place ? `\u00b7 ${r.place}` : ''}
                </div>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444', flexShrink: 0 }}>
                {(r.cost || 0).toLocaleString('ru-RU')} {'\u20BD'}
              </div>
            </div>
          ))}
        </div>
      )}

    </>
  )
}

/* ===== TIRES TAB ===== */
function TiresTab({ userId, odometer }) {
  const { t } = useLanguage()
  const [tires, setTires] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTire, setEditTire] = useState(null)

  const TIRE_POSITIONS = getTirePositions(t)
  const TIRE_CONDITIONS = getTireConditions(t)
  const TIRE_POSITION_LABELS = Object.fromEntries(TIRE_POSITIONS.map(p => [p.key, p.label]))
  const TIRE_CONDITION_MAP = Object.fromEntries(TIRE_CONDITIONS.map(c => [c.key, c]))

  const loadTires = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const data = await getTireRecords(userId)
      setTires(data)
    } catch (err) {
      console.error('loadTires error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadTires()
  }, [loadTires])

  const handleDelete = async (id) => {
    if (!confirm(t('service.deleteTire'))) return
    try {
      await deleteTireRecord(id)
      setTires(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      console.error('deleteTire error:', err)
    }
  }

  const handleEdit = (tire) => {
    setEditTire(tire)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditTire(null)
    setShowModal(true)
  }

  const handleSaved = () => {
    setShowModal(false)
    setEditTire(null)
    loadTires()
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
        {t('common.loading')}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleAdd}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#000',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        {t('service.addTire')}
      </button>

      {tires.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {t('service.noTires')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tires.map(tire => {
            const cond = TIRE_CONDITION_MAP[tire.condition] || { label: tire.condition, color: 'var(--dim)' }
            const posLabel = TIRE_POSITION_LABELS[tire.position] || tire.position || ''
            const kmDriven = odometer && tire.installed_odometer
              ? Math.max(0, odometer - tire.installed_odometer)
              : null

            return (
              <div key={tire.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '40px', height: '40px', backgroundColor: 'var(--card2)',
                      borderRadius: '10px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '20px', flexShrink: 0,
                    }}>
                      {'\uD83D\uDEDE'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tire.brand}{tire.model ? ' ' + tire.model : ''} {'\u00b7'} {posLabel}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
                        {t('service.installed') + ': '}{formatDate(tire.installed_at)}
                        {tire.installed_odometer ? ` \u00b7 ${tire.installed_odometer.toLocaleString('ru-RU')} ${t('trips.km')}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                    <button
                      onClick={() => handleEdit(tire)}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid var(--border)', background: 'var(--card2)',
                        color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >{'\u270F\uFE0F'}</button>
                    <button
                      onClick={() => handleDelete(tire.id)}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid var(--border)', background: 'var(--card2)',
                        color: '#ef4444', fontSize: '14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >{'\uD83D\uDDD1\uFE0F'}</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: cond.color,
                    background: cond.color + '15', padding: '2px 10px', borderRadius: '8px',
                  }}>
                    {cond.label}
                  </div>
                  {kmDriven !== null && (
                    <div style={{ fontSize: '12px', color: 'var(--dim)' }}>
                      {t('service.mileageDriven') + ': '}{kmDriven.toLocaleString('ru-RU')}{' ' + t('trips.km')}
                    </div>
                  )}
                  {tire.cost > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--dim)' }}>
                      {tire.cost.toLocaleString('ru-RU')}{' \u20BD'}
                    </div>
                  )}
                </div>
                {tire.notes ? (
                  <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '6px', fontStyle: 'italic' }}>
                    {tire.notes}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <TireModal
          userId={userId}
          tire={editTire}
          onClose={() => { setShowModal(false); setEditTire(null) }}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

/* ===== TIRE MODAL ===== */
function TireModal({ userId, tire, onClose, onSaved }) {
  const { t } = useLanguage()
  const TIRE_POSITIONS = getTirePositions(t)
  const TIRE_CONDITIONS = getTireConditions(t)
  const [brand, setBrand] = useState(tire?.brand || '')
  const [model, setModel] = useState(tire?.model || '')
  const [position, setPosition] = useState(tire?.position || 'front_left')
  const [installedAt, setInstalledAt] = useState(tire?.installed_at?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [installedOdometer, setInstalledOdometer] = useState(tire?.installed_odometer?.toString() || '')
  const [condition, setCondition] = useState(tire?.condition || 'new')
  const [cost, setCost] = useState(tire?.cost?.toString() || '')
  const [notes, setNotes] = useState(tire?.notes || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!brand.trim()) return
    setSaving(true)
    try {
      const entry = {
        vehicle_id: null,
        brand: brand.trim(),
        model: model.trim(),
        position,
        installed_at: installedAt,
        installed_odometer: installedOdometer,
        condition,
        cost: cost || '0',
        notes: notes.trim(),
      }
      if (tire) {
        await updateTireRecord(tire.id, entry)
      } else {
        await addTireRecord(entry)
      }
      onSaved()
    } catch (err) {
      console.error('saveTire error:', err)
      alert(t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
  }

  const labelStyle = { color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        background: 'var(--card)',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
            {tire ? '\u270F\uFE0F ' + t('service.editTire') : '\uD83D\uDEDE ' + t('service.newTire')}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>{'\u2715'}</button>
        </div>

        {/* Brand */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.tireBrand')}</div>
          <input
            type="text"
            value={brand}
            onChange={e => setBrand(e.target.value)}
            placeholder="Michelin, Continental, Bridgestone..."
            style={inputStyle}
          />
        </div>

        {/* Model */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.tireModel')}</div>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="X Line Energy, EcoPlus..."
            style={inputStyle}
          />
        </div>

        {/* Position */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.position')}</div>
          <select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}>
            {TIRE_POSITIONS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Installed date */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.installDate')}</div>
          <input type="date" value={installedAt} onChange={e => setInstalledAt(e.target.value)} style={inputStyle} />
        </div>

        {/* Installed odometer */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.installOdometer')}</div>
          <input
            type="number"
            value={installedOdometer}
            onChange={e => setInstalledOdometer(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>

        {/* Condition */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.condition')}</div>
          <select value={condition} onChange={e => setCondition(e.target.value)} style={inputStyle}>
            {TIRE_CONDITIONS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Cost */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.costOptional')}</div>
          <input
            type="number"
            value={cost}
            onChange={e => setCost(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>{t('service.notesOptional')}</div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!brand.trim() || saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            border: 'none',
            background: !brand.trim() ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: !brand.trim() ? 'var(--dim)' : '#000',
            fontSize: '15px', fontWeight: 700,
            cursor: !brand.trim() ? 'default' : 'pointer',
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

/* ===== CHECKLIST TAB ===== */
function ChecklistTab({ checkedItems, toggleCheck, getCheckedCount }) {
  const { t } = useLanguage()
  const CHECKLIST_SECTIONS = getChecklistSections(t)
  const pddChecked = getCheckedCount('pdd', CHECKLIST_SECTIONS[0].items.length)
  const pddTotal = CHECKLIST_SECTIONS[0].items.length
  const pddComplete = pddChecked === pddTotal

  return (
    <>
      {CHECKLIST_SECTIONS.map(section => {
        const checked = getCheckedCount(section.key, section.items.length)
        const total = section.items.length
        const pct = Math.round((checked / total) * 100)

        return (
          <div key={section.key} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{section.title}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: section.color }}>
                {checked}/{total}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'var(--border)', borderRadius: '4px', height: '4px', marginBottom: '10px' }}>
              <div style={{
                height: '4px', borderRadius: '4px', background: section.color,
                width: `${pct}%`, transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{ ...cardStyle, padding: 0 }}>
              {section.items.map((item, idx) => {
                const isChecked = !!checkedItems[`${section.key}_${idx}`]
                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(section.key, idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px', cursor: 'pointer',
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                      border: isChecked ? 'none' : '2px solid var(--border)',
                      background: isChecked ? section.color : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}>
                      {isChecked && (
                        <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>{'\u2713'}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '14px', color: isChecked ? 'var(--dim)' : 'var(--text)',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      transition: 'color 0.15s',
                    }}>
                      {item}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* PDD status banner */}
      <div style={{
        ...cardStyle,
        background: pddComplete ? '#22c55e15' : '#ef444415',
        border: `1px solid ${pddComplete ? '#22c55e40' : '#ef444440'}`,
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '22px' }}>{pddComplete ? '\u2705' : '\uD83D\uDEA8'}</span>
        <div style={{
          fontSize: '14px', fontWeight: 600,
          color: pddComplete ? '#22c55e' : '#ef4444',
        }}>
          {pddComplete
            ? t('service.pddAllGood')
            : `${t('service.checklist')}: ${pddChecked}/${pddTotal} ${t('service.pddMissing')}`
          }
        </div>
      </div>
    </>
  )
}

/* ===== BOL SECTION ===== */
function BolSection({ userId, vehicleId }) {
  const { t } = useLanguage()
  const now = new Date()
  const [bolFiles, setBolFiles] = useState([])
  const [loadingBol, setLoadingBol] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [bolMonth, setBolMonth] = useState(now.getMonth() + 1)
  const [bolYear, setBolYear] = useState(now.getFullYear())
  const [bolFilterMode, setBolFilterMode] = useState('month') // 'month' | 'period'
  const [bolDateFrom, setBolDateFrom] = useState('')
  const [bolDateTo, setBolDateTo] = useState('')
  const bolInputRef = useRef(null)

  const MONTH_NAMES = [
    '\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
    '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c',
    '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c',
    '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c',
  ]

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y)

  const getBolDateRange = useCallback(() => {
    if (bolFilterMode === 'period') {
      if (!bolDateFrom || !bolDateTo) return null
      return {
        start: bolDateFrom + 'T00:00:00',
        end: bolDateTo + 'T23:59:59',
      }
    }
    const start = `${bolYear}-${String(bolMonth).padStart(2, '0')}-01`
    const endMonth = bolMonth === 12 ? 1 : bolMonth + 1
    const endYear = bolMonth === 12 ? bolYear + 1 : bolYear
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
    return { start: start + 'T00:00:00', end: end + 'T00:00:00' }
  }, [bolFilterMode, bolMonth, bolYear, bolDateFrom, bolDateTo])

  const loadBolFiles = useCallback(async () => {
    if (!userId) return
    const range = getBolDateRange()
    if (!range) { setBolFiles([]); setLoadingBol(false); return }
    try {
      setLoadingBol(true)
      let query = supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'bol')
        .gte('created_at', range.start)
        .order('created_at', { ascending: false })
      if (bolFilterMode === 'period') {
        query = query.lte('created_at', range.end)
      } else {
        query = query.lt('created_at', range.end)
      }
      const { data, error } = await query
      if (error) throw error
      setBolFiles(data || [])
    } catch (err) {
      console.error('loadBolFiles error:', err)
    } finally {
      setLoadingBol(false)
    }
  }, [userId, bolFilterMode, bolMonth, bolYear, bolDateFrom, bolDateTo, getBolDateRange])

  useEffect(() => { loadBolFiles() }, [loadBolFiles])

  const handleBolUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    e.target.value = ''
    setUploading(true)
    try {
      const timestamp = Date.now()
      const path = `${userId}/bol/${timestamp}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(path)
      const fileUrl = urlData.publicUrl
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          vehicle_id: vehicleId || null,
          type: 'bol',
          title: file.name || 'BOL',
          file_url: fileUrl,
          storage_path: path,
          notes: '',
          file_name: file.name || '',
          file_size: file.size || 0,
          mime_type: file.type || '',
        })
      if (dbError) throw dbError
      loadBolFiles()
    } catch (err) {
      console.error('BOL upload error:', JSON.stringify(err))
      alert(err?.message || 'BOL save error')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteBol = async (bol) => {
    if (!confirm(t('service.deleteDoc'))) return
    try {
      if (bol.storage_path) {
        await supabase.storage.from('receipts').remove([bol.storage_path])
      }
      await supabase.from('documents').delete().eq('id', bol.id)
      setBolFiles(prev => prev.filter(b => b.id !== bol.id))
    } catch (err) {
      console.error('delete BOL error:', err)
    }
  }

  const handleDownloadAllBol = async () => {
    if (bolFiles.length === 0 || downloading) return
    setDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const bol of bolFiles) {
        if (!bol.file_url) continue
        try {
          const resp = await fetch(bol.file_url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const dateStr = bol.created_at ? new Date(bol.created_at).toISOString().slice(0, 10).replace(/-/g, '') : 'nodate'
          const ext = (bol.title || '').split('.').pop() || 'jpg'
          const name = `BOL_${bol.title ? bol.title.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') : bol.id}_${dateStr}.${ext}`
          zip.file(name, blob)
        } catch (err) {
          console.warn('Skip BOL file:', bol.id, err)
        }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const { saveAs } = await import('file-saver')
      const zipName = bolFilterMode === 'period'
        ? `BOL_${bolDateFrom}_${bolDateTo}.zip`
        : `BOL_${String(bolMonth).padStart(2, '0')}_${bolYear}.zip`
      saveAs(content, zipName)
    } catch (err) {
      console.error('ZIP download error:', err)
      alert('ZIP error: ' + (err?.message || 'Unknown'))
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const cardStyle = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '14px',
  }

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '13px',
  }

  return (
    <>
      {/* Filter mode switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', background: 'var(--card2)', borderRadius: '10px', padding: '3px' }}>
        {['month', 'period'].map(mode => (
          <button
            key={mode}
            onClick={() => setBolFilterMode(mode)}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '8px',
              border: 'none',
              background: bolFilterMode === mode ? 'var(--card)' : 'transparent',
              color: bolFilterMode === mode ? 'var(--text)' : 'var(--dim)',
              fontSize: '13px',
              fontWeight: bolFilterMode === mode ? 600 : 400,
              cursor: 'pointer',
              boxShadow: bolFilterMode === mode ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            {mode === 'month' ? (t('common.month') || '\u041c\u0435\u0441\u044f\u0446') : (t('common.period') || '\u041f\u0435\u0440\u0438\u043e\u0434')}
          </button>
        ))}
      </div>

      {/* Month mode */}
      {bolFilterMode === 'month' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <select value={bolMonth} onChange={e => setBolMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={bolYear} onChange={e => setBolYear(Number(e.target.value))} style={selectStyle}>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Period mode */}
      {bolFilterMode === 'period' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="date"
            value={bolDateFrom}
            onChange={e => setBolDateFrom(e.target.value)}
            style={selectStyle}
          />
          <input
            type="date"
            value={bolDateTo}
            onChange={e => setBolDateTo(e.target.value)}
            style={selectStyle}
          />
        </div>
      )}

      <input
        ref={bolInputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleBolUpload}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => bolInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '12px',
            border: 'none',
            background: uploading ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: uploading ? 'var(--dim)' : '#000',
            fontSize: '14px',
            fontWeight: 700,
            cursor: uploading ? 'default' : 'pointer',
          }}
        >
          {uploading ? t('common.loading') : '\uD83D\uDCE5 ' + t('service.uploadBol')}
        </button>
        <button
          onClick={handleDownloadAllBol}
          disabled={downloading || bolFiles.length === 0}
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: (downloading || bolFiles.length === 0) ? 'var(--border)' : 'var(--card2)',
            color: (downloading || bolFiles.length === 0) ? 'var(--dim)' : '#3b82f6',
            fontSize: '14px',
            fontWeight: 700,
            cursor: (downloading || bolFiles.length === 0) ? 'default' : 'pointer',
          }}
        >
          {downloading ? '\u23f3' : '\uD83D\uDCE6'} ZIP
        </button>
      </div>

      {loadingBol ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : bolFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {t('service.noBolPeriod') || t('service.noBol')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {bolFiles.map(bol => (
            <div key={bol.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px', backgroundColor: 'var(--card2)',
                  borderRadius: '10px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '22px', flexShrink: 0, overflow: 'hidden',
                }}>
                  {bol.file_url && (bol.title || '').toLowerCase().endsWith('.pdf')
                    ? '\uD83D\uDCC4'
                    : bol.file_url
                      ? <img src={bol.file_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : '\uD83D\uDCE6'
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bol.title || 'BOL'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                    {formatDate(bol.created_at)}
                    {bol.vehicle_id && <span> | {t('service.vehicle') || 'Vehicle'}: {bol.vehicle_id.slice(0, 8)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <a
                    href={bol.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    style={{
                      padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--card2)', color: '#3b82f6', fontSize: '11px', fontWeight: 600,
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {'\u2B07\uFE0F ' + t('service.downloadBol')}
                  </a>
                  <button
                    onClick={() => handleDeleteBol(bol)}
                    style={{
                      padding: '6px 10px', borderRadius: '8px',
                      border: '1px solid #ef444440', background: '#ef444415',
                      color: '#ef4444', fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {'\uD83D\uDDD1\uFE0F'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ===== DOCS TAB ===== */
function DocsTab({ userId, vehicleId }) {
  const { t } = useLanguage()
  const DOC_TYPES = getDocTypes(t)
  const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPES.map(d => [d.key, d]))
  const PHOTO_TYPE_LABELS = getPhotoTypeLabels(t)
  const [vehiclePhotos, setVehiclePhotos] = useState([])
  const [showAddPhotoModal, setShowAddPhotoModal] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  // Documents state
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [showDocModal, setShowDocModal] = useState(false)
  const [docFilter, setDocFilter] = useState('all')
  const [expandedDoc, setExpandedDoc] = useState(null)
  // Insurance state
  const [insurance, setInsurance] = useState([])
  const [loadingInsurance, setLoadingInsurance] = useState(true)

  const loadPhotos = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingPhotos(true)
      const photos = await getVehiclePhotos(userId)
      setVehiclePhotos(photos)
    } catch (err) {
      console.error('loadVehiclePhotos error:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }, [userId])

  const loadDocs = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingDocs(true)
      const docs = await getDocuments(userId)
      setDocuments(docs)
    } catch (err) {
      console.error('loadDocuments error:', err)
    } finally {
      setLoadingDocs(false)
    }
  }, [userId])

  const loadInsurance = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingInsurance(true)
      const data = await fetchInsurance(userId)
      setInsurance(data)
    } catch (err) {
      console.error('loadInsurance error:', err)
    } finally {
      setLoadingInsurance(false)
    }
  }, [userId])

  useEffect(() => {
    loadPhotos()
    loadDocs()
    loadInsurance()
  }, [loadPhotos, loadDocs, loadInsurance])

  const handleDeletePhoto = async (photo) => {
    if (!confirm(t('service.deletePhoto'))) return
    try {
      await deleteVehiclePhoto(photo.id, photo.photo_url)
      setVehiclePhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      console.error('deleteVehiclePhoto error:', err)
    }
  }

  const handleDeleteDoc = async (doc) => {
    if (!confirm(t('service.deleteDoc'))) return
    try {
      await deleteDocument(doc.id)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
      if (expandedDoc === doc.id) setExpandedDoc(null)
    } catch (err) {
      console.error('deleteDocument error:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const nonBolDocs = documents.filter(d => d.type !== 'bol')
  const filteredDocs = docFilter === 'all'
    ? nonBolDocs
    : nonBolDocs.filter(d => d.type === docFilter)

  // Group documents by id to count photos per document title+type
  const docPhotoCounts = {}
  documents.forEach(d => {
    const key = d.id
    docPhotoCounts[key] = (docPhotoCounts[key] || 0) + 1
  })

  return (
    <>
      {/* ===== DOCUMENTS SECTION ===== */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
        {t('service.documents')}
      </div>

      <button
        onClick={() => setShowDocModal(true)}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#000',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        {t('service.uploadDoc')}
      </button>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => setDocFilter('all')}
          style={{
            background: docFilter === 'all' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--card)',
            color: docFilter === 'all' ? '#000' : 'var(--dim)',
            border: docFilter === 'all' ? 'none' : '1px solid var(--border)',
            borderRadius: '20px', padding: '6px 12px', fontSize: '12px',
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {t('service.allFilter')}
        </button>
        {DOC_TYPES.map(dt => (
          <button
            key={dt.key}
            onClick={() => setDocFilter(dt.key)}
            style={{
              background: docFilter === dt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--card)',
              color: docFilter === dt.key ? '#000' : 'var(--dim)',
              border: docFilter === dt.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px', padding: '6px 12px', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {dt.icon + ' ' + dt.label}
          </button>
        ))}
      </div>

      {/* Documents list */}
      {loadingDocs ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {t('service.noDocs')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {filteredDocs.map(doc => {
            const docType = DOC_TYPE_MAP[doc.type] || DOC_TYPE_MAP['other']
            const isExpanded = expandedDoc === doc.id
            return (
              <div key={doc.id} style={cardStyle}>
                <div
                  onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <div style={{
                    width: '40px', height: '40px', backgroundColor: 'var(--card2)',
                    borderRadius: '10px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '20px', flexShrink: 0,
                  }}>
                    {docType.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.title || docType.label}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                      {t('service.docType') + ': ' + docType.label + ' \u00b7 ' + formatDate(doc.created_at)}
                    </div>
                    {doc.file_url && (
                      <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '1px' }}>
                        {'\uD83D\uDCF7 ' + t('service.photo1')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '16px', color: 'var(--dim)', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    {'\u25BC'}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    {doc.notes && (
                      <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '10px' }}>
                        {doc.notes}
                      </div>
                    )}
                    {doc.file_url && (
                      <img
                        src={doc.file_url}
                        alt=""
                        style={{
                          width: '100%', maxHeight: '300px', objectFit: 'contain',
                          borderRadius: '8px', marginBottom: '10px', background: 'var(--bg)',
                        }}
                      />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc) }}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '10px',
                        border: '1px solid #ef444440', background: '#ef444415',
                        color: '#ef4444', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {'\uD83D\uDDD1\uFE0F ' + t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add document modal */}
      {showDocModal && (
        <DocumentModal
          userId={userId}
          vehicleId={vehicleId}
          onClose={() => setShowDocModal(false)}
          onSaved={() => { setShowDocModal(false); loadDocs() }}
        />
      )}

      {/* ===== INSURANCE SECTION ===== */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '24px', marginBottom: '12px' }}>
        {'\uD83D\uDEE1\uFE0F ' + t('service.insurances')}
      </div>
      {loadingInsurance ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : insurance.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {t('service.noInsurance')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {insurance.map((ins, i) => {
            const today = new Date()
            const daysLeft = ins.date_to ? Math.ceil((new Date(ins.date_to) - today) / (1000 * 60 * 60 * 24)) : null
            const insColor = daysLeft !== null && daysLeft < 30 ? '#ef4444' : '#22c55e'
            return (
              <div key={ins.id || i} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '36px', height: '36px', backgroundColor: `${insColor}20`,
                      borderRadius: '10px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '16px', flexShrink: 0,
                    }}>
                      {'\uD83D\uDEE1'}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{ins.type || t('service.insurance')}</div>
                      <div style={{ fontSize: '12px', color: 'var(--dim)' }}>{ins.company || ''}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
                    {(ins.cost || 0).toLocaleString('ru-RU')} {'\u20BD'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--dim)' }}>
                    {ins.date_from || ''} {'\u2014'} {ins.date_to || ''}
                  </div>
                  {daysLeft !== null && (
                    <div style={{
                      fontSize: '12px', fontWeight: 600, color: insColor,
                      background: `${insColor}15`, padding: '2px 8px', borderRadius: '8px',
                    }}>
                      {daysLeft > 0 ? `${daysLeft} ${t('service.days')}` : t('service.expired')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== BOL FILES SECTION ===== */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '24px', marginBottom: '12px' }}>
        {'\uD83D\uDCE6 ' + t('service.bolFiles')}
      </div>

      <BolSection userId={userId} vehicleId={vehicleId} />

      {/* ===== VEHICLE INSPECTION PHOTOS SECTION ===== */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '24px', marginBottom: '12px' }}>
        {t('service.inspectionPhotos')}
      </div>

      <button
        onClick={() => setShowAddPhotoModal(true)}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#000',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        {'\uD83D\uDCF7 ' + t('service.addInspectionPhoto')}
      </button>

      {/* Photo gallery */}
      {loadingPhotos ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : vehiclePhotos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {t('service.noInspectionPhotos')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {vehiclePhotos.map(photo => (
            <div key={photo.id} style={{ ...cardStyle, padding: '0', overflow: 'hidden', position: 'relative' }}>
              <img
                src={photo.photo_url}
                alt=""
                onClick={() => setFullscreenPhoto(photo)}
                style={{
                  width: '100%',
                  height: '140px',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  display: 'block',
                }}
              />
              <div style={{ padding: '8px 10px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#f59e0b',
                  marginBottom: '2px',
                }}>
                  {PHOTO_TYPE_LABELS[photo.photo_type] || photo.photo_type}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                  {formatDate(photo.created_at)}
                </div>
                {photo.notes && (
                  <div style={{ fontSize: '11px', color: 'var(--text)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {photo.notes}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo) }}
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {'\uD83D\uDDD1\uFE0F'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add photo modal */}
      {showAddPhotoModal && (
        <VehiclePhotoModal
          userId={userId}
          vehicleId={vehicleId}
          onClose={() => setShowAddPhotoModal(false)}
          onSaved={() => { setShowAddPhotoModal(false); loadPhotos() }}
        />
      )}

      {/* Fullscreen photo viewer */}
      {fullscreenPhoto && (
        <div
          onClick={() => setFullscreenPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <img
            src={fullscreenPhoto.photo_url}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
          />
          <div style={{ color: '#fff', fontSize: '14px', marginTop: '12px', textAlign: 'center' }}>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
              {PHOTO_TYPE_LABELS[fullscreenPhoto.photo_type] || fullscreenPhoto.photo_type}
            </span>
            {' \u00b7 '}{formatDate(fullscreenPhoto.created_at)}
            {fullscreenPhoto.notes && <div style={{ marginTop: '4px', color: '#ccc' }}>{fullscreenPhoto.notes}</div>}
          </div>
          <button
            onClick={() => setFullscreenPhoto(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '40px', height: '40px', borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,0.2)',
              color: '#fff', fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {'\u2715'}
          </button>
        </div>
      )}
    </>
  )
}

/* ===== DOCUMENT UPLOAD MODAL ===== */
function DocumentModal({ userId, vehicleId, onClose, onSaved }) {
  const { t } = useLanguage()
  const DOC_TYPE_SELECT = getDocTypeSelect(t)
  const [docType, setDocType] = useState('license')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const maxPhotos = 3

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

  const handleSave = async () => {
    if (photos.length === 0) return
    setSaving(true)
    try {
      for (const p of photos) {
        await uploadDocument(userId, vehicleId || null, p.file, docType, title, notes)
      }
      photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      onSaved()
    } catch (err) {
      console.error('Save document error:', JSON.stringify(err))
      alert(err?.message || t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { display: 'none' }
  const btnPhotoStyle = {
    flex: 1,
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: photos.length >= maxPhotos ? 'default' : 'pointer',
    opacity: photos.length >= maxPhotos ? 0.4 : 1,
    textAlign: 'center',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        background: 'var(--card)',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
            {'\uD83D\uDCC4 ' + t('service.uploadDoc')}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>{'\u2715'}</button>
        </div>

        {/* Document type select */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {t('service.docType')}
          </div>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '14px',
            }}
          >
            {DOC_TYPE_SELECT.map(dt => (
              <option key={dt.key} value={dt.key}>{dt.label}</option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {t('service.noteName')}
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {t('service.notesOptional')}
          </div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Photo picker */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '8px' }}>
            {'\uD83D\uDCF7 ' + photos.length + '/' + maxPhotos}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={inputStyle} onChange={handleFiles} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={inputStyle} onChange={handleFiles} />
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && cameraRef.current?.click()}>
              {'\uD83D\uDCF7 ' + t('trips.takePhoto')}
            </button>
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && galleryRef.current?.click()}>
              {'\uD83D\uDDBC\uFE0F ' + t('trips.fromGallery')}
            </button>
          </div>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: '60px', height: '60px' }}>
                  <img src={p.preview} alt="" style={{
                    width: '60px', height: '60px', objectFit: 'cover',
                    borderRadius: '8px', border: '1px solid var(--border)',
                  }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#ef4444', color: '#fff', border: 'none',
                      fontSize: '12px', cursor: 'pointer', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{'\u2715'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={photos.length === 0 || saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            border: 'none',
            background: photos.length === 0 ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: photos.length === 0 ? 'var(--dim)' : '#000',
            fontSize: '15px', fontWeight: 700, cursor: photos.length === 0 ? 'default' : 'pointer',
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

/* ===== VEHICLE PHOTO MODAL ===== */
function VehiclePhotoModal({ userId, vehicleId, onClose, onSaved }) {
  const { t } = useLanguage()
  const PHOTO_TYPES = getPhotoTypes(t)
  const [photoType, setPhotoType] = useState('inspection')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const maxPhotos = 5

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

  const handleSave = async () => {
    if (photos.length === 0) return
    setSaving(true)
    try {
      for (const p of photos) {
        await uploadVehiclePhoto(userId, vehicleId || null, p.file, photoType, '', notes)
      }
      photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      onSaved()
    } catch (err) {
      console.error('Save vehicle photo error:', JSON.stringify(err))
      alert(err?.message || t('service.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { display: 'none' }
  const btnPhotoStyle = {
    flex: 1,
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: photos.length >= maxPhotos ? 'default' : 'pointer',
    opacity: photos.length >= maxPhotos ? 0.4 : 1,
    textAlign: 'center',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        background: 'var(--card)',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
            {'\uD83D\uDE9A ' + t('service.addInspectionPhoto')}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>{'\u2715'}</button>
        </div>

        {/* Photo type select */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {t('service.noteType')}
          </div>
          <select
            value={photoType}
            onChange={e => setPhotoType(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '14px',
            }}
          >
            {PHOTO_TYPES.map(pt => (
              <option key={pt.key} value={pt.key}>{pt.label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {t('service.notesOptional')}
          </div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Photo picker */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '8px' }}>
            {'\uD83D\uDCF7 ' + photos.length + '/' + maxPhotos}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={inputStyle} onChange={handleFiles} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={inputStyle} onChange={handleFiles} />
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && cameraRef.current?.click()}>
              {'\uD83D\uDCF7 ' + t('trips.takePhoto')}
            </button>
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && galleryRef.current?.click()}>
              {'\uD83D\uDDBC\uFE0F ' + t('trips.fromGallery')}
            </button>
          </div>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: '60px', height: '60px' }}>
                  <img src={p.preview} alt="" style={{
                    width: '60px', height: '60px', objectFit: 'cover',
                    borderRadius: '8px', border: '1px solid var(--border)',
                  }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#ef4444', color: '#fff', border: 'none',
                      fontSize: '12px', cursor: 'pointer', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{'\u2715'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={photos.length === 0 || saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            border: 'none',
            background: photos.length === 0 ? 'var(--border)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: photos.length === 0 ? 'var(--dim)' : '#000',
            fontSize: '15px', fontWeight: 700, cursor: photos.length === 0 ? 'default' : 'pointer',
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
