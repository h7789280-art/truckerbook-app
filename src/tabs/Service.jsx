import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchServiceRecords, fetchInsurance, fetchRouteNotes, uploadVehiclePhoto, getVehiclePhotos, deleteVehiclePhoto, getTireRecords, addTireRecord, updateTireRecord, deleteTireRecord } from '../lib/api'
import { supabase } from '../lib/supabase'

const SUB_TABS = [
  { key: 'service', label: '\uD83D\uDD27 \u0421\u0435\u0440\u0432\u0438\u0441' },
  { key: 'tires', label: '\uD83D\uDEDE \u0428\u0438\u043D\u044B' },
  { key: 'checklist', label: '\u2705 \u0427\u0435\u043A-\u043B\u0438\u0441\u0442' },
  { key: 'map', label: '\uD83D\uDDFA \u041A\u0430\u0440\u0442\u0430' },
  { key: 'docs', label: '\uD83D\uDCC4 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B' },
]

const TIRE_POSITIONS = [
  { key: 'front_left', label: '\u041F\u0435\u0440\u0435\u0434\u043D\u044F\u044F \u043B\u0435\u0432\u0430\u044F' },
  { key: 'front_right', label: '\u041F\u0435\u0440\u0435\u0434\u043D\u044F\u044F \u043F\u0440\u0430\u0432\u0430\u044F' },
  { key: 'rear_left_outer', label: '\u0417\u0430\u0434\u043D\u044F\u044F \u043B\u0435\u0432\u0430\u044F \u0432\u043D\u0435\u0448\u043D\u044F\u044F' },
  { key: 'rear_left_inner', label: '\u0417\u0430\u0434\u043D\u044F\u044F \u043B\u0435\u0432\u0430\u044F \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F' },
  { key: 'rear_right_outer', label: '\u0417\u0430\u0434\u043D\u044F\u044F \u043F\u0440\u0430\u0432\u0430\u044F \u0432\u043D\u0435\u0448\u043D\u044F\u044F' },
  { key: 'rear_right_inner', label: '\u0417\u0430\u0434\u043D\u044F\u044F \u043F\u0440\u0430\u0432\u0430\u044F \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F' },
  { key: 'spare', label: '\u0417\u0430\u043F\u0430\u0441\u043A\u0430' },
]

const TIRE_CONDITIONS = [
  { key: 'new', label: '\u041D\u043E\u0432\u0430\u044F', color: '#22c55e' },
  { key: 'good', label: '\u0425\u043E\u0440\u043E\u0448\u0430\u044F', color: '#22c55e' },
  { key: 'worn', label: '\u0418\u0437\u043D\u043E\u0448\u0435\u043D\u0430', color: '#f59e0b' },
  { key: 'replace', label: '\u0417\u0430\u043C\u0435\u043D\u0430', color: '#ef4444' },
]

const TIRE_POSITION_LABELS = Object.fromEntries(TIRE_POSITIONS.map(p => [p.key, p.label]))
const TIRE_CONDITION_MAP = Object.fromEntries(TIRE_CONDITIONS.map(c => [c.key, c]))

const CHECKLIST_SECTIONS = [
  {
    key: 'pdd',
    title: '\uD83D\uDEA8 \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u041F\u0414\u0414',
    color: '#ef4444',
    items: [
      '\u041E\u0433\u043D\u0435\u0442\u0443\u0448\u0438\u0442\u0435\u043B\u044C', '\u0410\u043F\u0442\u0435\u0447\u043A\u0430',
      '\u0417\u043D\u0430\u043A \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438', '\u0423\u043F\u043E\u0440\u044B',
      '\u0416\u0438\u043B\u0435\u0442', '\u0422\u0430\u0445\u043E\u0433\u0440\u0430\u0444',
      '\u041A\u0430\u0440\u0442\u0430 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F', '\u041F\u0443\u0442\u0435\u0432\u043E\u0439 \u043B\u0438\u0441\u0442',
      '\u0414\u041E\u041F\u041E\u0413',
    ],
  },
  {
    key: 'recommended',
    title: '\u26A1\uFE0F \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F',
    color: '#f59e0b',
    items: [
      '\u0422\u0440\u043E\u0441', '\u041F\u0440\u043E\u0432\u043E\u0434\u0430',
      '\u041B\u0430\u043C\u043F\u043E\u0447\u043A\u0438', '\u041F\u0440\u0435\u0434\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435\u043B\u0438',
      '\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B', '\u0414\u043E\u043C\u043A\u0440\u0430\u0442',
      '\u0426\u0435\u043F\u0438', '\u041A\u0430\u043D\u0438\u0441\u0442\u0440\u0430',
      '\u0424\u043E\u043D\u0430\u0440\u044C',
    ],
  },
  {
    key: 'comfort',
    title: '\uD83C\uDFE0 \u041A\u043E\u043C\u0444\u043E\u0440\u0442',
    color: '#3b82f6',
    items: [
      '\u041D\u0435\u0437\u0430\u043C\u0435\u0440\u0437\u0430\u0439\u043A\u0430', '\u0422\u0440\u044F\u043F\u043A\u0438',
      '\u041F\u0435\u0440\u0447\u0430\u0442\u043A\u0438', '\u0421\u043A\u043E\u0442\u0447',
      '\u0421\u0442\u044F\u0436\u043A\u0438', 'WD-40',
      '\u0410\u043F\u0442\u0435\u0447\u043A\u0430 \u043B\u0438\u0447\u043D\u0430\u044F', 'Powerbank',
      '\u0422\u0435\u0440\u043C\u043E\u0441', '\u0421\u043F\u0430\u043B\u044C\u043D\u0438\u043A',
    ],
  },
]

const MAP_FILTERS = [
  { key: 'all', label: '\u0412\u0441\u0435' },
  { key: 'fuel', label: '\u26FD\uFE0F' },
  { key: 'sto', label: '\uD83D\uDD27' },
  { key: 'parking', label: '\uD83C\uDD7F\uFE0F' },
  { key: 'food', label: '\uD83C\uDF7D' },
]

const DOCUMENTS = [
  { key: 'license', icon: '\uD83D\uDCB3', label: '\u041F\u0440\u0430\u0432\u0430' },
  { key: 'sts', icon: '\uD83D\uDE9A', label: '\u0421\u0422\u0421' },
  { key: 'osago', icon: '\uD83D\uDEE1', label: '\u041E\u0421\u0410\u0413\u041E' },
  { key: 'kasko', icon: '\uD83D\uDD12', label: '\u041A\u0410\u0421\u041A\u041E' },
  { key: 'contract', icon: '\uD83D\uDCC3', label: '\u0414\u043E\u0433\u043E\u0432\u043E\u0440' },
  { key: 'pts', icon: '\uD83D\uDCD8', label: '\u041F\u0422\u0421' },
]

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

export default function Service({ userId }) {
  const [activeTab, setActiveTab] = useState('service')
  const [checkedItems, setCheckedItems] = useState({})
  const [mapFilter, setMapFilter] = useState('all')
  const [repairs, setRepairs] = useState([])
  const [insurance, setInsurance] = useState([])
  const [routeNotes, setRouteNotes] = useState([])
  const [odometer, setOdometer] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const [serviceRecs, insuranceRecs, notes] = await Promise.all([
        fetchServiceRecords(userId).catch(() => []),
        fetchInsurance(userId).catch(() => []),
        fetchRouteNotes(userId).catch(() => []),
      ])
      setRepairs(serviceRecs)
      setInsurance(insuranceRecs)
      setRouteNotes(notes)

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

  const filteredNotes = mapFilter === 'all'
    ? routeNotes
    : routeNotes.filter(n => n.type === mapFilter)

  return (
    <div style={{ padding: '16px', minHeight: '100vh', backgroundColor: 'var(--bg)', paddingBottom: '80px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: activeTab === t.key
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'var(--card)',
              color: activeTab === t.key ? '#000' : 'var(--dim)',
              border: activeTab === t.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'service' && <ServiceTab repairs={repairs} insurance={insurance} odometer={odometer} loading={loading} />}
      {activeTab === 'tires' && <TiresTab userId={userId} odometer={odometer} />}
      {activeTab === 'checklist' && (
        <ChecklistTab
          checkedItems={checkedItems}
          toggleCheck={toggleCheck}
          getCheckedCount={getCheckedCount}
        />
      )}
      {activeTab === 'map' && (
        <MapTab
          mapFilter={mapFilter}
          setMapFilter={setMapFilter}
          filteredNotes={filteredNotes}
          totalNotes={routeNotes.length}
          loading={loading}
        />
      )}
      {activeTab === 'docs' && <DocsTab userId={userId} />}
    </div>
  )
}

/* ===== SERVICE TAB ===== */
function ServiceTab({ repairs, insurance, odometer, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
      </div>
    )
  }

  const totalRepair = repairs.reduce((s, r) => s + (r.cost || 0), 0)
  const today = new Date()

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{'\u0420\u0435\u043C\u043E\u043D\u0442'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>
            {totalRepair.toLocaleString('ru-RU')} {'\u20BD'}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{'\u041E\u0434\u043E\u043C\u0435\u0442\u0440'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
            {odometer ? odometer.toLocaleString('ru-RU') : '\u2014'} {'\u043A\u043C'}
          </div>
        </div>
      </div>

      {/* Repair history */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {'\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432'}
      </div>
      {repairs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {'\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043E \u0440\u0435\u043C\u043E\u043D\u0442\u0435'}
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
                  {r.description || r.name || '\u0420\u0435\u043C\u043E\u043D\u0442'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                  {r.date || ''} {r.odometer ? `\u00b7 ${r.odometer.toLocaleString('ru-RU')} \u043A\u043C` : ''} {r.place ? `\u00b7 ${r.place}` : ''}
                </div>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444', flexShrink: 0 }}>
                {(r.cost || 0).toLocaleString('ru-RU')} {'\u20BD'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insurance */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {'\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0438'}
      </div>
      {insurance.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {'\u041D\u0435\u0442 \u0441\u0442\u0440\u0430\u0445\u043E\u0432\u043E\u043A'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {insurance.map((ins, i) => {
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
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{ins.type || '\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0430'}</div>
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
                      {daysLeft > 0 ? `${daysLeft} \u0434\u043D` : '\u0418\u0441\u0442\u0435\u043A\u043B\u0430'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ===== TIRES TAB ===== */
function TiresTab({ userId, odometer }) {
  const [tires, setTires] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTire, setEditTire] = useState(null)

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
    if (!confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0448\u0438\u043D\u0443?')) return
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
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...'}
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
        {'+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0448\u0438\u043D\u0443'}
      </button>

      {tires.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {'\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043E \u0448\u0438\u043D\u0430\u0445'}
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
                        {'\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430: '}{formatDate(tire.installed_at)}
                        {tire.installed_odometer ? ` \u00b7 \u041F\u0440\u043E\u0431\u0435\u0433: ${tire.installed_odometer.toLocaleString('ru-RU')} \u043A\u043C` : ''}
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
                      {'\u041F\u0440\u043E\u0435\u0445\u0430\u043B\u0430: '}{kmDriven.toLocaleString('ru-RU')}{' \u043A\u043C'}
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
      alert('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F')
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
            {tire ? '\u270F\uFE0F \u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0438\u043D\u0443' : '\uD83D\uDEDE \u041D\u043E\u0432\u0430\u044F \u0448\u0438\u043D\u0430'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>{'\u2715'}</button>
        </div>

        {/* Brand */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{'\u041C\u0430\u0440\u043A\u0430 \u0448\u0438\u043D\u044B *'}</div>
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
          <div style={labelStyle}>{'\u041C\u043E\u0434\u0435\u043B\u044C (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)'}</div>
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
          <div style={labelStyle}>{'\u041F\u043E\u0437\u0438\u0446\u0438\u044F'}</div>
          <select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}>
            {TIRE_POSITIONS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Installed date */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{'\u0414\u0430\u0442\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438'}</div>
          <input type="date" value={installedAt} onChange={e => setInstalledAt(e.target.value)} style={inputStyle} />
        </div>

        {/* Installed odometer */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{'\u041F\u0440\u043E\u0431\u0435\u0433 \u043F\u0440\u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 (\u043A\u043C)'}</div>
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
          <div style={labelStyle}>{'\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435'}</div>
          <select value={condition} onChange={e => setCondition(e.target.value)} style={inputStyle}>
            {TIRE_CONDITIONS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Cost */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{'\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)'}</div>
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
          <div style={labelStyle}>{'\u0417\u0430\u043C\u0435\u0442\u043A\u0438 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)'}</div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={'\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043A\u0443\u043F\u043B\u0435\u043D\u0430 \u0432 \u0410\u0432\u0442\u043E\u0414\u043E\u043A'}
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
          {saving ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
        </button>
      </div>
    </div>
  )
}

/* ===== CHECKLIST TAB ===== */
function ChecklistTab({ checkedItems, toggleCheck, getCheckedCount }) {
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
            ? '\u041F\u0414\u0414: \u0412\u0441\u0451 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435'
            : `\u041F\u0414\u0414: ${pddChecked}/${pddTotal} \u0415\u0441\u0442\u044C \u043D\u0435\u0445\u0432\u0430\u0442\u043A\u0430!`
          }
        </div>
      </div>
    </>
  )
}

/* ===== MAP TAB ===== */
function MapTab({ mapFilter, setMapFilter, filteredNotes, totalNotes, loading }) {
  const TYPE_ICONS = { fuel: '\u26FD\uFE0F', sto: '\uD83D\uDD27', parking: '\uD83C\uDD7F\uFE0F', food: '\uD83C\uDF7D' }

  return (
    <>
      {/* Map placeholder */}
      <div style={{
        ...cardStyle, height: '200px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--card), var(--card2))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.08,
          background: 'repeating-linear-gradient(0deg, var(--border), var(--border) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, var(--border), var(--border) 1px, transparent 1px, transparent 20px)',
        }} />
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>{'\uD83D\uDDFA'}</div>
          <div style={{ fontSize: '14px', color: 'var(--dim)' }}>{'\u041A\u0430\u0440\u0442\u0430 \u0437\u0430\u043C\u0435\u0442\u043E\u043A'}</div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>Leaflet &middot; {'\u0441\u043A\u043E\u0440\u043E'}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {MAP_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setMapFilter(f.key)}
            style={{
              background: mapFilter === f.key
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'var(--card)',
              color: mapFilter === f.key ? '#000' : 'var(--dim)',
              border: mapFilter === f.key ? 'none' : '1px solid var(--border)',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {'\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0442\u043E\u043A'}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, marginBottom: '16px' }}>
          {filteredNotes.map((note, i) => (
            <div
              key={note.id || i}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                width: '40px', height: '40px', backgroundColor: 'var(--card2)',
                borderRadius: '10px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px', flexShrink: 0,
              }}>
                {TYPE_ICONS[note.type] || '\uD83D\uDCCD'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {note.name || note.title || '\u0417\u0430\u043C\u0435\u0442\u043A\u0430'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
                  {note.description || note.desc || ''}
                </div>
              </div>
              {note.rating && (
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <span key={s} style={{ fontSize: '12px', color: s <= note.rating ? '#f59e0b' : 'var(--border)' }}>
                      {'\u2605'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats banner */}
      <div style={{
        ...cardStyle,
        background: 'linear-gradient(135deg, #f59e0b10, #d9770610)',
        border: '1px solid #f59e0b30',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', color: '#f59e0b' }}>{totalNotes}</div>
        <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
          {'\u0432\u0430\u0448\u0438\u0445 \u0437\u0430\u043C\u0435\u0442\u043E\u043A'}
        </div>
      </div>
    </>
  )
}

/* ===== DOCS TAB ===== */

const PHOTO_TYPES = [
  { key: 'inspection', label: '\u041E\u0441\u043C\u043E\u0442\u0440' },
  { key: 'damage', label: '\u041F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435' },
  { key: 'before', label: '\u0414\u043E' },
  { key: 'after', label: '\u041F\u043E\u0441\u043B\u0435' },
]

const PHOTO_TYPE_LABELS = {
  inspection: '\u041E\u0441\u043C\u043E\u0442\u0440',
  damage: '\u041F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435',
  before: '\u0414\u043E',
  after: '\u041F\u043E\u0441\u043B\u0435',
}

function DocsTab({ userId }) {
  const [vehiclePhotos, setVehiclePhotos] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)

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

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  const handleDelete = async (photo) => {
    if (!confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u043E\u0442\u043E?')) return
    try {
      await deleteVehiclePhoto(photo.id, photo.photo_url)
      setVehiclePhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      console.error('deleteVehiclePhoto error:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <>
      {/* Document archive */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
        {'\u0424\u043E\u0442\u043E-\u0430\u0440\u0445\u0438\u0432 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {DOCUMENTS.map(doc => (
          <div
            key={doc.key}
            style={{
              ...cardStyle,
              textAlign: 'center',
              padding: '20px 12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>{doc.icon}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{doc.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>
              {'\u041D\u0435\u0442 \u0444\u043E\u0442\u043E'}
            </div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        ...cardStyle, marginTop: '16px',
        background: '#3b82f615', border: '1px solid #3b82f630',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '20px' }}>{'\uD83D\uDCF7'}</span>
        <div style={{ fontSize: '13px', color: 'var(--dim)' }}>
          {'\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E, \u0447\u0442\u043E\u0431\u044B \u0441\u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442'}
        </div>
      </div>

      {/* Vehicle inspection photos section */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '24px', marginBottom: '12px' }}>
        {'\u0424\u043E\u0442\u043E \u043F\u0440\u0438\u0451\u043C\u043A\u0438 \u043C\u0430\u0448\u0438\u043D\u044B'}
      </div>

      <button
        onClick={() => setShowAddModal(true)}
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
        {'\uD83D\uDCF7 \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0444\u043E\u0442\u043E \u043F\u0440\u0438\u0451\u043C\u043A\u0438'}
      </button>

      {/* Photo gallery */}
      {loadingPhotos ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...'}
        </div>
      ) : vehiclePhotos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {'\u041D\u0435\u0442 \u0444\u043E\u0442\u043E \u043F\u0440\u0438\u0451\u043C\u043A\u0438'}
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
                onClick={(e) => { e.stopPropagation(); handleDelete(photo) }}
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
      {showAddModal && (
        <VehiclePhotoModal
          userId={userId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadPhotos() }}
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

/* ===== VEHICLE PHOTO MODAL ===== */
function VehiclePhotoModal({ userId, onClose, onSaved }) {
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
        await uploadVehiclePhoto(userId, null, p.file, photoType, '', notes)
      }
      photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      onSaved()
    } catch (err) {
      console.error('save vehicle photo error:', err)
      alert('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F')
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
            {'\uD83D\uDE9A \u0424\u043E\u0442\u043E \u043F\u0440\u0438\u0451\u043C\u043A\u0438'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>{'\u2715'}</button>
        </div>

        {/* Photo type select */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {'\u0422\u0438\u043F \u0444\u043E\u0442\u043E'}
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
            {PHOTO_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--dim)', fontSize: '12px', marginBottom: '6px' }}>
            {'\u0417\u0430\u043C\u0435\u0442\u043A\u0438 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)'}
          </div>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={'\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0446\u0430\u0440\u0430\u043F\u0438\u043D\u0430 \u043D\u0430 \u043B\u0435\u0432\u043E\u043C \u043A\u0440\u044B\u043B\u0435'}
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
            {'\u0424\u043E\u0442\u043E (' + photos.length + '/' + maxPhotos + ')'}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={inputStyle} onChange={handleFiles} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={inputStyle} onChange={handleFiles} />
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && cameraRef.current?.click()}>
              {'\uD83D\uDCF7 \u0421\u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0440\u043E\u0432\u0430\u0442\u044C'}
            </button>
            <button type="button" style={btnPhotoStyle} onClick={() => photos.length < maxPhotos && galleryRef.current?.click()}>
              {'\uD83D\uDDBC\uFE0F \u0418\u0437 \u0433\u0430\u043B\u0435\u0440\u0435\u0438'}
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
          {saving ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
        </button>
      </div>
    </div>
  )
}
