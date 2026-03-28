import { useState, useEffect } from 'react'
import { addFuel, addTrip, addBytExpense, addServiceRecord } from '../lib/api'
import { useTheme } from '../lib/theme'

const OVERVIEW_MENU = [
  { key: 'fuel', icon: '\u26FD\uFE0F', label: '\u0417\u0430\u043F\u0440\u0430\u0432\u043A\u0430' },
  { key: 'byt', icon: '\uD83C\uDF7D', label: '\u0411\u044B\u0442\u043E\u0432\u043E\u0439 \u0440\u0430\u0441\u0445\u043E\u0434' },
  { key: 'trip', icon: '\uD83D\uDE9B', label: '\u0420\u0435\u0439\u0441' },
  { key: 'repair', icon: '\uD83D\uDD27', label: '\u0420\u0435\u043C\u043E\u043D\u0442 / \u0422\u041E' },
]

const SERVICE_MENU = [
  { key: 'repair', icon: '\uD83D\uDD27', label: '\u0420\u0435\u043C\u043E\u043D\u0442 / \u0422\u041E' },
  { key: 'insurance', icon: '\uD83D\uDEE1', label: '\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0430' },
]

const BYT_CATEGORIES = [
  { value: 'food', label: '\u0415\u0434\u0430' },
  { value: 'shower', label: '\u0414\u0443\u0448' },
  { value: 'laundry', label: '\u0421\u0442\u0438\u0440\u043A\u0430' },
  { value: 'personal', label: '\u041B\u0438\u0447\u043D\u043E\u0435' },
  { value: 'other', label: '\u041F\u0440\u043E\u0447\u0435\u0435' },
]

const FORM_TITLES = {
  fuel: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u0430\u0432\u043A\u0443',
  byt: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0441\u0445\u043E\u0434',
  trip: '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0435\u0439\u0441',
  repair: '\u0420\u0435\u043C\u043E\u043D\u0442 / \u0422\u041E',
  insurance: '\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0430',
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

function PhotoVoicePlaceholder({ theme }) {
  const handleStub = () => {
    alert('\u0421\u043A\u043E\u0440\u043E! \u0424\u043E\u0442\u043E \u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u0432\u0432\u043E\u0434 \u0432 \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0435')
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
    opacity: 0.6,
  }
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
      <button style={btnStyle} onClick={handleStub}>{'\uD83D\uDCF7 \u0424\u043E\u0442\u043E'}</button>
      <button style={btnStyle} onClick={handleStub}>{'\uD83C\uDFA4 \u0413\u043E\u043B\u043E\u0441'}</button>
    </div>
  )
}

function FuelFields({ form, onChange, theme, inputStyle }) {
  return (
    <>
      <FieldGroup label={'\u0410\u0417\u0421'} theme={theme}>
        <input style={inputStyle} placeholder={'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0441\u0442\u0430\u043d\u0446\u0438\u0438'} value={form.station || ''} onChange={(e) => onChange('station', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430'} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041B\u0438\u0442\u0440\u044B'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.liters || ''} onChange={(e) => onChange('liters', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041F\u0440\u043E\u0431\u0435\u0433'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function TripFields({ form, onChange, theme, inputStyle }) {
  return (
    <>
      <FieldGroup label={'\u041E\u0442\u043A\u0443\u0434\u0430'} theme={theme}>
        <input style={inputStyle} placeholder={'\u0413\u043E\u0440\u043E\u0434 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F'} value={form.from || ''} onChange={(e) => onChange('from', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041A\u0443\u0434\u0430'} theme={theme}>
        <input style={inputStyle} placeholder={'\u0413\u043E\u0440\u043E\u0434 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F'} value={form.to || ''} onChange={(e) => onChange('to', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430'} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435, \u043A\u043C'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.distance || ''} onChange={(e) => onChange('distance', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u043E\u0445\u043E\u0434, \u20BD'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.rate || ''} onChange={(e) => onChange('rate', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function BytFields({ form, onChange, theme, inputStyle }) {
  const selectStyle = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }
  return (
    <>
      <FieldGroup label={'\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F'} theme={theme}>
        <select style={selectStyle} value={form.category || 'food'} onChange={(e) => onChange('category', e.target.value)}>
          {BYT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label={'\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435'} theme={theme}>
        <input style={inputStyle} placeholder={'\u0427\u0442\u043E \u043A\u0443\u043F\u0438\u043B\u0438'} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430'} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function RepairFields({ form, onChange, theme, inputStyle }) {
  return (
    <>
      <FieldGroup label={'\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u044B'} theme={theme}>
        <input style={inputStyle} placeholder={'\u0427\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u043B\u0438'} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0422\u041E'} theme={theme}>
        <input style={inputStyle} placeholder={'\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u0435\u0440\u0432\u0438\u0441\u0430'} value={form.sto || ''} onChange={(e) => onChange('sto', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430'} theme={theme}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041F\u0440\u043E\u0431\u0435\u0433'} theme={theme}>
        <input style={inputStyle} type="number" placeholder="0" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

export default function AddModal({ isOpen, onClose, userId, activeTab, activeVehicleId, onFuelSaved, onTripSaved, onBytSaved, onServiceSaved }) {
  const { theme } = useTheme()
  const [formType, setFormType] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm({})
    setSaving(false)
    if (activeTab === 'fuel') {
      setFormType('fuel')
    } else if (activeTab === 'byt') {
      setFormType('byt')
      setForm({ category: 'food' })
    } else if (activeTab === 'trips') {
      setFormType('trip')
    } else {
      setFormType(null)
    }
  }, [isOpen, activeTab])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectType = (type) => {
    setFormType(type)
    setForm(type === 'byt' ? { category: 'food' } : {})
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const entry = { ...form, vehicle_id: activeVehicleId || null }

      if (formType === 'fuel') {
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

  const showMenu = formType === null && (activeTab === 'overview' || activeTab === 'service')
  const menuItems = activeTab === 'service' ? SERVICE_MENU : OVERVIEW_MENU

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

  const renderForm = () => {
    const props = { form, onChange: handleChange, theme, inputStyle }
    switch (formType) {
      case 'fuel': return <FuelFields {...props} />
      case 'trip': return <TripFields {...props} />
      case 'byt': return <BytFields {...props} />
      case 'repair': return <RepairFields {...props} />
      default: return null
    }
  }

  const headerTitle = showMenu
    ? '\u0427\u0442\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C?'
    : (FORM_TITLES[formType] || '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C')

  const canGoBack = formType !== null && (activeTab === 'overview' || activeTab === 'service')

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
            <PhotoVoicePlaceholder theme={theme} />
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
              {saving ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u2713 \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
