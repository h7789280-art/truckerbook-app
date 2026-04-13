import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { addTrip } from '../lib/api'
import ScanConfirm from './ScanConfirm'
import TripConfirm from './TripConfirm'
import RepairConfirm from './RepairConfirm'

function compressForScan(file, maxSize = 1024 * 1024, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      const maxDim = 1600
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      const tryCompress = (q) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(null); return }
            if (blob.size > maxSize && q > 0.3) {
              tryCompress(q - 0.1)
            } else {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result.split(',')[1])
              reader.onerror = () => resolve(null)
              reader.readAsDataURL(blob)
            }
          },
          'image/jpeg',
          q
        )
      }
      tryCompress(quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

export default function SmartScan({ onClose, userId, vehicleId, onSaved, onTripSaved, onServiceSaved }) {
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
        const base64 = await compressForScan(file)
        if (!base64) {
          setError(t('smartScan.error'))
          setScanning(false)
          return
        }
        body.image = base64
      }

      if (text.trim()) {
        body.text = text.trim()
      }

      const resp = await fetch('/api/smart-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await resp.json()

      if (!resp.ok || (data.doc_type === 'unknown')) {
        setError(data.error || t('smartScan.unknownType'))
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

    await addTrip({
      from: origin,
      to: destination,
      distance: tripData.miles || 0,
      deadhead: tripData.deadhead_miles || 0,
      rate: tripData.rate || 0,
      vehicle_id: vehicleId,
    })

    if (onTripSaved) onTripSaved()
    onClose()
  }

  // Show TripConfirm
  if (docType === 'trip' && result) {
    return (
      <TripConfirm
        data={result}
        onSave={handleSaveTrip}
        onBack={() => { setResult(null); setDocType(null) }}
        onClose={onClose}
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
        <div style={{ color: theme.dim, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
          {t('smartScan.hint')}
        </div>

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
