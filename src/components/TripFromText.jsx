import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { addTrip } from '../lib/api'
import TripConfirm from './TripConfirm'

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

export default function TripFromText({ onClose, userId, vehicleId, onTripSaved }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [mode, setMode] = useState(null) // 'text' | 'image'
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    setFile(f)
    setError(null)
    setPreview(URL.createObjectURL(f))
  }

  const handleParse = async () => {
    if (mode === 'text' && !text.trim()) return
    if (mode === 'image' && !file) return
    setParsing(true)
    setError(null)

    try {
      const body = {}
      if (mode === 'text') {
        body.text = text.trim()
      } else {
        const base64 = await compressForScan(file)
        if (!base64) {
          setError(t('tripParse.parseError'))
          setParsing(false)
          return
        }
        body.image = base64
      }

      const resp = await fetch('/api/parse-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()

      if (!resp.ok || data.error) {
        setError(data.error || t('tripParse.parseError'))
        setParsing(false)
        return
      }

      setParsedData(data)
    } catch {
      setError(t('tripParse.parseError'))
    } finally {
      setParsing(false)
    }
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

  if (parsedData) {
    return (
      <TripConfirm
        data={parsedData}
        onSave={handleSaveTrip}
        onBack={() => setParsedData(null)}
        onClose={onClose}
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

  const parseBtn = {
    ...btnBase,
    background: parsing ? theme.card2 : 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff',
    border: 'none',
    opacity: parsing ? 0.7 : 1,
    cursor: parsing ? 'wait' : 'pointer',
    flex: 'none',
    width: '100%',
    marginTop: 12,
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {t('tripParse.title')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Mode selection */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button style={btnBase} onClick={() => setMode('text')}>
              {'\uD83D\uDCDD'} {t('tripParse.pasteText')}
            </button>
            <button style={btnBase} onClick={() => setMode('image')}>
              {'\uD83D\uDCF8'} {t('tripParse.screenshot')}
            </button>
          </div>
        )}

        {/* Text input mode */}
        {mode === 'text' && (
          <>
            <div style={{ marginBottom: 8, color: theme.dim, fontSize: 13 }}>
              {t('tripParse.pasteHint')}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('tripParse.textPlaceholder')}
              style={{
                width: '100%',
                minHeight: 150,
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
              }}
            />
            <button
              style={parseBtn}
              onClick={handleParse}
              disabled={parsing || !text.trim()}
            >
              {parsing
                ? ('\u23F3 ' + t('tripParse.parsing'))
                : ('\uD83D\uDD0D ' + t('tripParse.recognize'))}
            </button>
            <button
              style={{ ...btnBase, marginTop: 8, flex: 'none', width: '100%' }}
              onClick={() => { setMode(null); setText(''); setError(null) }}
            >
              {t('common.back')}
            </button>
          </>
        )}

        {/* Image input mode */}
        {mode === 'image' && (
          <>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
            <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

            {!preview && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button style={btnBase} onClick={() => cameraRef.current?.click()}>
                  {'\uD83D\uDCF7'} {t('scan.camera')}
                </button>
                <button style={btnBase} onClick={() => galleryRef.current?.click()}>
                  {'\uD83D\uDDBC\uFE0F'} {t('scan.gallery')}
                </button>
              </div>
            )}

            {preview && (
              <div style={{ marginBottom: 12, position: 'relative' }}>
                <img
                  src={preview}
                  alt="Screenshot"
                  style={{ width: '100%', borderRadius: 12, maxHeight: 300, objectFit: 'contain', background: '#000' }}
                />
                <button
                  onClick={() => { if (preview) URL.revokeObjectURL(preview); setPreview(null); setFile(null); setError(null) }}
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

            {preview && (
              <button
                style={parseBtn}
                onClick={handleParse}
                disabled={parsing}
              >
                {parsing
                  ? ('\u23F3 ' + t('tripParse.parsing'))
                  : ('\uD83D\uDD0D ' + t('tripParse.recognize'))}
              </button>
            )}

            <button
              style={{ ...btnBase, marginTop: 8, flex: 'none', width: '100%' }}
              onClick={() => { setMode(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); setFile(null); setError(null) }}
            >
              {t('common.back')}
            </button>
          </>
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
