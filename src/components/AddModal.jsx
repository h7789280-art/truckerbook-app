import { useState } from 'react'
import { addFuel } from '../lib/api'

const RECORD_TYPES = [
  { key: 'fuel', icon: '\u26FD', label: '\u0417\u0430\u043F\u0440\u0430\u0432\u043A\u0430' },
  { key: 'trip', icon: '\uD83D\uDE9B', label: '\u0420\u0435\u0439\u0441' },
  { key: 'byt', icon: '\uD83C\uDF7D', label: '\u0411\u044B\u0442' },
  { key: 'repair', icon: '\uD83D\uDD27', label: '\u0420\u0435\u043C\u043E\u043D\u0442' },
  { key: 'insurance', icon: '\uD83D\uDEE1', label: '\u0421\u0442\u0440\u0430\u0445\u043E\u0432\u043A\u0430' },
  { key: 'other', icon: '\uD83D\uDCE6', label: '\u0414\u0440\u0443\u0433\u043E\u0435' },
]

const BYT_CATEGORIES = [
  { value: 'food', label: '\u0415\u0434\u0430' },
  { value: 'hotel', label: '\u041E\u0442\u0435\u043B\u044C' },
  { value: 'shower', label: '\u0414\u0443\u0448' },
  { value: 'laundry', label: '\u0421\u0442\u0438\u0440\u043A\u0430' },
  { value: 'supplies', label: '\u0420\u0430\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0438' },
  { value: 'other', label: '\u041F\u0440\u043E\u0447\u0435\u0435' },
]

const INSURANCE_TYPES = [
  { value: 'osago', label: '\u041E\u0421\u0410\u0413\u041E' },
  { value: 'kasko', label: '\u041A\u0410\u0421\u041A\u041E' },
]

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #1e2a3f',
  background: '#1a2235',
  color: '#e2e8f0',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function FuelFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u0410\u0417\u0421'}>
        <input style={inputStyle} placeholder={'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0441\u0442\u0430\u043d\u0446\u0438\u0438'} value={form.station || ''} onChange={(e) => onChange('station', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430'}>
        <input style={inputStyle} type="date" value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => onChange('date', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041B\u0438\u0442\u0440\u044B'}>
        <input style={inputStyle} type="number" value={form.liters || ''} onChange={(e) => onChange('liters', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'}>
        <input style={inputStyle} type="number" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041F\u0440\u043E\u0431\u0435\u0433'}>
        <input style={inputStyle} type="number" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function TripFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u041E\u0442\u043A\u0443\u0434\u0430'}>
        <input style={inputStyle} value={form.from || ''} onChange={(e) => onChange('from', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041A\u0443\u0434\u0430'}>
        <input style={inputStyle} value={form.to || ''} onChange={(e) => onChange('to', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043A\u043C'}>
        <input style={inputStyle} type="number" value={form.distance || ''} onChange={(e) => onChange('distance', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0442\u0430\u0432\u043A\u0430 \u20BD'}>
        <input style={inputStyle} type="number" value={form.rate || ''} onChange={(e) => onChange('rate', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function BytFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F'}>
        <select style={selectStyle} value={form.category || 'food'} onChange={(e) => onChange('category', e.target.value)}>
          {BYT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label={'\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435'}>
        <input style={inputStyle} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'}>
        <input style={inputStyle} type="number" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function RepairFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u044B'}>
        <input style={inputStyle} value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'}>
        <input style={inputStyle} type="number" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0422\u041E'}>
        <input style={inputStyle} value={form.sto || ''} onChange={(e) => onChange('sto', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u041E\u0434\u043E\u043C\u0435\u0442\u0440'}>
        <input style={inputStyle} type="number" value={form.odometer || ''} onChange={(e) => onChange('odometer', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function InsuranceFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u0422\u0438\u043F'}>
        <select style={selectStyle} value={form.insuranceType || 'osago'} onChange={(e) => onChange('insuranceType', e.target.value)}>
          {INSURANCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label={'\u041A\u043E\u043C\u043F\u0430\u043D\u0438\u044F'}>
        <input style={inputStyle} value={form.company || ''} onChange={(e) => onChange('company', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'}>
        <input style={inputStyle} type="number" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430'}>
        <input style={inputStyle} type="date" value={form.startDate || ''} onChange={(e) => onChange('startDate', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F'}>
        <input style={inputStyle} type="date" value={form.endDate || ''} onChange={(e) => onChange('endDate', e.target.value)} />
      </FieldGroup>
    </>
  )
}

function OtherFields({ form, onChange }) {
  return (
    <>
      <FieldGroup label={'\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435'}>
        <input style={inputStyle} value={form.description || ''} onChange={(e) => onChange('description', e.target.value)} />
      </FieldGroup>
      <FieldGroup label={'\u0421\u0443\u043C\u043C\u0430'}>
        <input style={inputStyle} type="number" value={form.amount || ''} onChange={(e) => onChange('amount', e.target.value)} />
      </FieldGroup>
    </>
  )
}

const FIELDS_MAP = {
  fuel: FuelFields,
  trip: TripFields,
  byt: BytFields,
  repair: RepairFields,
  insurance: InsuranceFields,
  other: OtherFields,
}

export default function AddModal({ isOpen, onClose, userId, onFuelSaved }) {
  const [recordType, setRecordType] = useState('fuel')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (recordType === 'fuel' && userId) {
      try {
        setSaving(true)
        await addFuel(userId, form)
        if (onFuelSaved) onFuelSaved()
      } catch (err) {
        console.error('Failed to save fuel:', err)
        return
      } finally {
        setSaving(false)
      }
    }
    setForm({})
    setRecordType('fuel')
    onClose()
  }

  const handleClose = () => {
    setForm({})
    setRecordType('fuel')
    onClose()
  }

  const Fields = FIELDS_MAP[recordType]

  return (
    <>
      {/* Backdrop */}
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
      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: 480,
          margin: '0 auto',
          background: '#111827',
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
          <span style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>
            {'\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C'}
          </span>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Photo & Voice buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {'\uD83D\uDCF7 \u0424\u043E\u0442\u043E \u0447\u0435\u043A\u0430'}
          </button>
          <button
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: '1px solid #1e2a3f',
              background: '#1a2235',
              color: '#e2e8f0',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {'\uD83C\uDFA4 \u0413\u043E\u043B\u043E\u0441'}
          </button>
        </div>

        {/* Record type pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {RECORD_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setRecordType(t.key)
                setForm({})
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                border: recordType === t.key ? '1px solid #f59e0b' : '1px solid #1e2a3f',
                background: recordType === t.key ? 'rgba(245,158,11,0.15)' : '#1a2235',
                color: recordType === t.key ? '#f59e0b' : '#e2e8f0',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: recordType === t.key ? 600 : 400,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Dynamic fields */}
        <Fields form={form} onChange={handleChange} />

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: 'none',
            background: saving ? '#64748b' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            marginTop: 8,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u2713 \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
        </button>
      </div>
    </>
  )
}
