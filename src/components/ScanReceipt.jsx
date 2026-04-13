import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'

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
      // Scale down if larger than 1600px
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
              reader.onload = () => {
                const base64 = reader.result.split(',')[1]
                resolve(base64)
              }
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

export default function ScanReceipt({ onClose, onResult }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    setFile(f)
    setError(null)
    setResult(null)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  const handleScan = async () => {
    if (!file) return
    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const base64 = await compressForScan(file)
      if (!base64) {
        setError(t('scan.error'))
        setScanning(false)
        return
      }

      const resp = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      const data = await resp.json()

      if (!resp.ok || data.error) {
        setError(data.error || t('scan.error'))
        setScanning(false)
        return
      }

      setResult(data)
      if (onResult) onResult(data)
    } catch {
      setError(t('scan.error'))
    } finally {
      setScanning(false)
    }
  }

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    setResult(null)
    setError(null)
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

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 700 }}>
            {t('scan.title')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4 }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Photo input buttons */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        {!preview && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button style={btnBase} onClick={() => cameraRef.current?.click()}>
              {'\uD83D\uDCF7'} {t('scan.camera')}
            </button>
            <button style={btnBase} onClick={() => galleryRef.current?.click()}>
              {'\uD83D\uDDBC\uFE0F'} {t('scan.gallery')}
            </button>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <img
              src={preview}
              alt="Receipt"
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

        {/* Scan button */}
        {preview && !result && (
          <button style={scanBtn} onClick={handleScan} disabled={scanning}>
            {scanning
              ? ('\u23F3 ' + t('scan.analyzing'))
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

        {/* Result */}
        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              marginBottom: 12,
            }}>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {'\u2705'} {t('scan.success')}
              </div>
              {result.store_name && (
                <div style={{ color: theme.text, fontSize: 14, marginBottom: 4 }}>
                  {'\uD83C\uDFEA'} {result.store_name}
                </div>
              )}
              {result.date && (
                <div style={{ color: theme.dim, fontSize: 13, marginBottom: 4 }}>
                  {'\uD83D\uDCC5'} {result.date}
                </div>
              )}
              {result.total != null && (
                <div style={{ color: theme.text, fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                  {t('scan.total')}: {result.total}
                </div>
              )}
            </div>

            {result.items && result.items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.items.map((item, i) => (
                  <div key={i} style={{
                    padding: 10, borderRadius: 10,
                    background: theme.card2, border: '1px solid ' + theme.border,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: theme.text, fontSize: 14 }}>{item.description}</span>
                      <span style={{ color: '#f59e0b', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                        {item.amount}
                      </span>
                    </div>
                    <div style={{ color: theme.dim, fontSize: 12, marginTop: 4 }}>
                      {item.category}{item.subcategory ? ' / ' + item.subcategory : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reset to scan another */}
            <button
              style={{ ...btnBase, width: '100%', marginTop: 12, flex: 'none' }}
              onClick={handleReset}
            >
              {'\uD83D\uDCF7'} {t('scan.scanAnother')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
