// Filing Deadlines Tab
// Roles: owner_operator, company (driver/job_seeker hidden at BookkeepingHome level)

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { syncDeadlines } from '../utils/deadlinesGenerator'

function getCategoryIcon(type) {
  if (type.startsWith('IFTA')) return '\uD83D\uDCCB'
  if (type.startsWith('1040ES')) return '\uD83D\uDCB0'
  return '\uD83D\uDCC4'
}

function diffDays(dueDateStr) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(dueDateStr + 'T00:00:00')
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function DeadlinesTab({ userId }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('upcoming')
  const [showAddForm, setShowAddForm] = useState(false)
  const [toast, setToast] = useState(null)

  // Add form state
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const loadDeadlines = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Sync for current and next year on first load
      const curYear = new Date().getFullYear()
      await syncDeadlines({ supabase, userId, year: curYear })
      await syncDeadlines({ supabase, userId, year: curYear + 1 })

      const { data, error: fetchErr } = await supabase
        .from('filing_deadlines')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true })

      if (fetchErr) throw fetchErr
      setDeadlines(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadDeadlines() }, [loadDeadlines])

  const markDone = async (id) => {
    const { error: err } = await supabase
      .from('filing_deadlines')
      .update({ status: 'done' })
      .eq('id', id)
    if (err) {
      setToast({ type: 'error', msg: err.message })
      return
    }
    setDeadlines(prev => prev.map(d => d.id === id ? { ...d, status: 'done' } : d))
    setToast({ type: 'success', msg: t('deadlines.markedDone') })
  }

  const markPending = async (id) => {
    const { error: err } = await supabase
      .from('filing_deadlines')
      .update({ status: 'pending' })
      .eq('id', id)
    if (err) {
      setToast({ type: 'error', msg: err.message })
      return
    }
    setDeadlines(prev => prev.map(d => d.id === id ? { ...d, status: 'pending' } : d))
  }

  const addDeadline = async () => {
    if (!newTitle.trim() || !newDate) return
    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('filing_deadlines')
        .insert({
          user_id: userId,
          deadline_type: `custom-${Date.now()}`,
          title: newTitle.trim(),
          due_date: newDate,
          status: 'pending',
          notes: newNotes.trim() || null,
        })
        .select()
      if (err) throw err
      setDeadlines(prev => [...prev, ...(data || [])].sort((a, b) => a.due_date.localeCompare(b.due_date)))
      setNewTitle('')
      setNewDate('')
      setNewNotes('')
      setShowAddForm(false)
      setToast({ type: 'success', msg: t('deadlines.added') })
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  // Filter logic
  const filtered = deadlines.filter(d => {
    const days = diffDays(d.due_date)
    if (filter === 'upcoming') return d.status !== 'done' && days >= 0
    if (filter === 'completed') return d.status === 'done'
    if (filter === 'overdue') return d.status !== 'done' && days < 0
    return true // 'all'
  })

  const filterOptions = [
    { key: 'upcoming', label: t('deadlines.upcoming') },
    { key: 'overdue', label: t('deadlines.overdue') },
    { key: 'completed', label: t('deadlines.completed') },
    { key: 'all', label: t('deadlines.all') },
  ]

  const inputStyle = {
    width: '100%', padding: '10px 12px', fontSize: '14px',
    background: theme.card2, color: theme.text,
    border: '1px solid ' + theme.border, borderRadius: '10px',
    outline: 'none', boxSizing: 'border-box',
  }

  if (loading) {
    return <div style={{ textAlign: 'center', color: theme.dim, padding: '40px 0' }}>{t('deadlines.loading')}</div>
  }

  if (error) {
    return <div style={{ textAlign: 'center', color: '#ef4444', padding: '40px 0' }}>{error}</div>
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: '10px', zIndex: 9999, fontSize: '13px', fontWeight: 600,
          background: toast.type === 'success' ? '#22c55e' : '#ef4444', color: '#fff',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {filterOptions.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: 600,
              borderRadius: '20px', border: 'none', cursor: 'pointer',
              background: filter === f.key ? '#f59e0b' : theme.card2,
              color: filter === f.key ? '#000' : theme.text,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Deadline list */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', color: theme.dim, padding: '40px 0', fontSize: '14px',
        }}>
          {t('deadlines.emptyState')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(d => {
            const days = diffDays(d.due_date)
            const isDone = d.status === 'done'
            const isOverdue = !isDone && days < 0

            let badgeBg, badgeColor, badgeText
            if (isDone) {
              badgeBg = 'rgba(34,197,94,0.15)'
              badgeColor = '#22c55e'
              badgeText = '\u2713 ' + t('deadlines.done')
            } else if (isOverdue) {
              badgeBg = 'rgba(239,68,68,0.15)'
              badgeColor = '#ef4444'
              badgeText = '\u26A0 ' + t('deadlines.overdueDays').replace('{{count}}', Math.abs(days))
            } else if (days <= 7) {
              badgeBg = 'rgba(239,68,68,0.15)'
              badgeColor = '#ef4444'
              badgeText = '\u26A0 ' + t('deadlines.daysLeft').replace('{{count}}', days)
            } else if (days <= 30) {
              badgeBg = 'rgba(245,158,11,0.15)'
              badgeColor = '#f59e0b'
              badgeText = t('deadlines.daysLeft').replace('{{count}}', days)
            } else {
              badgeBg = 'rgba(100,116,139,0.12)'
              badgeColor = theme.dim
              badgeText = t('deadlines.daysLeft').replace('{{count}}', days)
            }

            return (
              <div
                key={d.id}
                style={{
                  background: isOverdue ? 'rgba(239,68,68,0.06)' : theme.card,
                  border: '1px solid ' + (isOverdue ? 'rgba(239,68,68,0.3)' : theme.border),
                  borderRadius: '12px', padding: '14px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  opacity: isDone ? 0.6 : 1,
                }}
              >
                {/* Icon */}
                <div style={{ fontSize: '24px', flexShrink: 0 }}>
                  {getCategoryIcon(d.deadline_type)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 600, color: theme.text,
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.dim, marginTop: '2px' }}>
                    {formatDate(d.due_date)}
                  </div>
                  {d.notes && (
                    <div style={{ fontSize: '11px', color: theme.dim, marginTop: '4px', fontStyle: 'italic' }}>
                      {d.notes}
                    </div>
                  )}
                </div>

                {/* Badge */}
                <div style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                  background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {badgeText}
                </div>

                {/* Done/Undo button */}
                <button
                  onClick={() => isDone ? markPending(d.id) : markDone(d.id)}
                  title={isDone ? t('deadlines.markPending') : t('deadlines.markDone')}
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                    cursor: 'pointer', fontSize: '16px', flexShrink: 0,
                    background: isDone ? 'rgba(100,116,139,0.15)' : 'rgba(34,197,94,0.15)',
                    color: isDone ? theme.dim : '#22c55e',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isDone ? '\u21A9' : '\u2713'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add deadline button / form */}
      {showAddForm ? (
        <div style={{
          marginTop: '16px', background: theme.card, border: '1px solid ' + theme.border,
          borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>
            {t('deadlines.addDeadline')}
          </div>
          <input
            type="text"
            placeholder={t('deadlines.titlePlaceholder')}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            style={inputStyle}
          />
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder={t('deadlines.notesPlaceholder')}
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={addDeadline}
              disabled={saving || !newTitle.trim() || !newDate}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                background: '#f59e0b', color: '#000', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', opacity: (saving || !newTitle.trim() || !newDate) ? 0.5 : 1,
              }}
            >
              {saving ? '...' : t('deadlines.save')}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewTitle(''); setNewDate(''); setNewNotes('') }}
              style={{
                padding: '10px 16px', borderRadius: '10px', border: '1px solid ' + theme.border,
                background: 'transparent', color: theme.text, fontSize: '14px', cursor: 'pointer',
              }}
            >
              {t('deadlines.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            marginTop: '16px', width: '100%', padding: '12px', borderRadius: '12px',
            border: '1px dashed ' + theme.border, background: 'transparent',
            color: theme.dim, fontSize: '14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {'\u2795 ' + t('deadlines.addDeadline')}
        </button>
      )}
    </div>
  )
}
