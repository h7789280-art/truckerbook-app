import { useState, useRef } from 'react'
import { parseTachographFile } from '../lib/tachographParser'
import { useLanguage } from '../lib/i18n'

const ACTIVITY_COLORS = {
  driving: '#3b82f6',
  rest: '#22c55e',
  work: '#f59e0b',
  available: '#6b7280',
}

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
}

export default function TachographViewer() {
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const result = await parseTachographFile(file)
      setData(result)
    } catch (err) {
      console.error('Tachograph parse error:', err)
      setError(err.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const getActivityLabel = (type) => {
    const map = {
      driving: t('tacho.driving'),
      rest: t('tacho.rest'),
      work: t('tacho.work'),
      available: t('tacho.available'),
    }
    return map[type] || type
  }

  const formatDur = (min) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}${t('tacho.hourShort')} ${m}${t('tacho.minShort')}`
  }

  // Determine HOS warning
  const getWarning = (drivingMinutes) => {
    const warnings = []
    if (drivingMinutes > 9 * 60) {
      warnings.push({ text: t('tacho.warningCIS'), color: '#ef4444' })
    }
    if (drivingMinutes > 11 * 60) {
      warnings.push({ text: t('tacho.warningUSA'), color: '#ef4444' })
    }
    return warnings
  }

  return (
    <div>
      {/* Upload button */}
      <div style={{ ...cardStyle, marginBottom: '16px', textAlign: 'center' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".ddd,.DDD"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#000',
            border: 'none',
            borderRadius: '10px',
            padding: '14px 28px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            width: '100%',
          }}
        >
          {loading ? '\u23F3 ' + t('tacho.analyzing') : '\uD83D\uDCC2 ' + t('tacho.upload')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          ...cardStyle,
          marginBottom: '16px',
          borderColor: '#ef4444',
          color: '#ef4444',
        }}>
          {t('common.error')}: {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Driver info card */}
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <h3 style={{ color: 'var(--text)', margin: '0 0 12px', fontSize: '16px' }}>
              {'\uD83D\uDC64'} {t('tacho.driverInfo')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: '12px' }}>{t('tacho.driverName')}</div>
                <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{data.driverName}</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: '12px' }}>{t('tacho.cardNumber')}</div>
                <div style={{ color: 'var(--text)', fontSize: '14px', fontFamily: 'monospace' }}>{data.cardNumber}</div>
              </div>
            </div>
            {data.source === 'gemini' && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--dim)', fontStyle: 'italic' }}>
                {t('tacho.aiParsed')}
              </div>
            )}
          </div>

          {/* Summary */}
          <div style={{ ...cardStyle, marginBottom: '12px' }}>
            <h3 style={{ color: 'var(--text)', margin: '0 0 12px', fontSize: '16px' }}>
              {'\uD83D\uDCCA'} {t('tacho.summary')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { key: 'driving', icon: '\uD83D\uDE97', color: ACTIVITY_COLORS.driving, label: t('tacho.driving'), value: data.totalDriving },
                { key: 'rest', icon: '\uD83D\uDECF', color: ACTIVITY_COLORS.rest, label: t('tacho.rest'), value: data.totalRest },
                { key: 'work', icon: '\uD83D\uDD27', color: ACTIVITY_COLORS.work, label: t('tacho.work'), value: data.totalWork },
                { key: 'available', icon: '\u23F3', color: ACTIVITY_COLORS.available, label: t('tacho.available'), value: data.totalAvailable || '0h 0m' },
              ].map(item => (
                <div key={item.key} style={{
                  background: 'var(--card2)',
                  borderRadius: '8px',
                  padding: '10px',
                  borderLeft: `3px solid ${item.color}`,
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--dim)' }}>{item.icon} {item.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: item.color, fontFamily: 'monospace' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HOS Warnings */}
          {getWarning(data.totalDrivingMinutes || 0).map((w, i) => (
            <div key={i} style={{
              ...cardStyle,
              marginBottom: '12px',
              borderColor: w.color,
              background: 'rgba(239, 68, 68, 0.1)',
            }}>
              <span style={{ color: w.color, fontWeight: 600 }}>
                {'\u26A0\uFE0F'} {w.text}
              </span>
            </div>
          ))}

          {/* Activities table */}
          {data.activities && data.activities.length > 0 && (
            <div style={{ ...cardStyle }}>
              <h3 style={{ color: 'var(--text)', margin: '0 0 12px', fontSize: '16px' }}>
                {'\uD83D\uDCCB'} {t('tacho.activities')}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--dim)', fontWeight: 500 }}>{t('tacho.type')}</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--dim)', fontWeight: 500 }}>{t('tacho.start')}</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--dim)', fontWeight: 500 }}>{t('tacho.end')}</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--dim)', fontWeight: 500 }}>{t('tacho.duration')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activities.map((act, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 6px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: ACTIVITY_COLORS[act.type] || '#6b7280',
                            marginRight: '6px',
                          }} />
                          <span style={{ color: ACTIVITY_COLORS[act.type] || 'var(--text)' }}>
                            {getActivityLabel(act.type)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px', color: 'var(--text)', fontFamily: 'monospace' }}>{act.start}</td>
                        <td style={{ padding: '8px 6px', color: 'var(--text)', fontFamily: 'monospace' }}>{act.end}</td>
                        <td style={{ padding: '8px 6px', color: 'var(--text)', fontFamily: 'monospace', textAlign: 'right' }}>
                          {formatDur(act.duration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
