import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchServiceRecords, fetchInsurance, fetchVehicles, addServiceRecord, uploadVehiclePhoto, deleteVehiclePhoto, getTireRecords, getTireRecordsByVehicle, addTireRecord, updateTireRecord, deleteTireRecord, uploadDocument, getDocuments, deleteDocument } from '../lib/api'
import DVIRInspection from '../components/DVIRInspection'
import TrailerInspectionContent from '../components/TrailerInspection'
import IncidentsContent from '../components/IncidentsSection'
import BookkeepingHome from '../components/BookkeepingHome'
import { supabase } from '../lib/supabase'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'
import { exportToExcel } from '../utils/export'
import { validateAndCompressFile, interpolate } from '../lib/fileUtils'

const ELD_COUNTRIES = ['US','CA','DE','FR','PL','GB','NL','BE','AT','CZ','SK','IT','ES','SE','DK','FI','NO','HU','RO','BG','HR','LT','LV','EE','SI','IE','PT','GR','LU']

function getUserCountry() {
  try { return localStorage.getItem('truckerbook_country') || 'RU' } catch { return 'RU' }
}

function getSubTabs(t, userRole) {
  const country = getUserCountry()
  const showDVIR = !ELD_COUNTRIES.includes(country)
  const tabs = [
    { key: 'service', label: '\uD83D\uDD27 ' + t('service.service') },
    { key: 'tires', label: '\uD83D\uDEDE ' + t('service.tires') },
  ]
  if (userRole !== 'company') {
    tabs.push({ key: 'checklist', label: '\u2705 ' + t('service.checklist') })
  }
  if (showDVIR) {
    tabs.push({ key: 'dvir', label: '\uD83D\uDD0D ' + t('service.inspection') })
  }
  return tabs
}

function getTirePositions(t) {
  return [
    { key: 'FL', label: 'FL \u2014 ' + t('service.frontLeft') },
    { key: 'FR', label: 'FR \u2014 ' + t('service.frontRight') },
    { key: 'RL1', label: 'RL1 \u2014 ' + t('service.rearLeftOuter') },
    { key: 'RL2', label: 'RL2 \u2014 ' + t('service.rearLeftInner') },
    { key: 'RR1', label: 'RR1 \u2014 ' + t('service.rearRightOuter') },
    { key: 'RR2', label: 'RR2 \u2014 ' + t('service.rearRightInner') },
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

export default function Service({ userId, activeVehicleId, userRole, profile }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('service')
  const [checkedItems, setCheckedItems] = useState({})
  const [repairs, setRepairs] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [odometer, setOdometer] = useState(null)
  const [profilePlate, setProfilePlate] = useState('')
  const [profileBrand, setProfileBrand] = useState('')
  const [profileModel, setProfileModel] = useState('')
  const [profileDriverName, setProfileDriverName] = useState('')
  const [loading, setLoading] = useState(true)

  const SUB_TABS = getSubTabs(t, userRole)

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const serviceRecs = await fetchServiceRecords(userId).catch(() => [])
      setRepairs(serviceRecs)

      if (userRole === 'company') {
        const vehs = await fetchVehicles(userId).catch(() => [])
        setVehicles(vehs)
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('odometer, plate_number, brand, model, name')
        .eq('id', userId)
        .single()
      if (profile?.odometer) setOdometer(profile.odometer)
      if (profile?.plate_number) setProfilePlate(profile.plate_number)
      if (profile?.brand) setProfileBrand(profile.brand)
      if (profile?.model) setProfileModel(profile.model)
      if (profile?.name) setProfileDriverName(profile.name)
    } catch (err) {
      console.error('Service loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, userRole])

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

      {activeTab === 'service' && (
        <ServiceTab
          repairs={repairs}
          odometer={odometer}
          loading={loading}
          userRole={userRole}
          vehicles={vehicles}
          profilePlate={profilePlate}
          userId={userId}
          onReload={loadData}
        />
      )}
      {activeTab === 'tires' && (
        <TiresTab
          userId={userId}
          odometer={odometer}
          userRole={userRole}
          vehicles={vehicles}
          profilePlate={profilePlate}
          profileBrand={profileBrand}
          profileModel={profileModel}
          profileDriverName={profileDriverName}
        />
      )}
      {activeTab === 'checklist' && (
        <ChecklistTab
          checkedItems={checkedItems}
          toggleCheck={toggleCheck}
          getCheckedCount={getCheckedCount}
        />
      )}
      {activeTab === 'docs' && <DocsTab userId={userId} vehicleId={activeVehicleId} userRole={userRole} vehicles={vehicles} profile={profile} />}
      {activeTab === 'dvir' && <DVIRInspection userId={userId} vehicleId={activeVehicleId} />}
    </div>
  )
}

function getServiceCategoryMap(t) {
  return {
    repair: { label: t('service.catRepair'), icon: '\uD83D\uDD27' },
    oil_change: { label: t('service.catOilChange'), icon: '\uD83D\uDEE2\uFE0F' },
    maintenance: { label: t('service.catMaintenance'), icon: '\uD83D\uDEE0\uFE0F' },
    filters: { label: t('service.catFilters'), icon: '\uD83C\uDF2C\uFE0F' },
    brakes: { label: t('service.catBrakes'), icon: '\uD83D\uDED1' },
    electrical: { label: t('service.catElectrical'), icon: '\u26A1' },
    bodywork: { label: t('service.catBodywork'), icon: '\uD83D\uDE97' },
    diagnostics: { label: t('service.catDiagnostics'), icon: '\uD83D\uDD0D' },
    belts_chains: { label: t('service.catBeltsChains'), icon: '\u26D3\uFE0F' },
    engine: { label: t('service.catEngine'), icon: '\u2699\uFE0F' },
    transmission: { label: t('service.catTransmission'), icon: '\uD83D\uDD29' },
    suspension: { label: t('service.catSuspension'), icon: '\uD83D\uDEDE' },
    exhaust: { label: t('service.catExhaust'), icon: '\uD83D\uDCA8' },
    repair_other: { label: t('service.catRepairOther'), icon: '\uD83D\uDCE6' },
    coolant: { label: t('service.catCoolant'), icon: '\u2744\uFE0F' },
    brake_pads: { label: t('service.catBrakePads'), icon: '\uD83D\uDED1' },
    spark_plugs: { label: t('service.catSparkPlugs'), icon: '\uD83D\uDD0C' },
    maintenance_other: { label: t('service.catMaintenanceOther'), icon: '\uD83D\uDCE6' },
  }
}

const REPAIR_CATEGORIES = ['engine', 'transmission', 'brakes', 'electrical', 'bodywork', 'suspension', 'exhaust', 'repair_other', 'repair']
const MAINTENANCE_CATEGORIES = ['oil_change', 'filters', 'belts_chains', 'coolant', 'diagnostics', 'brake_pads', 'spark_plugs', 'maintenance', 'maintenance_other']

function getDateRange(period, customFrom, customTo) {
  const now = new Date()
  let from, to
  if (period === 'week') {
    from = new Date(now)
    from.setDate(from.getDate() - 7)
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'custom' && customFrom) {
    from = new Date(customFrom)
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  to = (period === 'custom' && customTo) ? new Date(customTo + 'T23:59:59') : now
  return { from, to }
}

/* ===== SERVICE TAB ===== */
function ServiceTab({ repairs, odometer, loading, userRole, vehicles, profilePlate, userId, onReload }) {
  const { t } = useLanguage()
  const [activeTile, setActiveTile] = useState(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)

  const isCompany = userRole === 'company'

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
        {t('common.loading')}
      </div>
    )
  }

  // Tiles grid (main screen)
  if (!activeTile) {
    const TILES = [
      { key: 'repair', icon: '\uD83D\uDD27', label: t('service.tileRepair'), desc: t('service.tileRepairDesc') },
      { key: 'maintenance', icon: '\uD83D\uDEE0\uFE0F', label: t('service.tileMaintenance'), desc: t('service.tileMaintenanceDesc') },
    ]
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {TILES.map(tile => (
          <div
            key={tile.key}
            onClick={() => { setActiveTile(tile.key); setSelectedVehicleId(null) }}
            style={{
              ...cardStyle,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 12px',
              minHeight: '110px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{tile.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{tile.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>{tile.desc}</div>
          </div>
        ))}
      </div>
    )
  }

  // Company: vehicle selection screen
  if (isCompany && !selectedVehicleId) {
    return (
      <>
        <button
          onClick={() => setActiveTile(null)}
          style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '14px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}
        >
          {t('service.backToTiles')}
        </button>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
          {t('service.chooseVehicle')}
        </div>
        {(vehicles || []).map(v => (
          <div
            key={v.id}
            onClick={() => setSelectedVehicleId(v.id)}
            style={{ ...cardStyle, cursor: 'pointer', padding: '14px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <div style={{ width: 44, height: 44, backgroundColor: 'var(--card2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: 'linear-gradient(135deg, #f59e0b22, #d9770622)' }}>
              {'\uD83D\uDE9B'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[v.brand, v.model].filter(Boolean).join(' ') || v.id.slice(0, 8)}{v.plate_number ? ` \u00b7 ${v.plate_number}` : ''}
              </div>
              {v.driver_name && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 3 }}>
                  {t('service.driverLabel')}: {v.driver_name}
                </div>
              )}
            </div>
            <div style={{ fontSize: 18, color: 'var(--dim)', flexShrink: 0 }}>{'\u203A'}</div>
          </div>
        ))}
      </>
    )
  }

  // Content view (repair or maintenance list)
  const allowedCats = activeTile === 'repair' ? REPAIR_CATEGORIES : MAINTENANCE_CATEGORIES
  return (
    <ServiceListView
      repairs={repairs}
      odometer={odometer}
      userRole={userRole}
      vehicles={vehicles}
      profilePlate={profilePlate}
      userId={userId}
      allowedCategories={allowedCats}
      tileKey={activeTile}
      selectedVehicleId={selectedVehicleId}
      onBack={() => {
        if (isCompany) { setSelectedVehicleId(null) }
        else { setActiveTile(null) }
      }}
      onReload={onReload}
    />
  )
}

/* ===== SERVICE LIST VIEW (shared for Repair / Maintenance) ===== */
function ServiceListView({ repairs, odometer, userRole, vehicles, profilePlate, userId, allowedCategories, tileKey, selectedVehicleId, onBack, onReload }) {
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const distUnit = unitSys === 'imperial' ? 'mi' : t('trips.km')

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAllRecords, setShowAllRecords] = useState(false)

  const isCompany = userRole === 'company'
  const isDriver = userRole === 'driver'
  const catMap = getServiceCategoryMap(t)

  const isRepair = tileKey === 'repair'
  const historyLabel = isRepair ? t('service.repairHistory') : t('service.maintenanceHistory')
  const noRecordsLabel = isRepair ? t('service.noRepairRecords') : t('service.noMaintenanceRecords')
  const addLabel = isRepair ? t('service.addRepair') : t('service.addMaintenance')

  // Build vehicle lookup
  const vehMap = {}
  ;(vehicles || []).forEach(v => { vehMap[v.id] = v })
  const getVehicleLabel = (vid) => {
    const v = vehMap[vid]
    if (!v) return ''
    return `${v.brand || ''} ${v.model || ''} ${v.plate_number || ''}`.trim()
  }

  // Filter by allowed categories + period + vehicle
  const { from: dateFrom, to: dateTo } = getDateRange(period, customFrom, customTo)
  const filteredRepairs = repairs.filter(r => {
    if (!r.date) return false
    if (!allowedCategories.includes(r.category)) return false
    const d = new Date(r.date)
    if (d < dateFrom || d > dateTo) return false
    if (isCompany && selectedVehicleId && r.vehicle_id !== selectedVehicleId) return false
    return true
  })

  const totalCost = filteredRepairs.reduce((s, r) => s + (r.cost || 0), 0)

  // Export
  const handleExport = async () => {
    const now2 = new Date()
    const ym = `${String(now2.getMonth() + 1).padStart(2, '0')}_${now2.getFullYear()}`
    const prefix = isRepair ? 'repair' : 'maintenance'

    let plate = ''
    if (isCompany && selectedVehicleId) {
      const v = vehMap[selectedVehicleId]
      plate = v ? (v.plate_number || '').replace(/\s/g, '_') : ''
    } else {
      plate = (profilePlate || '').replace(/\s/g, '_')
    }
    const columns = [
      { header: t('fuel.exportDate'), key: 'date' },
      { header: t('service.categoryLabel'), key: 'category' },
      { header: t('service.descriptionWork'), key: 'description' },
      { header: `${t('fuel.exportAmount')} (${cs})`, key: 'amount' },
      { header: `${t('service.odometer')} (${distUnit})`, key: 'odometer' },
      { header: t('service.stoLabel'), key: 'sto' },
      { header: t('service.receiptPhoto'), key: 'receipt' },
    ]
    const rows = filteredRepairs.map(r => ({
      date: r.date || '', category: (catMap[r.category] || catMap.repair).label,
      description: r.description || '', amount: Math.round(r.cost || 0),
      odometer: r.odometer || '', sto: r.service_station || '',
      receipt: r.receipt_url ? { text: t('service.downloadReceipt'), hyperlink: r.receipt_url } : '',
    }))
    rows.push({ date: '', category: '', description: t('service.totalLabel'), amount: Math.round(totalCost), odometer: '', sto: '', receipt: '' })
    const fn = plate ? `${prefix}_${plate}_${ym}.xlsx` : `${prefix}_report_${ym}.xlsx`
    await exportToExcel(rows, columns, fn)
  }

  const periodBtnStyle = (active) => ({
    padding: '6px 12px', borderRadius: '8px',
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--card)',
    color: active ? '#000' : 'var(--dim)', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <>
      {/* Back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '14px', cursor: 'pointer', padding: 0 }}
        >
          {t('service.backToTiles')}
        </button>
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={periodBtnStyle(period === 'week')} onClick={() => setPeriod('week')}>
          {t('service.periodWeek')}
        </button>
        <button style={periodBtnStyle(period === 'month')} onClick={() => setPeriod('month')}>
          {t('service.periodMonth')}
        </button>
        <button style={periodBtnStyle(period === 'custom')} onClick={() => setPeriod('custom')}>
          {t('service.periodCustom')}
        </button>
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <span style={{ color: 'var(--dim)', fontSize: '12px' }}>{t('service.fromDate')}</span>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '13px' }} />
          <span style={{ color: 'var(--dim)', fontSize: '12px' }}>{t('service.toDate')}</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '13px' }} />
        </div>
      )}

      {/* Export button (not for driver role) */}
      {!isDriver && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button onClick={handleExport}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {'\uD83D\uDCE5'} {t('fuel.exportExcel')}
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{t('service.totalCost')}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>
            {totalCost.toLocaleString('en-US')} {cs}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>{t('service.odometer')}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
            {(() => {
              const maxOdo = filteredRepairs.reduce((max, r) => r.odometer > max ? r.odometer : max, 0)
              return maxOdo ? maxOdo.toLocaleString('en-US') : '\u2014'
            })()} {distUnit}
          </div>
        </div>
      </div>

      {/* Add button — moved above history */}
      <button
        onClick={() => setShowAddModal(true)}
        style={{
          width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000',
          fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '16px',
        }}
      >
        {addLabel}
      </button>

      {/* History list */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {historyLabel}
      </div>
      {filteredRepairs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14, marginBottom: '16px' }}>
          {noRecordsLabel}
        </div>
      ) : (
        <>
          <div style={{ ...cardStyle, padding: 0, marginBottom: filteredRepairs.length > 3 ? '8px' : '16px' }}>
            {(showAllRecords ? filteredRepairs : filteredRepairs.slice(0, 3)).map((r, i) => {
              const cat = catMap[r.category] || catMap.repair
              return (
                <div key={r.id || i}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--card2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                    {cat.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.label}{r.description ? ` \u2014 ${r.description}` : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                      {r.date || ''}
                      {r.odometer ? ` \u00b7 ${r.odometer.toLocaleString('en-US')} ${distUnit}` : ''}
                      {r.service_station ? ` \u00b7 ${r.service_station}` : ''}
                      {isCompany && r.vehicle_id ? ` \u00b7 ${getVehicleLabel(r.vehicle_id)}` : ''}
                    </div>
                    {r.receipt_url && (
                      <div style={{ marginTop: '6px' }}>
                        <img
                          src={r.receipt_url}
                          alt={t('service.receiptPhoto') || 'Receipt'}
                          onClick={() => window.open(r.receipt_url, '_blank')}
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer' }}
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#ef4444', flexShrink: 0 }}>
                    {(r.cost || 0).toLocaleString('en-US')} {cs}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredRepairs.length > 3 && (
            <button
              onClick={() => setShowAllRecords(!showAllRecords)}
              style={{
                width: '100%', padding: '10px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--dim)', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', marginBottom: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {showAllRecords
                ? `${t('service.hideRecords')} \u25B2`
                : `${t('service.showAll')} (${filteredRepairs.length}) \u25BC`}
            </button>
          )}
        </>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddServiceModal
          tileKey={tileKey}
          userId={userId}
          vehicles={vehicles}
          userRole={userRole}
          selectedVehicleId={selectedVehicleId}
          profilePlate={profilePlate}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); if (onReload) onReload() }}
        />
      )}
    </>
  )
}

/* ===== ADD SERVICE MODAL ===== */
function AddServiceModal({ tileKey, userId, vehicles, userRole, selectedVehicleId, profilePlate, onClose, onSaved }) {
  const { t } = useLanguage()
  const cs = getCurrencySymbol()
  const unitSys = getUnits()
  const distUnit = unitSys === 'imperial' ? 'mi' : t('trips.km')
  const catMap = getServiceCategoryMap(t)

  const isRepair = tileKey === 'repair'
  const categories = isRepair ? REPAIR_CATEGORIES : MAINTENANCE_CATEGORIES

  const [category, setCategory] = useState(categories[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [odometerVal, setOdometerVal] = useState('')
  const [cost, setCost] = useState('')
  const [sto, setSto] = useState('')
  const [nextKm, setNextKm] = useState('')
  const [photos, setPhotos] = useState([])
  const [vehicleId, setVehicleId] = useState(selectedVehicleId || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const fileRef = useRef(null)

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (photos.length + files.length > 3) return
    const validFiles = []
    for (const f of files) {
      try {
        const result = await validateAndCompressFile(f, userId)
        if (result.ok && result.file) {
          validFiles.push(result.file)
        } else {
          console.error('Photo validation failed:', result.errorKey, result.errorParams)
          alert(interpolate(t(result.errorKey || 'fileUpload.invalidType'), result.errorParams))
        }
      } catch (err) {
        console.error('Photo validation exception:', err)
        alert('Photo error: ' + (err.message || String(err)))
      }
    }
    setPhotos(prev => [...prev, ...validFiles].slice(0, 3))
  }

  const removePhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!category || !date) return
    setSaving(true)
    setSaveError('')
    try {
      let receiptUrl = null

      // Upload first photo as receipt if present
      if (photos.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const file = photos[0]
            const ext = file.name?.split('.').pop() || 'jpg'
            const veh = vehicles?.find(v => v.id === vehicleId)
            const plateName = (veh?.plate_number || '').replace(/\s/g, '') || 'noplate'
            const costStr = String(cost || '0')
            const dateStr = new Date().toISOString().slice(0, 10)
            const catStr = category || 'other'
            const path = `${user.id}/receipts/${dateStr}-${plateName}-${catStr}-${costStr}-${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type || 'image/jpeg' })
            if (upErr) {
              console.error('Service photo upload error:', JSON.stringify(upErr))
            } else {
              const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
              receiptUrl = urlData?.publicUrl || null
            }
          }
        } catch (uploadErr) {
          console.error('Photo upload exception:', uploadErr)
        }
      }

      // Insert record with receipt_url
      const result = await addServiceRecord({
        vehicle_id: vehicleId || null,
        category,
        name: description,
        amount: cost,
        odometer: odometerVal,
        date,
        sto,
        receipt_url: receiptUrl,
      })

      // Safety: if photo was uploaded but receipt_url might not have saved, update explicitly
      if (receiptUrl && result && result[0]?.id) {
        const recordId = result[0].id
        await supabase
          .from('service_records')
          .update({ receipt_url: receiptUrl })
          .eq('id', recordId)
      }

      if (onSaved) onSaved()
    } catch (err) {
      console.error('Save service record error:', err)
      const msg = err?.message || ''
      if (msg.includes('relation') && msg.includes('does not exist')) {
        setSaveError('Table service_records not found in Supabase. See SQL in console.')
      } else if (msg.includes('violates row-level security') || msg.includes('RLS')) {
        setSaveError('Access error (RLS). Check table policies.')
      } else {
        setSaveError(t('service.saveError'))
      }
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px', paddingBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
            {isRepair ? t('service.addRepair') : t('service.addMaintenance')}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '22px', cursor: 'pointer' }}>{'\u2715'}</button>
        </div>

        {/* Vehicle is always pre-selected */}

        {/* Category */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.selectCategory')}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}>
            {categories.map(c => {
              const cat = catMap[c]
              return cat ? <option key={c} value={c}>{cat.icon} {cat.label}</option> : null
            })}
          </select>
        </div>

        {/* Date */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.dateLabel')}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>
            {isRepair ? t('service.descriptionWork') : t('service.descriptionOptional')}
          </label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {/* Odometer */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.odometerAtService')} ({distUnit})</label>
          <input type="number" value={odometerVal} onChange={e => setOdometerVal(e.target.value)} style={inputStyle} />
        </div>

        {/* Cost */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.costLabel')} ({cs})</label>
          <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={inputStyle} />
        </div>

        {/* Service station */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.serviceStationLabel')} ({t('service.optional')})</label>
          <input type="text" value={sto} onChange={e => setSto(e.target.value)} style={inputStyle} />
        </div>

        {/* Next maintenance km (maintenance only) */}
        {!isRepair && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.nextMaintenanceKm')} ({t('service.optional')})</label>
            <input type="number" value={nextKm} onChange={e => setNextKm(e.target.value)} style={inputStyle} />
          </div>
        )}

        {/* Receipt photos */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '4px', display: 'block' }}>{t('service.receiptPhotos')}</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img src={URL.createObjectURL(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removePhoto(i)}
                  style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {'\u2715'}
                </button>
              </div>
            ))}
            {photos.length < 3 && (
              <div onClick={() => fileRef.current?.click()}
                style={{ width: 64, height: 64, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--dim)', fontSize: 24 }}>
                +
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoChange} />
        </div>

        {/* Error message */}
        {saveError && (
          <div style={{ padding: '10px 12px', marginBottom: '12px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '13px' }}>
            {saveError}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            {t('service.cancelRecord')}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t('service.saving') || '...' : t('service.saveRecord')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===== TIRES TAB ===== */

function TiresTab({ userId, odometer, userRole, vehicles, profilePlate, profileBrand, profileModel, profileDriverName }) {
  const { t } = useLanguage()
  const isCompany = userRole === 'company'
  const isOwnerOp = userRole === 'owner_operator'
  const isSchemaView = isCompany || isOwnerOp

  const [tires, setTires] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTire, setEditTire] = useState(null)
  const [editPosition, setEditPosition] = useState(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)

  const TIRE_POSITIONS = getTirePositions(t)
  const TIRE_CONDITIONS = getTireConditions(t)
  const TIRE_POSITION_LABELS = Object.fromEntries(TIRE_POSITIONS.map(p => [p.key, p.label]))
  const TIRE_CONDITION_MAP = Object.fromEntries(TIRE_CONDITIONS.map(c => [c.key, c]))

  // For company: set first vehicle as default
  useEffect(() => {
    if (isCompany && vehicles?.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vehicles[0].id)
    }
  }, [isCompany, vehicles, selectedVehicleId])

  const selectedVehicle = isCompany
    ? vehicles?.find(v => v.id === selectedVehicleId) || null
    : null

  const currentOdometer = isCompany
    ? (selectedVehicle?.odometer || 0)
    : (odometer || 0)

  const loadTires = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      if (isCompany && selectedVehicleId) {
        const data = await getTireRecordsByVehicle(selectedVehicleId)
        setTires(data)
      } else {
        const data = await getTireRecords(userId)
        setTires(data)
      }
    } catch (err) {
      console.error('loadTires error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, isCompany, selectedVehicleId])

  useEffect(() => {
    loadTires()
  }, [loadTires])

  const handleDelete = async (id) => {
    if (!confirm(t('service.deleteTire'))) return
    try {
      await deleteTireRecord(id)
      setTires(prev => prev.filter(tr => tr.id !== id))
    } catch (err) {
      console.error('deleteTire error:', err)
    }
  }

  const handleEdit = (tire) => {
    setEditTire(tire)
    setEditPosition(null)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditTire(null)
    setEditPosition(null)
    setShowModal(true)
  }

  const handlePositionClick = (posKey) => {
    const existing = tires.find(tr => tr.position === posKey)
    if (existing) {
      setEditTire(existing)
      setEditPosition(null)
    } else {
      setEditTire(null)
      setEditPosition(posKey)
    }
    setShowModal(true)
  }

  const handleSaved = () => {
    setShowModal(false)
    setEditTire(null)
    setEditPosition(null)
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

  // ===== Schema view for company / owner_operator =====
  if (isSchemaView) {
    const tireByPos = {}
    tires.forEach(tr => { if (tr.position) tireByPos[tr.position] = tr })

    const renderWheelCard = (posKey) => {
      const tire = tireByPos[posKey]
      const kmDriven = tire && currentOdometer && tire.installed_odometer
        ? Math.max(0, currentOdometer - tire.installed_odometer)
        : null
      const cond = tire ? (TIRE_CONDITION_MAP[tire.condition] || { color: 'var(--dim)' }) : null
      const hasTire = !!tire

      return (
        <div
          key={posKey}
          onClick={() => handlePositionClick(posKey)}
          style={{
            ...cardStyle,
            cursor: 'pointer',
            flex: '1 1 45%',
            minWidth: '140px',
            maxWidth: '48%',
            borderLeft: hasTire ? `3px solid ${cond?.color || '#f59e0b'}` : '3px solid var(--border)',
            position: 'relative',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>
            {posKey}
          </div>
          {hasTire ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tire.brand}{tire.model ? ' ' + tire.model : ''}
              </div>
              {tire.size ? (
                <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '2px' }}>
                  {t('service.tireSize')}: {tire.size}
                </div>
              ) : null}
              <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '2px' }}>
                {t('service.installDate')}: {formatDate(tire.installed_at)}
              </div>
              {tire.installed_odometer ? (
                <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '2px' }}>
                  {t('service.installOdometer')}: {tire.installed_odometer.toLocaleString('ru-RU')}
                </div>
              ) : null}
              {kmDriven !== null ? (
                <div style={{ fontSize: '11px', fontWeight: 600, color: cond?.color || 'var(--dim)' }}>
                  {t('service.tireMileage')}: {kmDriven.toLocaleString('ru-RU')} {t('trips.km')}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic' }}>
              {t('service.noTireInstalled')}
            </div>
          )}
        </div>
      )
    }

    return (
      <>
        {/* Vehicle selector for company */}
        {isCompany && vehicles?.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '6px' }}>{t('service.selectVehicle')}</div>
            <select
              value={selectedVehicleId || ''}
              onChange={e => setSelectedVehicleId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
              }}
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.plate_number ? `\u00b7 ${v.plate_number}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Vehicle info card */}
        <div style={{ ...cardStyle, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', flexShrink: 0,
          }}>
            {'\uD83D\uDE9B'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              {isCompany
                ? `${selectedVehicle?.brand || ''} ${selectedVehicle?.model || ''}`
                : `${profileBrand} ${profileModel}`
              }
            </div>
            <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
              {isCompany && selectedVehicle?.driver_name
                ? `${t('service.driverLabel')}: ${selectedVehicle.driver_name} \u00b7 `
                : isOwnerOp && profileDriverName
                  ? `${t('service.driverLabel')}: ${profileDriverName} \u00b7 `
                  : ''
              }
              {t('service.plateLabel')}: {isCompany ? (selectedVehicle?.plate_number || '\u2014') : (profilePlate || '\u2014')}
            </div>
          </div>
        </div>

        {/* Wheel positions title */}
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
          {t('service.wheelPositions')}
        </div>

        {/* Front axle */}
        <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('service.frontAxle')}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {renderWheelCard('FL')}
          {renderWheelCard('FR')}
        </div>

        {/* Rear axle */}
        <div style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('service.rearAxle')}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {renderWheelCard('RL1')}
          {renderWheelCard('RL2')}
          {renderWheelCard('RR2')}
          {renderWheelCard('RR1')}
        </div>

        {showModal && (
          <TireModal
            userId={userId}
            vehicleId={isCompany ? selectedVehicleId : null}
            tire={editTire}
            defaultPosition={editPosition}
            onClose={() => { setShowModal(false); setEditTire(null); setEditPosition(null) }}
            onSaved={handleSaved}
            onDelete={editTire ? () => handleDelete(editTire.id) : null}
          />
        )}
      </>
    )
  }

  // ===== List view for driver (hired) — existing behavior =====
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
function TireModal({ userId, vehicleId, tire, defaultPosition, onClose, onSaved, onDelete }) {
  const { t } = useLanguage()
  const TIRE_POSITIONS = getTirePositions(t)
  const TIRE_CONDITIONS = getTireConditions(t)
  const [brand, setBrand] = useState(tire?.brand || '')
  const [model, setModel] = useState(tire?.model || '')
  const [size, setSize] = useState(tire?.size || '')
  const [position, setPosition] = useState(tire?.position || defaultPosition || 'front_left')
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
        vehicle_id: vehicleId || null,
        brand: brand.trim(),
        model: model.trim(),
        size: size.trim(),
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

        {/* Size */}
        <div style={{ marginBottom: '14px' }}>
          <div style={labelStyle}>{t('service.tireSize')}</div>
          <input
            type="text"
            value={size}
            onChange={e => setSize(e.target.value)}
            placeholder="315/80 R22.5"
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

        {/* Delete button (when editing existing tire) */}
        {tire && onDelete && (
          <button
            onClick={() => { onDelete(); onClose() }}
            style={{
              width: '100%', padding: '12px', borderRadius: '12px',
              border: '1px solid #ef4444', background: 'transparent',
              color: '#ef4444', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer', marginTop: '10px',
            }}
          >
            {t('service.deleteTire')}
          </button>
        )}
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
function BolSection({ userId, vehicleId, userRole }) {
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

  const MONTH_NAMES = t('expenses.monthNames')

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
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId)
      }
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
  }, [userId, vehicleId, bolFilterMode, bolMonth, bolYear, bolDateFrom, bolDateTo, getBolDateRange])

  useEffect(() => { loadBolFiles() }, [loadBolFiles])

  const handleBolUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    e.target.value = ''
    const validation = await validateAndCompressFile(file, userId)
    if (!validation.ok) {
      alert(interpolate(t(validation.errorKey), validation.errorParams))
      return
    }
    const validFile = validation.file
    setUploading(true)
    try {
      const timestamp = Date.now()
      const path = `${userId}/bol/${timestamp}_${validFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, validFile, { contentType: validFile.type || 'application/octet-stream' })
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
          title: validFile.name || 'BOL',
          file_url: fileUrl,
          storage_path: path,
          notes: '',
          file_name: validFile.name || '',
          file_size: validFile.size || 0,
          mime_type: validFile.type || '',
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

      // Collect unique vehicle_ids from BOL files
      const vIds = [...new Set(bolFiles.map(b => b.vehicle_id).filter(Boolean))]
      let vehicleMap = {}
      if (vIds.length > 0) {
        const { data: vData } = await supabase
          .from('vehicles')
          .select('id, brand, model, plate_number, driver_name')
          .in('id', vIds)
        if (vData) {
          for (const v of vData) { vehicleMap[v.id] = v }
        }
      }
      // Also check profiles for owner vehicle info
      if (!vIds.length || bolFiles.some(b => !b.vehicle_id)) {
        // no-op, those go to fallback folder
      }

      const getFolderName = (vid) => {
        if (!vid) return t('vehicle.noVehicle') || 'No vehicle'
        const v = vehicleMap[vid]
        if (!v) return vid.slice(0, 8)
        const namePart = [v.brand, v.model].filter(Boolean).join(' ') || 'Vehicle'
        const plate = v.plate_number || ''
        const driver = v.driver_name || ''
        let folder = `${namePart}_${plate}`.replace(/[<>:"/\\|?*]/g, '_')
        if (driver) folder += ` (${driver.replace(/[<>:"/\\|?*]/g, '_')})`
        return folder
      }

      for (const bol of bolFiles) {
        if (!bol.file_url) continue
        try {
          const resp = await fetch(bol.file_url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const dateStr = bol.created_at ? new Date(bol.created_at).toISOString().slice(0, 10) : 'nodate'
          const ext = (bol.title || '').split('.').pop() || 'jpg'
          const baseName = bol.title ? bol.title.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\u0400-\u04FF -]/g, '_') : bol.id
          const fileName = `${baseName}_${dateStr}.${ext}`
          const folder = getFolderName(bol.vehicle_id)
          zip.file(`${folder}/${fileName}`, blob)
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
            {mode === 'month' ? t('common.month') : t('common.period')}
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

      {userRole !== 'company' && (
        <input
          ref={bolInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleBolUpload}
          style={{ display: 'none' }}
        />
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {userRole !== 'company' && (
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
        )}
        <button
          onClick={handleDownloadAllBol}
          disabled={downloading || bolFiles.length === 0}
          style={{
            flex: userRole === 'company' ? 1 : undefined,
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
export function DocsTab({ userId, vehicleId, userRole, vehicles: vehiclesProp, profile }) {
  const { t } = useLanguage()
  const [activeTile, setActiveTile] = useState(null)
  const isCompany = userRole === 'company'
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [localVehicles, setLocalVehicles] = useState([])

  // Load vehicles internally when not provided via props (e.g. standalone documents tab)
  useEffect(() => {
    if (isCompany && !vehiclesProp && userId) {
      fetchVehicles(userId).then(v => setLocalVehicles(v || [])).catch(() => setLocalVehicles([]))
    }
  }, [isCompany, vehiclesProp, userId])

  const vehicles = vehiclesProp || localVehicles

  const effectiveVehicleId = isCompany ? selectedVehicleId : vehicleId

  const isUsaMode = profile?.hos_mode === 'usa' || profile?.units === 'imperial'
  const showBookkeeping = isUsaMode && (
    userRole === 'owner_operator' ||
    userRole === 'company' ||
    (userRole === 'driver' && profile?.employment_type !== 'w2')
  )

  const TILES = [
    { key: 'documents', icon: '\uD83D\uDCC4', label: t('service.tileDocuments') },
    ...(showBookkeeping ? [{ key: 'bookkeeping', icon: '\uD83D\uDCBC', label: t('service.tileBookkeeping') }] : []),
    { key: 'bol', icon: '\uD83D\uDCCB', label: t('service.tileBol') },
    { key: 'vehicle_inspection', icon: '\uD83D\uDCF8', label: t('service.tileVehicleInspection') },
    { key: 'trailer_inspection', icon: '\uD83D\uDE9B', label: t('service.tileTrailerInspection') },
    { key: 'fines', icon: '\u26A0\uFE0F', label: t('service.tileFines') },
  ]

  // Tiles grid
  if (!activeTile) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}>
        {TILES.map((tile, idx) => (
          <div
            key={tile.key}
            onClick={() => { setActiveTile(tile.key); setSelectedVehicleId(null) }}
            style={{
              ...cardStyle,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 12px',
              minHeight: '110px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>{tile.icon}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: '1.3' }}>{tile.label}</div>
          </div>
        ))}
      </div>
    )
  }

  const tileInfo = TILES.find(t2 => t2.key === activeTile)

  // Bookkeeping: skip vehicle selection, BookkeepingHome handles its own navigation
  if (activeTile === 'bookkeeping') {
    return (
      <BookkeepingHome
        userId={userId}
        role={userRole}
        userVehicles={vehicles}
        profile={profile}
        onBack={() => setActiveTile(null)}
      />
    )
  }

  // Company: vehicle card list (before showing content)
  if (isCompany && !selectedVehicleId) {
    return (
      <>
        <button
          onClick={() => setActiveTile(null)}
          style={{
            background: 'none', border: 'none', color: 'var(--text)',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          {t('service.backToTiles')}
        </button>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
          {tileInfo.icon + ' ' + tileInfo.label}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
          {t('service.chooseVehicle')}
        </div>
        {vehicles && vehicles.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {vehicles.map(v => (
              <div
                key={v.id}
                onClick={() => setSelectedVehicleId(v.id)}
                style={{
                  ...cardStyle,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b22, #d9770622)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', flexShrink: 0,
                }}>
                  {'\uD83D\uDE9B'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.driver_name || '\u2014'}
                  </div>
                  {v.plate_number && (
                    <div style={{ fontSize: '13px', color: 'var(--dim)', marginTop: '3px', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                      {v.plate_number}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px', opacity: 0.7 }}>
                    {[v.brand, v.model].filter(Boolean).join(' ') || v.id.slice(0, 8)}
                  </div>
                </div>
                <div style={{ fontSize: '18px', color: 'var(--dim)', flexShrink: 0 }}>{'\u203A'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
            {t('common.noVehicles')}
          </div>
        )}
      </>
    )
  }

  // Back button handler: company goes to vehicle list, others go to tiles
  const handleBack = () => {
    if (isCompany && selectedVehicleId) {
      setSelectedVehicleId(null)
    } else {
      setActiveTile(null)
    }
  }
  const backLabel = isCompany && selectedVehicleId ? t('service.backToVehicles') : t('service.backToTiles')

  // Selected vehicle name for header (company only)
  const selectedVehicle = isCompany && selectedVehicleId && vehicles
    ? vehicles.find(v => v.id === selectedVehicleId)
    : null
  const vehicleHeader = selectedVehicle ? (
    <div style={{
      fontSize: '13px', color: '#f59e0b', fontWeight: 600, marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      {'\uD83D\uDE9B '}
      {[selectedVehicle.brand, selectedVehicle.model, selectedVehicle.plate_number].filter(Boolean).join(' ')}
      {selectedVehicle.driver_name ? (' \u2014 ' + selectedVehicle.driver_name) : ''}
    </div>
  ) : null

  const renderTileContent = () => {
    switch (activeTile) {
      case 'trailer_inspection':
        return <TrailerInspectionContent userId={userId} vehicleId={effectiveVehicleId} userRole={userRole} />
      case 'fines':
        return <IncidentsContent userId={userId} vehicleId={effectiveVehicleId} userRole={userRole} />
      case 'documents':
        return <DocsDocumentsContent userId={userId} vehicleId={effectiveVehicleId} userRole={userRole} />
      case 'bol':
        return <BolSection userId={userId} vehicleId={effectiveVehicleId} userRole={userRole} />
      case 'vehicle_inspection':
        return <VehicleInspectionContent userId={userId} vehicleId={effectiveVehicleId} userRole={userRole} />
      default:
        return null
    }
  }

  return (
    <>
      <button
        onClick={handleBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text)',
          fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {backLabel}
      </button>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
        {tileInfo.icon + ' ' + tileInfo.label}
      </div>
      {vehicleHeader}
      {renderTileContent()}
    </>
  )
}

/* ===== DOCS - DOCUMENTS CONTENT ===== */
function DocsDocumentsContent({ userId, vehicleId, userRole }) {
  const { t } = useLanguage()
  const DOC_TYPES = getDocTypes(t)
  const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPES.map(d => [d.key, d]))

  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [showDocModal, setShowDocModal] = useState(false)
  const [docFilter, setDocFilter] = useState('all')
  const [expandedDoc, setExpandedDoc] = useState(null)
  const [insurance, setInsurance] = useState([])
  const [loadingInsurance, setLoadingInsurance] = useState(true)

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
    loadDocs()
    loadInsurance()
  }, [loadDocs, loadInsurance])

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

  const nonBolDocs = documents.filter(d => d.type !== 'bol' && !['fine', 'inspection_record', 'accident'].includes(d.type))
  const vehicleFilteredDocs = vehicleId ? nonBolDocs.filter(d => d.vehicle_id === vehicleId) : nonBolDocs
  const filteredDocs = docFilter === 'all'
    ? vehicleFilteredDocs
    : vehicleFilteredDocs.filter(d => d.type === docFilter)

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

    </>
  )
}

/* ===== DOCS - VEHICLE INSPECTION CONTENT ===== */
function VehicleInspectionContent({ userId, vehicleId, userRole }) {
  const { t } = useLanguage()
  const PHOTO_TYPE_LABELS = getPhotoTypeLabels(t)
  const [vehiclePhotos, setVehiclePhotos] = useState([])
  const [showAddPhotoModal, setShowAddPhotoModal] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const now2 = new Date()
  const [photoFilterMode, setPhotoFilterMode] = useState('month')
  const [photoMonth, setPhotoMonth] = useState(now2.getMonth() + 1)
  const [photoYear, setPhotoYear] = useState(now2.getFullYear())
  const [photoDateFrom, setPhotoDateFrom] = useState('')
  const [photoDateTo, setPhotoDateTo] = useState('')
  const [downloadingPhotos, setDownloadingPhotos] = useState(false)

  const PHOTO_MONTH_NAMES = t('expenses.monthNames')
  const photoYears = []
  for (let y = now2.getFullYear(); y >= now2.getFullYear() - 3; y--) photoYears.push(y)

  const getPhotoDateRange = useCallback(() => {
    if (photoFilterMode === 'period') {
      if (!photoDateFrom || !photoDateTo) return null
      return {
        start: photoDateFrom + 'T00:00:00',
        end: photoDateTo + 'T23:59:59',
      }
    }
    const start = `${photoYear}-${String(photoMonth).padStart(2, '0')}-01`
    const endMonth = photoMonth === 12 ? 1 : photoMonth + 1
    const endYear = photoMonth === 12 ? photoYear + 1 : photoYear
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
    return { start: start + 'T00:00:00', end: end + 'T00:00:00' }
  }, [photoFilterMode, photoMonth, photoYear, photoDateFrom, photoDateTo])

  const loadPhotos = useCallback(async () => {
    if (!userId) return
    const range = getPhotoDateRange()
    if (!range) { setVehiclePhotos([]); setLoadingPhotos(false); return }
    try {
      setLoadingPhotos(true)
      let query = supabase
        .from('vehicle_photos')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', range.start)
        .order('created_at', { ascending: false })
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId)
      }
      if (photoFilterMode === 'period') {
        query = query.lte('created_at', range.end)
      } else {
        query = query.lt('created_at', range.end)
      }
      const { data, error } = await query
      if (error) throw error
      setVehiclePhotos(data || [])
    } catch (err) {
      console.error('loadVehiclePhotos error:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }, [userId, vehicleId, photoFilterMode, photoMonth, photoYear, photoDateFrom, photoDateTo, getPhotoDateRange])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  const handleDeletePhoto = async (photo) => {
    if (!confirm(t('service.deletePhoto'))) return
    try {
      await deleteVehiclePhoto(photo.id, photo.photo_url)
      setVehiclePhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      console.error('deleteVehiclePhoto error:', err)
    }
  }

  const handleDownloadPhotosZip = async () => {
    if (vehiclePhotos.length === 0 || downloadingPhotos) return
    setDownloadingPhotos(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const vIds = [...new Set(vehiclePhotos.map(p => p.vehicle_id).filter(Boolean))]
      let vehicleMap = {}
      if (vIds.length > 0) {
        const { data: vData } = await supabase
          .from('vehicles')
          .select('id, brand, model, plate_number')
          .in('id', vIds)
        if (vData) {
          for (const v of vData) { vehicleMap[v.id] = v }
        }
      }

      const getFolderName = (vid) => {
        if (!vid) return t('vehicle.noVehicle') || 'No vehicle'
        const v = vehicleMap[vid]
        if (!v) return vid.slice(0, 8)
        const namePart = [v.brand, v.model].filter(Boolean).join(' ') || 'Vehicle'
        const plate = v.plate_number || ''
        return `${namePart}_${plate}`.replace(/[<>:"/\\|?*]/g, '_')
      }

      const usedNames = {}
      for (const photo of vehiclePhotos) {
        if (!photo.photo_url) continue
        try {
          const resp = await fetch(photo.photo_url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const dateStr = photo.created_at ? new Date(photo.created_at).toISOString().slice(0, 10) : 'nodate'
          const titlePart = (photo.notes || photo.photo_type || 'photo').replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
          const ext = (photo.photo_url.split('.').pop() || 'jpg').split('?')[0]
          const folder = getFolderName(photo.vehicle_id)
          const v = photo.vehicle_id ? vehicleMap[photo.vehicle_id] : null
          const vehiclePart = v ? [v.brand, v.model, v.plate_number].filter(Boolean).join('_').replace(/[<>:"/\\|?*]/g, '_') : ''
          let baseName = vehiclePart ? `${vehiclePart}_${titlePart}_${dateStr}` : `${titlePart}_${dateStr}`
          const nameKey = `${folder}/${baseName}.${ext}`
          if (usedNames[nameKey]) {
            usedNames[nameKey]++
            baseName = `${baseName}_${usedNames[nameKey]}`
          } else {
            usedNames[nameKey] = 1
          }
          const fileName = `${baseName}.${ext}`
          zip.file(`${folder}/${fileName}`, blob)
        } catch (err) {
          console.warn('Skip photo:', photo.id, err)
        }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const { saveAs } = await import('file-saver')
      const zipName = photoFilterMode === 'period'
        ? `Inspection_${photoDateFrom}_${photoDateTo}.zip`
        : `Inspection_${String(photoMonth).padStart(2, '0')}_${photoYear}.zip`
      saveAs(content, zipName)
    } catch (err) {
      console.error('Photos ZIP error:', err)
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
      {/* Filter mode switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', background: 'var(--card2)', borderRadius: '10px', padding: '3px' }}>
        {['month', 'period'].map(mode => (
          <button
            key={mode}
            onClick={() => setPhotoFilterMode(mode)}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '8px',
              border: 'none',
              background: photoFilterMode === mode ? 'var(--card)' : 'transparent',
              color: photoFilterMode === mode ? 'var(--text)' : 'var(--dim)',
              fontSize: '13px',
              fontWeight: photoFilterMode === mode ? 600 : 400,
              cursor: 'pointer',
              boxShadow: photoFilterMode === mode ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            {mode === 'month' ? t('common.month') : t('common.period')}
          </button>
        ))}
      </div>

      {/* Month mode */}
      {photoFilterMode === 'month' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <select value={photoMonth} onChange={e => setPhotoMonth(Number(e.target.value))} style={selectStyle}>
            {PHOTO_MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={photoYear} onChange={e => setPhotoYear(Number(e.target.value))} style={selectStyle}>
            {photoYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Period mode */}
      {photoFilterMode === 'period' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="date"
            value={photoDateFrom}
            onChange={e => setPhotoDateFrom(e.target.value)}
            style={selectStyle}
          />
          <input
            type="date"
            value={photoDateTo}
            onChange={e => setPhotoDateTo(e.target.value)}
            style={selectStyle}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {userRole !== 'company' && (
          <button
            onClick={() => setShowAddPhotoModal(true)}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#000',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {'\uD83D\uDCF7 ' + t('service.addInspectionPhoto')}
          </button>
        )}
        <button
          onClick={handleDownloadPhotosZip}
          disabled={downloadingPhotos || vehiclePhotos.length === 0}
          style={{
            flex: userRole === 'company' ? 1 : undefined,
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: (downloadingPhotos || vehiclePhotos.length === 0) ? 'var(--border)' : 'var(--card2)',
            color: (downloadingPhotos || vehiclePhotos.length === 0) ? 'var(--dim)' : '#3b82f6',
            fontSize: '14px',
            fontWeight: 700,
            cursor: (downloadingPhotos || vehiclePhotos.length === 0) ? 'default' : 'pointer',
          }}
        >
          {downloadingPhotos ? '\u23f3' : '\uD83D\uDCE6'} ZIP
        </button>
      </div>

      {/* Photo gallery */}
      {loadingPhotos ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dim)', fontSize: 14 }}>
          {t('common.loading')}
        </div>
      ) : vehiclePhotos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: 14 }}>
          {t('service.noPhotoPeriod') || t('service.noInspectionPhotos')}
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
          onTouchStart={e => { window._fsPhotoTouchY = e.touches[0].clientY }}
          onTouchEnd={e => {
            const dy = e.changedTouches[0].clientY - (window._fsPhotoTouchY || 0)
            if (dy > 80) setFullscreenPhoto(null)
          }}
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
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '100%' }}>
            <img
              src={fullscreenPhoto.photo_url}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <div style={{ color: '#fff', fontSize: '14px', marginTop: '12px', textAlign: 'center' }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                {PHOTO_TYPE_LABELS[fullscreenPhoto.photo_type] || fullscreenPhoto.photo_type}
              </span>
              {' \u00b7 '}{formatDate(fullscreenPhoto.created_at)}
              {fullscreenPhoto.notes && <div style={{ marginTop: '4px', color: '#ccc' }}>{fullscreenPhoto.notes}</div>}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null) }}
            style={{
              position: 'absolute', top: '50px', right: '16px',
              zIndex: 10000,
              width: '44px', height: '44px', borderRadius: '50%',
              border: 'none', background: 'rgba(0,0,0,0.7)',
              color: '#fff', fontSize: '22px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
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
