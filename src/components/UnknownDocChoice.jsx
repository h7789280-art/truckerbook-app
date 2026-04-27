import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'

// Shown when SmartScan returns doc_type='unknown'. Lets the user pick a type
// manually so the photo isn't wasted: receipt / trip / repair / archive.
// All callbacks fire through to SmartScan, which opens the chosen Confirm
// with empty fields (the photo is already loaded in SmartScan state).
export default function UnknownDocChoice({
  imagePreview = null,
  rawText = null,
  onChooseReceipt,
  onChooseTrip,
  onChooseRepair,
  onArchive,
  onCancel,
}) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [archiving, setArchiving] = useState(false)

  const handleArchive = async () => {
    if (!onArchive || archiving) return
    setArchiving(true)
    try {
      await onArchive()
    } finally {
      setArchiving(false)
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
    maxWidth: 400,
    maxHeight: '92vh',
    overflow: 'auto',
    padding: 20,
  }

  const choiceBtn = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid ' + theme.border,
    background: theme.card2,
    color: theme.text,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    marginBottom: 10,
  }

  const cancelBtn = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    color: theme.dim,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    marginTop: 6,
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
            {t('smartScan.unknown.title')}
          </h3>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: theme.dim, fontSize: 22, cursor: 'pointer', padding: 4, flexShrink: 0 }}
          >
            {'✕'}
          </button>
        </div>

        {/* Subtitle */}
        <div style={{ color: theme.dim, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
          {t('smartScan.unknown.subtitle')}
        </div>

        {/* Photo preview (if available) */}
        {imagePreview && (
          <div style={{ marginBottom: 14 }}>
            <img
              src={imagePreview}
              alt="Document"
              style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'contain', background: '#000' }}
            />
          </div>
        )}

        {/* Raw text preview (if pasted text instead of photo) */}
        {!imagePreview && rawText && (
          <div style={{
            marginBottom: 14, padding: 10, borderRadius: 10,
            background: theme.card2, border: '1px solid ' + theme.border,
            color: theme.dim, fontSize: 12, maxHeight: 120, overflow: 'auto',
            whiteSpace: 'pre-wrap', fontFamily: 'monospace',
          }}>
            {rawText}
          </div>
        )}

        {/* Choice buttons */}
        <button style={choiceBtn} onClick={onChooseReceipt} disabled={archiving}>
          {t('smartScan.unknown.receipt')}
        </button>
        <button style={choiceBtn} onClick={onChooseTrip} disabled={archiving}>
          {t('smartScan.unknown.trip')}
        </button>
        <button style={choiceBtn} onClick={onChooseRepair} disabled={archiving}>
          {t('smartScan.unknown.repair')}
        </button>
        <button style={choiceBtn} onClick={handleArchive} disabled={archiving}>
          {archiving ? ('⏳ ' + t('common.saving')) : t('smartScan.unknown.archive')}
        </button>

        {/* Cancel */}
        <button style={cancelBtn} onClick={onCancel} disabled={archiving}>
          {t('smartScan.unknown.cancel')}
        </button>
      </div>
    </div>
  )
}
