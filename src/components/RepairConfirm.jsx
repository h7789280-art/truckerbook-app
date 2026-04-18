import { useState, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { uploadReceiptPhoto, addServiceRecord, checkDuplicateReceipt } from '../lib/api'
import { saveToArchive } from '../lib/documentsArchive'

const REPAIR_CATEGORIES = ['labor', 'parts', 'diagnostics', 'towing', 'other']

// Map AI repair categories to service_records category
const REPAIR_CAT_TO_SERVICE = {
  labor: 'repair',
  parts: 'repair',
  diagnostics: 'repair',
  towing: 'repair',
  other: 'repair',
}

export default function RepairConfirm({ result, file, userId, vehicleId, onClose, onSaved }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [shopName, setShopName] = useState(result.shop_name || '')
  const [date, setDate] = useState(result.date || new Date().toISOString().slice(0, 10))
  const [mileage, setMileage] = useState(result.mileage || '')
  const [notes, setNotes] = useState(result.notes || '')
  const [items, setItems] = useState(() =>
    (result.items || []).map((item, i) => ({
      id: i,
      checked: true,
      description: item.description || '',
      amount: parseFloat(item.amount) || 0,
      category: REPAIR_CATEGORIES.includes(item.category) ? item.category : 'other',
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dupFound, setDupFound] = useState(null) // { duplicates, proceed }
  const [checking, setChecking] = useState(false)

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  const checkedItems = useMemo(() => items.filter(it => it.checked), [items])
  const total = useMemo(() => checkedItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0), [checkedItems])

  const CAT_LABELS = {
    labor: 'repair.labor',
    parts: 'repair.parts',
    diagnostics: 'repair.diagnostics',
    towing: 'repair.towing',
    other: 'addModal.catOther',
  }

  const catLabel = (cat) => {
    const key = CAT_LABELS[cat]
    if (key) {
      const val = t(key)
      if (val && val !== key) return val
    }
    return cat
  }

  // Build the description string the same way doSave persists it, so the
  // duplicate check matches what's stored in service_records.description.
  const buildItemDesc = (item) => shopName
    ? `${item.description} [${catLabel(item.category)}] (${shopName})`
    : `${item.description} [${catLabel(item.category)}]`

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
      let firstServiceId = null
      for (const item of checkedItems) {
        const desc = buildItemDesc(item)

        const res = await addServiceRecord({
          vehicle_id: vehicleId || null,
          category: REPAIR_CAT_TO_SERVICE[item.category] || 'repair',
          name: desc,
          sto: shopName,
          amount: parseFloat(item.amount) || 0,
          odometer: parseInt(mileage, 10) || 0,
          date,
          receipt_url: receiptUrl,
        })
        if (!firstServiceId && res?.[0]?.id) firstServiceId = res[0].id
        savedCount++
      }

      // Archive the repair invoice photo (best-effort, non-fatal).
      if (savedCount > 0 && (file || receiptUrl)) {
        try {
          await saveToArchive({
            docType: 'receipt_other',
            photoFile: file,
            photoUrl: receiptUrl || null,
            ocrData: {
              vendor: shopName || null,
              amount: total,
              date,
            },
            linkedTable: 'service_records',
            linkedId: firstServiceId,
            vehicleId: vehicleId || null,
          })
        } catch (archiveErr) {
          console.error('[RepairConfirm] archive save failed (non-fatal):', archiveErr)
        }
      }

      if (onSaved) onSaved(savedCount)
    } catch (e) {
      console.error('RepairConfirm save error:', e?.message || e, e)
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
      const allDups = []
      for (const item of checkedItems) {
        const desc = buildItemDesc(item)
        const amt = parseFloat(item.amount) || 0
        const dups = await checkDuplicateReceipt({
          amount: amt,
          date,
          description: desc,
          userId,
          table: 'service_records',
        })
        if (dups.length > 0) allDups.push(...dups)
      }
      if (allDups.length > 0) {
        const seen = new Set()
        const unique = allDups.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
        setDupFound({ duplicates: unique, proceed: () => { setDupFound(null); doSave() } })
      } else {
        doSave()
      }
    } catch (e) {
      console.error('Repair duplicate check error:', e)
      doSave()
    } finally {
      setChecking(false)
    }
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
    minWidth: 90,
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {'\uD83D\uDD27'} {t('repair.confirmTitle')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Shop name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: theme.dim, fontSize: 12, marginBottom: 4, display: 'block' }}>
            {'\uD83C\uDFED'} {t('repair.shopName')}
          </label>
          <input
            type="text"
            value={shopName}
            onChange={e => setShopName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Date + Mileage */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
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
          <div>
            <label style={{ color: theme.dim, fontSize: 12, marginBottom: 4, display: 'block' }}>
              {'\uD83D\uDCCF'} {t('repair.mileage')}
            </label>
            <input
              type="number"
              value={mileage}
              onChange={e => setMileage(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {items.map(item => (
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

              {/* Row 2: category */}
              {item.checked && (
                <div style={{ paddingLeft: 28 }}>
                  <select
                    value={item.category}
                    onChange={e => updateItem(item.id, 'category', e.target.value)}
                    style={selectStyle}
                  >
                    {REPAIR_CATEGORIES.map(c => (
                      <option key={c} value={c}>{catLabel(c)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Notes */}
        {notes && (
          <div style={{
            marginBottom: 12, padding: 10, borderRadius: 10,
            background: theme.card2, border: '1px solid ' + theme.border,
            color: theme.dim, fontSize: 13,
          }}>
            {'\uD83D\uDCDD'} {notes}
          </div>
        )}

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
