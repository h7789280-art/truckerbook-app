import { useState, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { uploadReceiptPhoto, addVehicleExpense, addBytExpense, checkDuplicateReceipt } from '../lib/api'

// AI category -> vehicle_expenses category (valid DB values: def, oil, parts, equipment, supplies, hotel, toll, other)
const VEHICLE_CAT_MAP = {
  fuel: 'fuel',
  reefer: 'reefer',
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
  tobacco: 'personal',
  phone: 'personal',
  clothes: 'personal',
  medical: 'personal',
  other: 'other',
}

const VEHICLE_CATEGORIES = ['fuel', 'reefer', 'def', 'oil', 'parts', 'equipment', 'supplies', 'hotel', 'toll', 'other']
const PERSONAL_CATEGORIES = ['food', 'shower', 'laundry', 'personal', 'other']

// Auto-detect type: vehicle vs personal
const PERSONAL_AI_CATS = new Set(['food', 'tobacco', 'phone', 'clothes', 'medical'])

function guessType(aiCategory) {
  if (PERSONAL_AI_CATS.has(aiCategory)) return 'personal'
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
        aiCategory: item.category || '',
        fuelDetails: item.fuel_details || null,
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dupFound, setDupFound] = useState(null) // { duplicates, proceed callback }
  const [checking, setChecking] = useState(false)

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

  const oldDateWarning = useMemo(() => {
    if (!date) return null
    const d = new Date(date + 'T00:00:00')
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays > 30) {
      const monthNames = [
        '\u042F\u043D\u0432\u0430\u0440\u044C', '\u0424\u0435\u0432\u0440\u0430\u043B\u044C', '\u041C\u0430\u0440\u0442',
        '\u0410\u043F\u0440\u0435\u043B\u044C', '\u041C\u0430\u0439', '\u0418\u044E\u043D\u044C',
        '\u0418\u044E\u043B\u044C', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C',
        '\u041E\u043A\u0442\u044F\u0431\u0440\u044C', '\u041D\u043E\u044F\u0431\u0440\u044C', '\u0414\u0435\u043A\u0430\u0431\u0440\u044C',
      ]
      const month = monthNames[d.getMonth()]
      const year = d.getFullYear()
      return `\u26A0\uFE0F \u0414\u0430\u0442\u0430 \u0441\u0442\u0430\u0440\u0448\u0435 30 \u0434\u043D\u0435\u0439. \u0420\u0430\u0441\u0445\u043E\u0434 \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0430\u043D \u0432 ${month} ${year}.`
    }
    return null
  }, [date])

  const checkedItems = useMemo(() => items.filter(it => it.checked), [items])
  const total = useMemo(() => checkedItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0), [checkedItems])

  const doSave = async () => {
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
      const errors = []
      for (const item of checkedItems) {
        let desc = item.description
        // Enrich fuel description with gallons/price details
        if (item.aiCategory === 'fuel' && item.fuelDetails) {
          const fd = item.fuelDetails
          const gal = fd.gallons ? parseFloat(fd.gallons) : null
          const ppg = fd.price_per_gallon ? parseFloat(fd.price_per_gallon) : null
          if (gal && ppg) {
            desc = `${desc} ${gal} gal @ $${ppg.toFixed(2)}/gal`
          }
        }
        if (storeName) desc = `${desc} (${storeName})`
        const amt = parseFloat(item.amount) || 0
        try {
          if (item.type === 'vehicle') {
            const itemData = {
              vehicle_id: vehicleId || null,
              category: item.category,
              description: desc,
              amount: amt,
              date,
              receipt_url: receiptUrl,
            }
            console.log('[ScanConfirm] BEFORE vehicle_expense INSERT:', JSON.stringify(itemData))
            const result = await addVehicleExpense(itemData)
            console.log('[ScanConfirm] AFTER vehicle_expense INSERT ok:', JSON.stringify(result))
          } else {
            const itemData = {
              category: item.category,
              name: desc,
              amount: amt,
              date,
              receipt_url: receiptUrl,
            }
            console.log('[ScanConfirm] BEFORE byt_expense INSERT:', JSON.stringify(itemData))
            const result = await addBytExpense(itemData)
            console.log('[ScanConfirm] AFTER byt_expense INSERT ok:', JSON.stringify(result))
          }
          savedCount++
        } catch (itemErr) {
          const msg = itemErr?.message || String(itemErr)
          console.error(`[ScanConfirm] FAILED to save "${desc}" ($${amt}):`, msg, itemErr)
          errors.push(`${desc}: ${msg}`)
        }
      }

      console.log(`[ScanConfirm] Save complete: savedCount=${savedCount}, errors=${errors.length}`)
      if (errors.length > 0) {
        setError(`\u274C ${errors.length} error(s):\n${errors.join('\n')}`)
      } else if (savedCount > 0 && onSaved) {
        onSaved(savedCount)
      } else if (savedCount === 0) {
        setError('Nothing was saved \u2014 no items succeeded')
      }
    } catch (e) {
      console.error('ScanConfirm save error:', e?.message || e, e)
      const msg = e?.message || e?.error_description || String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (checkedItems.length === 0) return
    setChecking(true)
    setError(null)

    try {
      // Build full description for each item (same logic as doSave)
      const allDups = []
      for (const item of checkedItems) {
        let desc = item.description
        if (item.aiCategory === 'fuel' && item.fuelDetails) {
          const fd = item.fuelDetails
          const gal = fd.gallons ? parseFloat(fd.gallons) : null
          const ppg = fd.price_per_gallon ? parseFloat(fd.price_per_gallon) : null
          if (gal && ppg) desc = `${desc} ${gal} gal @ $${ppg.toFixed(2)}/gal`
        }
        if (storeName) desc = `${desc} (${storeName})`
        const amt = parseFloat(item.amount) || 0
        const tbl = item.type === 'vehicle' ? 'vehicle_expenses' : 'byt_expenses'
        const dups = await checkDuplicateReceipt({
          amount: amt,
          date,
          description: desc,
          userId,
          table: tbl,
        })
        if (dups.length > 0) allDups.push(...dups)
      }

      if (allDups.length > 0) {
        // Deduplicate by id
        const seen = new Set()
        const unique = allDups.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
        setDupFound({ duplicates: unique, proceed: () => { setDupFound(null); doSave() } })
      } else {
        doSave()
      }
    } catch (e) {
      console.error('Duplicate check error:', e)
      // On check failure, allow save anyway
      doSave()
    } finally {
      setChecking(false)
    }
  }

  const CAT_KEY_MAP = {
    fuel: 'addModal.refueling',
    reefer: 'addModal.catReefer',
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
          {oldDateWarning && (
            <div style={{ marginTop: 6, color: '#eab308', fontSize: 12, fontWeight: 500 }}>
              {oldDateWarning}
            </div>
          )}
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

                {/* Row 3: fuel details (gallons x price) */}
                {item.checked && item.aiCategory === 'fuel' && item.fuelDetails && (
                  <div style={{ paddingLeft: 28, marginTop: 4, color: theme.dim, fontSize: 12, fontFamily: 'monospace' }}>
                    {'\u26FD'} {parseFloat(item.fuelDetails.gallons || 0).toFixed(2)} gal {'\u00D7'} ${parseFloat(item.fuelDetails.price_per_gallon || 0).toFixed(2)}/gal
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
            fontSize: 13, textAlign: 'center', whiteSpace: 'pre-line',
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
            disabled={saving || checking || checkedItems.length === 0}
            style={{
              flex: 2, padding: '14px 20px', borderRadius: 12,
              border: 'none',
              background: (saving || checking) ? theme.card2 : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: (saving || checking) ? 'wait' : 'pointer',
              opacity: (saving || checking || checkedItems.length === 0) ? 0.6 : 1,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {checking ? t('scan.checkingDuplicates') : saving ? t('common.saving') : `\uD83D\uDCBE ${t('scan.saveAll')}`}
          </button>
        </div>
      </div>

      {/* Duplicate warning modal */}
      {dupFound && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1002,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: theme.card, borderRadius: 16, width: '100%', maxWidth: 380,
            maxHeight: '80vh', overflow: 'auto', padding: 20,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: '#eab308', fontSize: 17, fontWeight: 700 }}>
              {'\u26A0\uFE0F'} {t('scan.dupTitle')}
            </h3>
            <p style={{ color: theme.dim, fontSize: 13, margin: '0 0 12px' }}>
              {t('scan.dupMessage')}
            </p>

            {dupFound.duplicates.map((dup, i) => (
              <div key={dup.id || i} style={{
                padding: 10, borderRadius: 10, background: theme.card2,
                border: '1px solid ' + theme.border, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: theme.dim, fontSize: 12 }}>{'\uD83D\uDCC5'} {dup.date}</span>
                  <span style={{ color: '#ef4444', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                    ${parseFloat(dup.amount).toFixed(2)}
                  </span>
                </div>
                <div style={{ color: theme.text, fontSize: 13 }}>
                  {dup[dup._descCol] || dup.description || dup.name || ''}
                </div>
                {dup.category && (
                  <span style={{ color: theme.dim, fontSize: 11, marginTop: 2, display: 'inline-block' }}>
                    {catLabel(dup.category)}
                  </span>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setDupFound(null)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12,
                  border: '1px solid ' + theme.border, background: theme.card2,
                  color: theme.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={dupFound.proceed}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12,
                  border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {t('scan.dupSaveAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
