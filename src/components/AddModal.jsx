import { useState, useEffect } from 'react'
import { addFuel, addTrip, addBytExpense, addServiceRecord, addVehicleExpense } from '../lib/api'
import { useTheme } from '../lib/theme'
import { useLanguage, getCurrencySymbol, getUnits } from '../lib/i18n'

function getMenuItems(activeTab, t) {
  const OVERVIEW_MENU = [
    { key: 'fuel', icon: '\u26FD\uFE0F', label: t('addModal.refueling') },
    { key: 'byt', icon: '\uD83C\uDF7D', label: t('addModal.bytExpense') },
    { key: 'trip', icon: '\uD83D\uDE9B', label: t('addModal.trip') },
    { key: 'repair', icon: '\uD83D\uDD27', label: t('addModal.repairTo') },
    { key: 'vehicle_expense', icon: '\uD83D\uDE9A', label: t('addModal.vehicleExpense') },
  ]
  const VEHICLE_MENU = [
    { key: 'fuel', icon: '\u26FD\uFE0F', label: t('addModal.refueling') },
    { key: 'vehicle_expense', icon: '\uD83D\uDE9A', label: t('addModal.vehicleExpense') },
  ]
  const SERVICE_MENU = [
    { key: 'repair', icon: '\uD83D\uDD27', label: t('addModal.repairTo') },
    { key: 'insurance', icon: '\uD83D\uDEE1', label: t('addModal.insurance') },
  ]
  if (activeTab === 'service') return SERVICE_MENU
  if (activeTab === 'fuel') return VEHICLE_MENU
  return OVERVIEW_MENU
}

function getFormTitle(formType, t) {
  const titles = {
    fuel: t('addModal.addRefueling'),
    byt: t('addModal.addExpense'),
    trip: t('addModal.addTrip'),
    repair: t('addModal.repairTo'),
    insurance: t('addModal.insurance'),
    vehicle_expense: t('addModal.vehicleExpense'),
  }
  return titles[formType] || t('addModal.addEntry')
}

function getBytCategories(t) {
  return [
    { value: 'food', label: t('addModal.catFood') },
    { value: 'shower', label: t('addModal.catShower') },
    { value: 'laundry', label: t('addModal.catLaundry') },
    { value: 'personal', label: t('addModal.catPersonal') },
    { value: 'other', label: t('addModal.catOther') },
  ]
}

function getVehicleExpenseCategories(t) {
  return [
    { value: 'def', label: t('addModal.catDef') },
    { value: 'oil', label: t('addModal.catOil') },
    { value: 'parts', label: t('addModal.catParts') },
    { value: 'equipment', label: t('addModal.catEquipment') },
    { value: 'supplies', label: t('addModal.catSupplies') },
    { value: 'hotel', label: t('addModal.catHotel') },
    { value: 'toll', label: t('addModal.catToll') },
    { value: 'platon', label: t('addModal.catPlaton') },
    { value: 'other', label: t('addModal.catOtherVehicle') },
  ]
}

function FieldGroup({ label, children, theme }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: theme.dim, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PhotoVoicePlaceholder({ theme, t }) {
  const handlePhoto = () => {
    alert(t('addModal.photoSoon'))
  }
  const handleVoice = () => {
    alert(t('addModal.voiceSoon'))
  }
  const btnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.dim,
    fontSize: 13,
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 0.2s',
  }
  const handleHover = (e) => { e.currentTarget.style.opacity = '1' }
  const handleLeave = (e) => { e.currentTarget.style.opacity = '0.7' }
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
      <button type="button" style={btnStyle} onClick={handlePhoto} onMouseEnter={handleHover} onMouseLeave={handleLeave}>{t('addModal.photo')}</button>
      <button type="button" style={btnStyle} onClick={handleVoice} onMouseEnter={handleHover} onMouseLeave={handleLeave}>{t('addModal.voice')}</button>
    </div>
  )
}

function FuelFields({ form, onChange, theme, inputStyle, geoState, t, cs, unitSys }) {
  const volLabel = unitSys === 'imperial' ? t('addModal.gallons') : t('addModal.liters')
  const odomLabel = t('addModal.odometer') + (unitSys === 'imperial' ? ' (mi)' : ' (' + t('addModal.kmShort') + ')')
  return (
    <>
      <FieldGroup label={t('addModal.station')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.stationPlaceholder')} value={form.station || ''} onChange={(e) => onChange('station', e.target.value)} />
      </FieldGroup>
      {geoState && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: theme.card2,
          color: theme.dim,
          fontSize: 13,
          marginBottom: 12,
        }}>
          {'\uD83D\uDCCD ' + geoState}
        </div>
      )}
      <FieldGroup label={t('addModal.date')} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={volLabel} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.liters || ''} onChange={(e) => onChange('liters', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.amount') + ', ' + cs} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={odomLabel} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function TripFields({ form, onChange, theme, inputStyle, t, cs, unitSys }) {
  const distUnit = unitSys === 'imperial' ? 'mi' : t('addModal.kmShort')
  return (
    <>
      <FieldGroup label={t('addModal.from')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.fromPlaceholder')} value={form.from || ''} onChange={(e) => onChange('from', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.to')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.toPlaceholder')} value={form.to || ''} onChange={(e) => onChange('to', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.date')} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.distance') + ', ' + distUnit} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.distance || ''} onChange={(e) => onChange('distance', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.income') + ', ' + cs} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.rate || ''} onChange={(e) => onChange('rate', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function BytFields({ form, onChange, theme, inputStyle, t, cs }) {
  const selectStyle = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }
  const categories = getBytCategories(t)
  return (
    <>
      <FieldGroup label={t('addModal.category')} theme={theme}>
        <select style={selectStyle} value={form.category || 'food'} onChange={(e) => onChange('category', e.target.value)}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label={t('addModal.description')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.whatBought')} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.date')} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.amount') + ', ' + cs} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function RepairFields({ form, onChange, theme, inputStyle, t, cs, unitSys }) {
  const odomLabel = t('addModal.odometer') + (unitSys === 'imperial' ? ' (mi)' : ' (' + t('addModal.kmShort') + ')')
  return (
    <>
      <FieldGroup label={t('addModal.workDescription')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.whatDone')} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.sto')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.stoPlaceholder')} value={form.sto || ''} onChange={(e) => onChange('sto', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.date')} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.amount') + ', ' + cs} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={odomLabel} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function VehicleExpenseFields({ form, onChange, theme, inputStyle, t, cs }) {
  const selectStyle = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }
  const categories = getVehicleExpenseCategories(t)
  return (
    <>
      <FieldGroup label={t('addModal.category')} theme={theme}>
        <select style={selectStyle} value={form.category || 'def'} onChange={(e) => onChange('category', e.target.value)}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label={t('addModal.description')} theme={theme}>
        <input style={inputStyle} placeholder={t('addModal.whatBought')} value={form.description || ''} onChange={(e) => onChange('description', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.date')} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={t('addModal.amount') + ', ' + cs} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
    </>
  )
}

export default function AddModal({ isOpen, onClose, userId, activeTab, activeVehicleId, onFuelSaved, onTripSaved, onBytSaved, onServiceSaved, onVehicleExpenseSaved }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [formType, setFormType] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [geoLat, setGeoLat] = useState(null)
  const [geoLon, setGeoLon] = useState(null)
  const [geoState, setGeoState] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setForm({})
    setSaving(false)
    setGeoLat(null)
    setGeoLon(null)
    setGeoState(null)
    if (activeTab === 'fuel') {
      setFormType(null)
    } else if (activeTab === 'byt') {
      setFormType('byt')
      setForm({ category: 'food' })
    } else if (activeTab === 'trips') {
      setFormType('trip')
    } else {
      setFormType(null)
    }
  }, [isOpen, activeTab])

  useEffect(() => {
    if (!isOpen || formType !== 'fuel') return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setGeoLat(lat)
        setGeoLon(lon)
        fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon + '&format=json&accept-language=en')
          .then((r) => r.json())
          .then((data) => {
            if (data && data.address && data.address.state) {
              setGeoState(data.address.state)
            }
          })
          .catch(() => {})
      },
      () => {},
      { timeout: 10000 }
    )
  }, [isOpen, formType])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectType = (type) => {
    setFormType(type)
    if (type === 'byt') setForm({ category: 'food' })
    else if (type === 'vehicle_expense') setForm({ category: 'def' })
    else setForm({})
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const entry = { ...form, vehicle_id: activeVehicleId || null }

      if (formType === 'fuel') {
        if (geoLat != null && geoLon != null) {
          entry.latitude = geoLat
          entry.longitude = geoLon
        }
        if (geoState) entry.state = geoState
        await addFuel(userId, entry)
        if (onFuelSaved) onFuelSaved()
      } else if (formType === 'trip') {
        await addTrip(entry)
        if (onTripSaved) onTripSaved()
      } else if (formType === 'byt') {
        const bytData = {
          ...entry,
          category: entry.category || 'food',
          date: entry.date || new Date().toISOString().slice(0, 10),
        }
        await addBytExpense(bytData)
        if (onBytSaved) onBytSaved()
      } else if (formType === 'repair') {
        await addServiceRecord(entry)
        if (onServiceSaved) onServiceSaved()
      } else if (formType === 'vehicle_expense') {
        const veData = {
          ...entry,
          category: entry.category || 'def',
          date: entry.date || new Date().toISOString().slice(0, 10),
        }
        await addVehicleExpense(veData)
        if (onVehicleExpenseSaved) onVehicleExpenseSaved()
      }
    } catch (err) {
      console.error('Failed to save ' + formType + ':', err)
      return
    } finally {
      setSaving(false)
    }
    setForm({})
    setFormType(null)
    onClose()
  }

  const handleClose = () => {
    setForm({})
    setFormType(null)
    onClose()
  }

  const handleBack = () => {
    setFormType(null)
    setForm({})
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const showMenu = formType === null && (activeTab === 'overview' || activeTab === 'service' || activeTab === 'fuel')
  const menuItems = getMenuItems(activeTab, t)

  const renderMenuBtn = (item) => (
    <button
      key={item.key}
      onClick={() => selectType(item.key)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid ' + theme.border,
        background: theme.card2,
        color: theme.text,
        fontSize: 16,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 22 }}>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  )

  const cs = getCurrencySymbol()
  const unitSys = getUnits()

  const renderForm = () => {
    const props = { form, onChange: handleChange, theme, inputStyle, t, cs, unitSys }
    switch (formType) {
      case 'fuel': return <FuelFields {...props} geoState={geoState} />
      case 'trip': return <TripFields {...props} />
      case 'byt': return <BytFields {...props} />
      case 'repair': return <RepairFields {...props} />
      case 'vehicle_expense': return <VehicleExpenseFields {...props} />
      default: return null
    }
  }

  const headerTitle = showMenu
    ? t('addModal.whatToAdd')
    : getFormTitle(formType, t)

  const canGoBack = formType !== null && (activeTab === 'overview' || activeTab === 'service' || activeTab === 'fuel')

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: 480,
          margin: '0 auto',
          background: theme.card,
          borderRadius: '16px 16px 0 0',
          zIndex: 201,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '20px 16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canGoBack && (
              <button
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.dim,
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >{'\u2190'}</button>
            )}
            <span style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>
              {headerTitle}
            </span>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.dim,
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
            }}
          >{'\u2715'}</button>
        </div>

        {showMenu ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {menuItems.map(renderMenuBtn)}
          </div>
        ) : (
          <>
            {renderForm()}
            <PhotoVoicePlaceholder theme={theme} t={t} />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 12,
                border: 'none',
                background: saving ? theme.dim : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                marginTop: 16,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t('addModal.saving') : t('addModal.save')}
            </button>
          </>
        )}
      </div>
    </>
  )
}
