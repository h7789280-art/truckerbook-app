import { useState, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { uploadReceiptPhoto, addVehicleExpense, addBytExpense } from '../lib/api'

// AI category -> vehicle_expenses category
const VEHICLE_CAT_MAP = {
  fuel: 'fuel',
  def: 'def',
  oil: 'oil',
  tools: 'parts',
  parts: 'parts',
  wash: 'supplies',
  scale: 'toll',
  tolls: 'toll',
  parking: 'toll',
  equipment: 'equipment',
  supplies: 'supplies',
  hotel: 'hotel',
  other: 'other',
}

// AI category -> byt_expenses category
const PERSONAL_CAT_MAP = {
  food: 'food',
  phone: 'personal',
  clothes: 'personal',
  other: 'other',
}

const VEHICLE_CATEGORIES = ['fuel', 'def', 'oil', 'parts', 'equipment', 'supplies', 'hotel', 'toll', 'other']
const PERSONAL_CATEGORIES = ['food', 'shower', 'laundry', 'personal', 'other']

function guessType(aiCategory) {
  if (PERSONAL_CAT_MAP[aiCategory] && !VEHICLE_CAT_MAP[aiCategory]) return 'personal'
  if (aiCategory === 'food') return 'personal'
  if (aiCategory === 'phone' || aiCategory === 'clothes') return 'personal'
  return 'vehicle'
}

function mapCategory(aiCategory, type) {
  if (type === 'personal') return PERSONAL_CAT_MAP[aiCategory] || 'other'
  return VEHICLE_CAT_MAP[aiCategory] || 'other'
}

export default function ScanConfirm({ result, file, userId, vehicleId, onClose, onSaved }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [storeName, setStoreName] = useState(result.store_name || '')
  const [date, setDate] = useState(result.date || new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState(() =>
    (result.items || []).map((item, i) => {
      const type = guessType(item.category)
      return {
        id: i,
        checked: true,
        description: item.description || '',
        amount: parseFloat(item.amount) || 0,
        type,
        category: mapCategory(item.category, type),
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const updated = { ...it, [field]: value }
      // When type changes, remap category to valid one for new type
      if (field === 'type') {
        const cats = value === 'personal' ? PERSONAL_CATEGORIES : VEHICLE_CATEGORIES
        if (!cats.includes(it.category)) {
          updated.category = cats[0]
        }
      }
      return updated
    }))
  }

  const checkedItems = useMemo(() => items.filter(it => it.checked), [items])
  const total = useMemo(() => checkedItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0), [checkedItems])

  const handleSave = async () => {
    if (checkedItems.length === 0) return
    setSaving(true)
    setError(null)

    try {
      // Upload receipt photo once
      let receiptUrl = null
      if (file) {
        receiptUrl = await uploadReceiptPhoto(userId, 'receipt', file, {
          date,
          plate: '',
          amount: total.toFixed(2),
        })
      }

      let savedCount = 0
      for (const item of checkedItems) {
        if (item.type === 'vehicle') {
          await addVehicleExpense({
            vehicle_id: vehicleId,
            category: item.category,
            description: storeName ? `${item.description} (${storeName})` : item.description,
            amount: parseFloat(item.amount) || 0,
            date,
            receipt_url: receiptUrl,
          })
        } else {
          await addBytExpense({
            category: item.category,
            name: storeName ? `${item.description} (${storeName})` : item.description,
            amount: parseFloat(item.amount) || 0,
            date,
            receipt_url: receiptUrl,
          })
        }
        savedCount++
      }

      if (onSaved) onSaved(savedCount)
    } catch (e) {
      console.error('ScanConfirm save error:', e)
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const CAT_KEY_MAP = {
    fuel: 'addModal.refueling',
    def: 'addModal.catDef',
    oil: 'addModal.catOil',
    parts: 'addModal.catParts',
    equipment: 'addModal.catEquipment',
    supplies: 'addModal.catSupplies',
    hotel: 'addModal.catHotel',
    toll: 'addModal.catToll',
    other: 'addModal.catOther',
    food: 'addModal.catFood',
    shower: 'addModal.catShower',
    laundry: 'addModal.catLaundry',
    personal: 'addModal.catPersonal',
  }

  const catLabel = (cat) => {
    const key = CAT_KEY_MAP[cat]
    if (key) {
      const val = t(key)
      if (val && val !== key) return val
    }
    return cat
  }

  const overlay = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1001,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }

  const modal = {
    background: theme.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    maxHeight: '92vh',
    overflow: 'auto',
    padding: 20,
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const selectStyle = {
    ...inputStyle,
    padding: '6px 8px',
    fontSize: 13,
    width: 'auto',
    minWidth: 80,
  }

  const toggleBtn = (active) => ({
    padding: '4px 10px',
    borderRadius: 8,
    border: active ? 'none' : '1px solid ' + theme.border,
    background: active ? '#f59e0b' : theme.card2,
    color: active ? '#fff' : theme.dim,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {'\u2705'} {t('scan.confirm')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Store name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: theme.dim, fontSize: 12, marginBottom: 4, display: 'block' }}>
            {'\uD83C\uDFEA'} {t('scan.storeName')}
          </label>
          <input
            type="text"
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: theme.dim, fontSize: 12, marginBottom: 4, display: 'block' }}>
            {'\uD83D\uDCC5'} {t('scan.date')}
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {items.map(item => {
            const cats = item.type === 'personal' ? PERSONAL_CATEGORIES : VEHICLE_CATEGORIES
            return (
              <div key={item.id} style={{
                padding: 12, borderRadius: 12,
                background: item.checked ? theme.card2 : 'transparent',
                border: '1px solid ' + (item.checked ? theme.border : 'transparent'),
                opacity: item.checked ? 1 : 0.4,
                transition: 'opacity 0.2s',
              }}>
                {/* Row 1: checkbox + description + amount */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => updateItem(item.id, 'checked', e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: '#f59e0b', flexShrink: 0 }}
                  />
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }}
                  />
                  <div style={{ position: 'relative', flexShrink: 0, width: 80 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: theme.dim, fontSize: 13, pointerEvents: 'none' }}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={e => updateItem(item.id, 'amount', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px 6px 20px', fontSize: 13, width: 80, textAlign: 'right', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* Row 2: category + type toggle */}
                {item.checked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 28 }}>
                    <select
                      value={item.category}
                      onChange={e => updateItem(item.id, 'category', e.target.value)}
                      style={selectStyle}
                    >
                      {cats.map(c => (
                        <option key={c} value={c}>{catLabel(c)}</option>
                      ))}
                    </select>

                    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                      <button
                        onClick={() => updateItem(item.id, 'type', 'vehicle')}
                        style={toggleBtn(item.type === 'vehicle')}
                      >
                        {'\uD83D\uDE9B'} {t('scan.vehicleType')}
                      </button>
                      <button
                        onClick={() => updateItem(item.id, 'type', 'personal')}
                        style={toggleBtn(item.type === 'personal')}
                      >
                        {'\uD83D\uDC64'} {t('scan.personalType')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          marginBottom: 16,
        }}>
          <span style={{ color: theme.text, fontSize: 15, fontWeight: 600 }}>
            {t('scan.totalLabel')}
          </span>
          <span style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>
            ${total.toFixed(2)}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 12, padding: 10, borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '14px 20px', borderRadius: 12,
              border: '1px solid ' + theme.border, background: theme.card2,
              color: theme.text, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || checkedItems.length === 0}
            style={{
              flex: 2, padding: '14px 20px', borderRadius: 12,
              border: 'none',
              background: saving ? theme.card2 : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
              opacity: (saving || checkedItems.length === 0) ? 0.6 : 1,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {saving ? t('common.saving') : `\uD83D\uDCBE ${t('scan.saveAll')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
