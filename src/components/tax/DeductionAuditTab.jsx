// AI Deduction Audit — owner-operator only.
// Runs Gemini against byt_expenses to surface items that look like
// Schedule C deductions mis-categorized as personal. User confirms each
// one tap → a mirror row is inserted into vehicle_expenses with the
// chosen Schedule C category. Originals are never deleted.
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../lib/theme'
import { useLanguage } from '../../lib/i18n'
import {
  runDeductionAudit,
  fetchAuditSuggestions,
  fetchLastAuditRun,
  fetchAuditHistoryCounts,
  acceptSuggestion,
  rejectSuggestion,
  snoozeSuggestion,
  isAuditApiAvailable,
  DEDUCTION_AUDIT_CATEGORIES,
} from '../../lib/api'

const ORANGE = '#f59e0b'
const GREEN = '#10b981'
const RED = '#ef4444'
const GREY = '#64748b'

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function interpolate(template, values) {
  if (!template) return ''
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    values[key] != null ? values[key] : `{${key}}`
  )
}

function relativeTime(isoDate, t) {
  if (!isoDate) return ''
  const diff = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return t('deductionAudit.justNow')
  if (days === 1) return interpolate(t('deductionAudit.daysAgoOne'), { n: 1 })
  return interpolate(t('deductionAudit.daysAgo'), { n: days })
}

function ConfidenceBadge({ score, t }) {
  let label
  let bg
  if (score >= 0.8) { label = '\u2B50\u2B50\u2B50 ' + t('deductionAudit.high'); bg = 'rgba(16,185,129,0.18)' }
  else if (score >= 0.7) { label = '\u2B50\u2B50 ' + t('deductionAudit.medium'); bg = 'rgba(245,158,11,0.18)' }
  else { label = '\u2B50 ' + t('deductionAudit.low'); bg = 'rgba(100,116,139,0.18)' }
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '11px',
      fontWeight: 600,
      background: bg,
    }}>{label}</span>
  )
}

export default function DeductionAuditTab({ userId, role, profile }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [historyCounts, setHistoryCounts] = useState({ accepted: 0, rejected: 0, snoozed: 0 })
  const [showHistory, setShowHistory] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmSuggestion, setConfirmSuggestion] = useState(null)
  const [confirmCategory, setConfirmCategory] = useState(null)
  const [fadingOut, setFadingOut] = useState(new Set())

  const apiAvailable = isAuditApiAvailable()

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      const [run, pending, counts] = await Promise.all([
        fetchLastAuditRun(userId),
        fetchAuditSuggestions(userId, 'pending'),
        fetchAuditHistoryCounts(userId),
      ])
      setLastRun(run)
      setSuggestions(pending)
      setHistoryCounts(counts)
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    try {
      await runDeductionAudit(userId, profile)
      await reload()
      setToast({ type: 'success', text: t('deductionAudit.runComplete') })
    } catch (err) {
      if (err.code === 'RATE_LIMITED') {
        const mins = Math.ceil((err.waitSeconds || 300) / 60)
        setToast({
          type: 'error',
          text: interpolate(t('deductionAudit.rateLimited'), { mins }),
        })
      } else {
        setToast({ type: 'error', text: t('deductionAudit.runFailed') })
        setError(err.message || 'Error')
      }
    } finally {
      setRunning(false)
    }
  }

  const openAccept = (sug) => {
    setConfirmSuggestion(sug)
    setConfirmCategory(sug.suggested_category)
  }

  const fadeAndRemove = (id) => {
    setFadingOut(prev => new Set(prev).add(id))
    setTimeout(() => {
      setSuggestions(prev => prev.filter(s => s.id !== id))
      setFadingOut(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 300)
  }

  const handleConfirmAccept = async () => {
    if (!confirmSuggestion) return
    const sug = confirmSuggestion
    try {
      await acceptSuggestion(sug.id, confirmCategory)
      setConfirmSuggestion(null)
      setConfirmCategory(null)
      fadeAndRemove(sug.id)
      setHistoryCounts(c => ({ ...c, accepted: c.accepted + 1 }))
      setToast({ type: 'success', text: t('deductionAudit.moved') })
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Error' })
    }
  }

  const handleReject = async (sug) => {
    try {
      await rejectSuggestion(sug.id)
      fadeAndRemove(sug.id)
      setHistoryCounts(c => ({ ...c, rejected: c.rejected + 1 }))
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Error' })
    }
  }

  const handleSnooze = async (sug) => {
    try {
      await snoozeSuggestion(sug.id)
      fadeAndRemove(sug.id)
      setHistoryCounts(c => ({ ...c, snoozed: c.snoozed + 1 }))
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Error' })
    }
  }

  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const sectionTitle = {
    fontSize: '11px',
    fontWeight: 700,
    color: theme.dim,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  }

  // Owner-operator only.
  if (role !== 'owner_operator') {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>{'\uD83E\uDD16'}</div>
        <div style={{ fontSize: '14px', color: theme.dim }}>
          {t('deductionAudit.ownerOperatorOnly')}
        </div>
      </div>
    )
  }

  if (!apiAvailable) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>{'\uD83E\uDD16'}</div>
        <div style={{ fontSize: '14px', color: theme.text, fontWeight: 600, marginBottom: '6px' }}>
          {t('deductionAudit.title')}
        </div>
        <div style={{ fontSize: '13px', color: theme.dim, lineHeight: 1.5 }}>
          {t('deductionAudit.apiUnavailable')}
        </div>
      </div>
    )
  }

  const bigButtonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: running ? GREY : 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: running ? 'default' : 'pointer',
    opacity: running ? 0.7 : 1,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          color: '#fff', background: toast.type === 'success' ? GREEN : RED,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
          {toast.type === 'success' ? '\u2713 ' : '\u2717 '}{toast.text}
        </div>
      )}

      {/* Title */}
      <div style={card}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text }}>
          {'\uD83E\uDD16 '}{t('deductionAudit.title')}
        </div>
        <div style={{ fontSize: '12px', color: theme.dim, marginTop: '8px', lineHeight: 1.5 }}>
          {t('deductionAudit.subtitle')}
        </div>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ color: theme.dim, fontSize: '14px' }}>{t('common.loading')}</div>
        </div>
      )}

      {!loading && running && (
        <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDD0D'}</div>
          <div style={{ fontSize: '14px', color: theme.text, fontWeight: 600, marginBottom: '4px' }}>
            {t('deductionAudit.scanning')}
          </div>
          <div style={{ fontSize: '12px', color: theme.dim }}>{t('deductionAudit.scanningHint')}</div>
          <div style={{
            marginTop: '14px', height: '6px', width: '100%', background: theme.border,
            borderRadius: '3px', overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, height: '100%', width: '40%',
              background: 'linear-gradient(90deg, #f59e0b, #10b981)',
              animation: 'auditProgress 1.4s ease-in-out infinite',
            }}/>
          </div>
          <style>{`@keyframes auditProgress { 0%{left:-40%} 100%{left:100%} }`}</style>
        </div>
      )}

      {!loading && !running && (
        <>
          {/* Last audit summary + run button */}
          <div style={card}>
            {lastRun && lastRun.status !== 'failed' ? (
              <>
                <div style={sectionTitle}>{t('deductionAudit.lastAudit')}</div>
                <div style={{ fontSize: '13px', color: theme.text, marginBottom: '6px' }}>
                  {relativeTime(lastRun.run_date, t)}
                  {' \u00b7 '}
                  {interpolate(t('deductionAudit.foundCount'), { n: lastRun.total_found })}
                </div>
                {Number(lastRun.total_potential_savings) > 0 && (
                  <div style={{ fontSize: '13px', color: GREEN, fontWeight: 600, marginBottom: '12px' }}>
                    {interpolate(t('deductionAudit.potentialSavings'), {
                      amount: fmt(lastRun.total_potential_savings),
                    })}
                  </div>
                )}
                <button onClick={handleRun} disabled={running} style={bigButtonStyle}>
                  {'\uD83D\uDD0D '}{t('deductionAudit.runAgain')}
                </button>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>{'\uD83E\uDDFE'}</div>
                  <div style={{ fontSize: '14px', color: theme.text, fontWeight: 600, marginBottom: '6px' }}>
                    {t('deductionAudit.firstTimeTitle')}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.dim, lineHeight: 1.5, marginBottom: '16px' }}>
                    {t('deductionAudit.firstTimeBody')}
                  </div>
                </div>
                <button onClick={handleRun} disabled={running} style={bigButtonStyle}>
                  {'\uD83D\uDD0D '}{t('deductionAudit.runFirst')}
                </button>
              </>
            )}
          </div>

          {error && (
            <div style={{
              background: '#ef444422', border: '1px solid #ef444466',
              borderRadius: '12px', padding: '12px', color: RED, fontSize: '13px',
            }}>{error}</div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <div style={card}>
              <div style={sectionTitle}>
                {interpolate(t('deductionAudit.pendingN'), { n: suggestions.length })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {suggestions.map(s => {
                  const isFading = fadingOut.has(s.id)
                  const catInfo = DEDUCTION_AUDIT_CATEGORIES.find(c => c.key === s.suggested_category)
                  return (
                    <div key={s.id} style={{
                      border: '1px solid ' + theme.border,
                      borderRadius: '12px',
                      padding: '14px',
                      background: theme.bg,
                      opacity: isFading ? 0 : 1,
                      transform: isFading ? 'translateX(40px)' : 'translateX(0)',
                      transition: 'opacity 300ms ease, transform 300ms ease',
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', gap: '10px', marginBottom: '8px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px', fontWeight: 600, color: theme.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {'\uD83C\uDFEA '}{s.original_description || t('deductionAudit.unnamed')}
                          </div>
                          <div style={{ fontSize: '12px', color: theme.dim, marginTop: '2px' }}>
                            <span style={{
                              fontFamily: 'monospace', color: ORANGE, fontWeight: 700,
                            }}>${fmt(s.original_amount)}</span>
                            {' \u00b7 '}
                            <span style={{ fontFamily: 'monospace' }}>{s.original_date}</span>
                          </div>
                        </div>
                        <ConfidenceBadge score={Number(s.confidence_score) || 0} t={t} />
                      </div>

                      <div style={{
                        fontSize: '12px', color: theme.text, lineHeight: 1.5,
                        padding: '8px 10px',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: '8px',
                        marginBottom: '10px',
                      }}>
                        {'\uD83D\uDCA1 Gemini: '}
                        {s.reasoning}
                      </div>

                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', fontSize: '12px', marginBottom: '12px',
                      }}>
                        <span style={{ color: theme.dim }}>
                          {t('deductionAudit.category')}: <span style={{ color: theme.text, fontWeight: 600 }}>
                            {(catInfo ? catInfo.label_en : s.suggested_category) + ' (' + s.suggested_schedule_c_line + ')'}
                          </span>
                        </span>
                        {Number(s.estimated_tax_savings) > 0 && (
                          <span style={{ color: GREEN, fontWeight: 700 }}>
                            {interpolate(t('deductionAudit.savings'), { amount: fmt(s.estimated_tax_savings) })}
                          </span>
                        )}
                      </div>

                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px',
                      }}>
                        <button
                          onClick={() => openAccept(s)}
                          style={{
                            padding: '10px', borderRadius: '8px', border: 'none',
                            background: GREEN, color: '#fff', fontWeight: 700, fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >{'\u2713 '}{t('deductionAudit.move')}</button>
                        <button
                          onClick={() => handleReject(s)}
                          style={{
                            padding: '10px', borderRadius: '8px',
                            border: '1px solid ' + theme.border,
                            background: 'transparent', color: theme.text,
                            fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                          }}
                        >{'\u2717 '}{t('deductionAudit.notMine')}</button>
                      </div>
                      <button
                        onClick={() => handleSnooze(s)}
                        style={{
                          width: '100%',
                          padding: '6px', borderRadius: '6px', border: 'none',
                          background: 'transparent', color: theme.dim,
                          fontSize: '12px', cursor: 'pointer',
                        }}
                      >{'\uD83D\uDCA4 '}{t('deductionAudit.snooze')}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {suggestions.length === 0 && lastRun && lastRun.status === 'completed' && lastRun.total_found === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83C\uDF89'}</div>
              <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>
                {t('deductionAudit.allClean')}
              </div>
            </div>
          )}

          {lastRun && lastRun.status === 'failed' && (
            <div style={{ ...card, textAlign: 'center', padding: '18px' }}>
              <div style={{ fontSize: '13px', color: RED, marginBottom: '10px' }}>
                {t('deductionAudit.failed')}
              </div>
            </div>
          )}

          {/* History summary */}
          {(historyCounts.accepted + historyCounts.rejected + historyCounts.snoozed) > 0 && (
            <div style={card}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer',
              }} onClick={() => setShowHistory(v => !v)}>
                <div style={sectionTitle}>{t('deductionAudit.history')}</div>
                <div style={{ fontSize: '18px', color: theme.dim }}>
                  {showHistory ? '\u25B2' : '\u25BC'}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: theme.text }}>
                {'\u2713 ' + interpolate(t('deductionAudit.historyMoved'), { n: historyCounts.accepted })}
                {' \u00b7 '}
                {'\u2717 ' + interpolate(t('deductionAudit.historyRejected'), { n: historyCounts.rejected })}
                {historyCounts.snoozed > 0 ? ' \u00b7 \uD83D\uDCA4 ' + interpolate(t('deductionAudit.historySnoozed'), { n: historyCounts.snoozed }) : ''}
              </div>
            </div>
          )}

          <div style={{
            fontSize: '11px', color: theme.dim, lineHeight: 1.6, padding: '8px 4px',
          }}>
            {t('deductionAudit.disclaimer')}
          </div>
        </>
      )}

      {/* Confirm move modal */}
      {confirmSuggestion && (
        <div
          onClick={() => setConfirmSuggestion(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)', zIndex: 10000,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.card, width: '100%', maxWidth: '480px',
              borderRadius: '16px 16px 0 0', padding: '20px',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{
              fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '4px',
            }}>
              {interpolate(t('deductionAudit.confirmTitle'), { amount: fmt(confirmSuggestion.original_amount) })}
            </div>
            <div style={{ fontSize: '12px', color: theme.dim, marginBottom: '14px' }}>
              {confirmSuggestion.original_description}
            </div>

            <label style={{
              display: 'block', fontSize: '11px', color: theme.dim,
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
            }}>{t('deductionAudit.category')}</label>
            <select
              value={confirmCategory || ''}
              onChange={e => setConfirmCategory(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                border: '1px solid ' + theme.border,
                background: theme.bg, color: theme.text, fontSize: '14px', fontWeight: 600,
              }}
            >
              {DEDUCTION_AUDIT_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>
                  {c.label_en + ' (' + c.line + ')'}
                </option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setConfirmSuggestion(null)}
                style={{
                  padding: '14px', borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.bg, color: theme.text,
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >{t('common.cancel')}</button>
              <button
                onClick={handleConfirmAccept}
                style={{
                  padding: '14px', borderRadius: '10px', border: 'none',
                  background: GREEN, color: '#fff', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >{t('deductionAudit.confirmMove')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
