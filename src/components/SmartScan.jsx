import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { addTrip } from '../lib/api'
import { saveToArchive } from '../lib/documentsArchive'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/imageCompress'
import ScanConfirm from './ScanConfirm'
import TripConfirm from './TripConfirm'
import RepairConfirm from './RepairConfirm'
import UnknownDocChoice from './UnknownDocChoice'

// Field-mapping when the user reclassifies a Confirm to a different type.
// Keep the small subset where carry-over makes sense; everything else falls
// through to an empty Confirm.
function mapReclassify(fromType, toType, payload) {
  const p = payload || {}
  if (fromType === 'receipt' && toType === 'repair') {
    return { total: p.total || null, date: p.date || null }
  }
  if (fromType === 'repair' && toType === 'receipt') {
    return {
      // Receipts are item-based; surface the total as a single line item.
      items: p.total != null
        ? [{ description: p.shop_name || '', amount: p.total, category: 'other' }]
        : [],
      date: p.date || null,
    }
  }
  if (fromType === 'trip' && toType === 'repair') {
    return { date: p.pickup_date || null }
  }
  if (fromType === 'repair' && toType === 'trip') {
    return { pickup_date: p.date || null }
  }
  // receipt<->trip + anything else: empty
  return {}
}

export default function SmartScan({ onClose, userId, vehicleId, contextHint = null, onSaved, onTripSaved, onServiceSaved, onPartFromRepair }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [text, setText] = useState('')
  const [inputMode, setInputMode] = useState(null) // null | 'text'
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // AI response
  const [docType, setDocType] = useState(null) // 'receipt' | 'trip' | 'repair' | 'unknown'
  const [showUnknownChoice, setShowUnknownChoice] = useState(false)
  const [unknownRawText, setUnknownRawText] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    setFile(f)
    setError(null)
    setResult(null)
    setDocType(null)
    setPreview(URL.createObjectURL(f))
    setInputMode(null)
  }

  const handleScan = async () => {
    if (!file && !text.trim()) return
    setScanning(true)
    setError(null)
    setResult(null)
    setDocType(null)

    try {
      const body = {}

      if (file) {
        const compressed = await compressImage(file)
        if (!compressed) {
          setError(t('smartScan.error'))
          setScanning(false)
          return
        }
        body.image = compressed.base64
      }

      if (text.trim()) {
        body.text = text.trim()
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        setError('Session expired, please sign in again')
        setScanning(false)
        return
      }

      const resp = await fetch('/api/smart-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(body),
      })

      if (resp.status === 429) {
        const retryAfter = resp.headers.get('Retry-After') || '60'
        console.warn('smart-scan: rate limited, retry after', retryAfter, 's')
        setError('\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u043e\u0432. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 ' + retryAfter + ' \u0441\u0435\u043a\u0443\u043d\u0434.')
        setScanning(false)
        return
      }
      if (resp.status === 401) {
        setError('Session expired, please sign in again')
        setScanning(false)
        return
      }

      const data = await resp.json().catch(() => ({}))

      // Server-side validation failure (currency / date / amount / miles / rate).
      // 422 carries `userError` + `echo` so the user can keep what was readable
      // and just fix the failed field in the appropriate Confirm screen.
      if (resp.status === 422 && data.userError && data.echo) {
        const ue = data.userError
        const echo = data.echo
        const docTypeFromEcho = echo.doc_type

        // Show the user the localized warning for the failed field.
        const validationMsg = t('smartScan.validation.' + ue) || t('smartScan.error')
        const msg = ue === 'non_usd_currency'
          ? validationMsg.replace('{currency}', data.detectedCurrency || '?')
          : ue === 'date_out_of_range' || ue === 'date_invalid'
            ? validationMsg.replace('{date}', data.detectedDate || '?')
            : validationMsg

        // non_usd_currency blocks entirely — opening Confirm would let the
        // user save foreign-currency amounts as USD. The other failures
        // are recoverable: strip the bad field and let the user re-enter it.
        if (ue === 'non_usd_currency') {
          setError(msg)
          setScanning(false)
          return
        }

        const fallback = { ...echo }
        if (ue === 'date_invalid' || ue === 'date_out_of_range') {
          delete fallback.date
          delete fallback.pickup_date
          delete fallback.delivery_date
        } else if (ue === 'amount_invalid') {
          delete fallback.total
        } else if (ue === 'miles_invalid') {
          delete fallback.miles
          delete fallback.deadhead_miles
        } else if (ue === 'rate_invalid') {
          delete fallback.rate
          delete fallback.rate_per_mile
        } else if (ue === 'mileage_invalid') {
          delete fallback.mileage
        } else if (ue === 'shop_name_invalid') {
          delete fallback.shop_name
        } else if (ue === 'state_invalid') {
          delete fallback.origin_state
          delete fallback.destination_state
        }

        setError(msg)
        if (docTypeFromEcho === 'receipt' || docTypeFromEcho === 'trip' || docTypeFromEcho === 'repair') {
          setResult(fallback)
          setDocType(docTypeFromEcho)
        }
        setScanning(false)
        return
      }

      if (!resp.ok) {
        if (resp.status >= 500) {
          setError(data.error || 'Service temporarily unavailable')
        } else {
          setError(data.error || t('smartScan.unknownType'))
        }
        setScanning(false)
        return
      }

      // doc_type=unknown: server couldn't classify. Open the manual choice
      // modal so the user can pick a type and keep the photo (which is
      // already loaded in `file` / `preview`).
      if (data.doc_type === 'unknown') {
        setUnknownRawText(text.trim() || null)
        setShowUnknownChoice(true)
        setScanning(false)
        return
      }

      setResult(data)
      setDocType(data.doc_type)
    } catch {
      setError(t('smartScan.error'))
    } finally {
      setScanning(false)
    }
  }

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    setText('')
    setResult(null)
    setDocType(null)
    setError(null)
    setInputMode(null)
  }

  const handleSaveTrip = async (tripData) => {
    const origin = [tripData.origin_city, tripData.origin_state].filter(Boolean).join(', ')
    const destination = [tripData.destination_city, tripData.destination_state].filter(Boolean).join(', ')

    const savedTrips = await addTrip({
      from: origin,
      to: destination,
      distance: tripData.miles || 0,
      deadhead: tripData.deadhead_miles || 0,
      rate: tripData.rate || 0,
      vehicle_id: vehicleId,
    })

    // Archive the rate confirmation / BOL photo (best-effort, non-fatal).
    if (file && savedTrips?.[0]?.id) {
      try {
        await saveToArchive({
          docType: 'trip_rateconf',
          photoFile: file,
          ocrData: {
            vendor: result?.broker || null,
            amount: tripData.rate || null,
            date: result?.pickup_date || null,
            document_number: result?.load_number || null,
          },
          linkedTable: 'trips',
          linkedId: savedTrips[0].id,
          vehicleId: vehicleId || null,
        })
      } catch (archiveErr) {
        console.error('[SmartScan] trip archive save failed (non-fatal):', archiveErr)
      }
    }

    if (onTripSaved) onTripSaved()
    onClose()
  }

  // Reclassify: switch the open Confirm to a different doc_type, optionally
  // carrying over a small set of fields. Used both by the unknown-choice
  // modal and by the soft "Изменить тип" link inside each Confirm.
  const reclassifyTo = (toType, fromType = null, payload = null) => {
    setError(null)
    if (toType === 'archive') {
      handleArchiveCurrent()
      return
    }
    const mapped = (fromType && payload) ? mapReclassify(fromType, toType, payload) : {}
    setResult(mapped)
    setDocType(toType)
  }

  // Save the current photo / text into the unified documents archive without
  // tying it to any business record. Used for "Сохранить как фото в архив".
  const handleArchiveCurrent = async () => {
    try {
      await saveToArchive({
        docType: 'other',
        photoFile: file || null,
        ocrData: {
          raw_text: text.trim() || null,
        },
        linkedTable: null,
        linkedId: null,
        vehicleId: vehicleId || null,
      })
    } catch (archiveErr) {
      console.error('[SmartScan] archive-only save failed:', archiveErr)
    }
    if (onSaved) onSaved(0)
    onClose()
  }

  // Unknown-choice modal: AI couldn't classify, user picks a type manually.
  if (showUnknownChoice) {
    return (
      <UnknownDocChoice
        imagePreview={preview}
        rawText={unknownRawText}
        onChooseReceipt={() => { setShowUnknownChoice(false); setResult({}); setDocType('receipt') }}
        onChooseTrip={() => { setShowUnknownChoice(false); setResult({}); setDocType('trip') }}
        onChooseRepair={() => { setShowUnknownChoice(false); setResult({}); setDocType('repair') }}
        onArchive={async () => { setShowUnknownChoice(false); await handleArchiveCurrent() }}
        onCancel={() => setShowUnknownChoice(false)}
      />
    )
  }

  // Show TripConfirm
  if (docType === 'trip' && result) {
    return (
      <TripConfirm
        data={result}
        onSave={handleSaveTrip}
        onBack={() => { setResult(null); setDocType(null) }}
        onClose={onClose}
        onReclassify={(toType, payload) => reclassifyTo(toType, 'trip', payload)}
      />
    )
  }

  // Show ScanConfirm (receipt)
  if (docType === 'receipt' && result) {
    return (
      <ScanConfirm
        result={result}
        file={file}
        userId={userId}
        vehicleId={vehicleId}
        onClose={() => { setResult(null); setDocType(null) }}
        onSaved={(count) => {
          if (onSaved) onSaved(count)
          onClose()
        }}
        onReclassify={(toType, payload) => reclassifyTo(toType, 'receipt', payload)}
      />
    )
  }

  // Show RepairConfirm
  if (docType === 'repair' && result) {
    return (
      <RepairConfirm
        result={result}
        file={file}
        userId={userId}
        vehicleId={vehicleId}
        onClose={() => { setResult(null); setDocType(null) }}
        onSaved={(count) => {
          if (onServiceSaved) onServiceSaved(count)
          onClose()
        }}
        onReclassify={(toType, payload) => reclassifyTo(toType, 'repair', payload)}
        onAlsoAddPart={onPartFromRepair ? (partPreset) => {
          // Close SmartScan first, then bubble the prefilled part data up
          // so App.jsx can route to Service → ResourcesTab.
          onPartFromRepair(partPreset)
          if (onServiceSaved) onServiceSaved(0)
          onClose()
        } : null}
      />
    )
  }

  const overlay = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }

  const modal = {
    background: theme.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90vh',
    overflow: 'auto',
    padding: 20,
  }

  const btnBase = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 20px',
    borderRadius: 12,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    flex: 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  }

  const scanBtn = {
    ...btnBase,
    background: scanning ? theme.card2 : 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff',
    border: 'none',
    opacity: scanning ? 0.7 : 1,
    cursor: scanning ? 'wait' : 'pointer',
    flex: 'none',
    width: '100%',
  }

  const hasInput = !!file || text.trim().length > 0

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {'\uD83E\uDD16'} {t('smartScan.title')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Hint */}
        <div style={{ color: theme.dim, fontSize: 13, marginBottom: contextHint ? 8 : 14, lineHeight: 1.4 }}>
          {t('smartScan.hint')}
        </div>

        {/* Contextual hint — soft orientation when SmartScan is opened from a specific tab */}
        {contextHint && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '8px 10px',
            marginBottom: 14,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 10,
            color: theme.dim,
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            <span aria-hidden style={{ flexShrink: 0 }}>{'💡'}</span>
            <span>{contextHint}</span>
          </div>
        )}

        {/* Photo input buttons */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        {!preview && inputMode !== 'text' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button style={btnBase} onClick={() => cameraRef.current?.click()}>
              {'\uD83D\uDCF8'} {t('scan.camera')}
            </button>
            <button style={btnBase} onClick={() => galleryRef.current?.click()}>
              {'\uD83D\uDDBC\uFE0F'} {t('scan.gallery')}
            </button>
            <button style={btnBase} onClick={() => setInputMode('text')}>
              {'\uD83D\uDCDD'} {t('smartScan.textBtn')}
            </button>
          </div>
        )}

        {/* Image preview */}
        {preview && (
          <div style={{ marginBottom: 14, position: 'relative' }}>
            <img
              src={preview}
              alt="Document"
              style={{ width: '100%', borderRadius: 12, maxHeight: 300, objectFit: 'contain', background: '#000' }}
            />
            <button
              onClick={handleReset}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                border: 'none', borderRadius: '50%', width: 28, height: 28,
                cursor: 'pointer', fontSize: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {'\u2715'}
            </button>
          </div>
        )}

        {/* Text input mode */}
        {inputMode === 'text' && !preview && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('smartScan.textPlaceholder')}
              style={{
                width: '100%',
                minHeight: 140,
                padding: 12,
                borderRadius: 12,
                border: '1px solid ' + theme.border,
                background: theme.card2,
                color: theme.text,
                fontSize: 14,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            <button
              style={{ ...btnBase, width: '100%', flex: 'none', marginBottom: 8, fontSize: 13 }}
              onClick={() => { setInputMode(null); setText(''); setError(null) }}
            >
              {t('common.back')}
            </button>
          </>
        )}

        {/* Scan button */}
        {hasInput && !result && (
          <button style={scanBtn} onClick={handleScan} disabled={scanning}>
            {scanning
              ? ('\u23F3 ' + t('smartScan.detecting'))
              : ('\uD83D\uDD0D ' + t('scan.recognize'))}
          </button>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            fontSize: 14, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
