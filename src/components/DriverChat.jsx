import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { fetchChatMessages, sendChatMessage } from '../lib/api'

export default function DriverChat({ userId, profile, onClose }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const channelRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchChatMessages()
        if (!cancelled) {
          setMessages(data)
          setLoading(false)
          scrollToBottom()
        }
      } catch (e) {
        console.error('fetchChatMessages error:', e)
        if (!cancelled) setLoading(false)
      }
    }
    load()

    const channel = supabase
      .channel('chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        if (!cancelled) {
          setMessages((prev) => [...prev, payload.new])
          scrollToBottom()
        }
      })
      .subscribe()

    channelRef.current = channel

    // Save last visit timestamp
    try {
      localStorage.setItem('truckerbook_chat_last_visit', new Date().toISOString())
    } catch {}

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [scrollToBottom])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      await sendChatMessage(userId, profile?.name || profile?.first_name || 'Driver', trimmed, null)
    } catch (e) {
      console.error('sendChatMessage error:', e)
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClose = () => {
    try {
      localStorage.setItem('truckerbook_chat_last_visit', new Date().toISOString())
    } catch {}
    onClose()
  }

  const formatTime = (ts) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: theme.bg,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid ' + theme.border,
        background: theme.card,
        gap: 12,
        flexShrink: 0,
      }}>
        <button
          onClick={handleClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: theme.text, padding: 0,
          }}
        >
          {'\u2190'}
        </button>
        <span style={{ fontSize: 20 }}>{'\uD83D\uDCAC'}</span>
        <span style={{ fontSize: 17, fontWeight: 600, color: theme.text }}>
          {t('chat.title')}
        </span>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {loading && (
          <div style={{ textAlign: 'center', color: theme.dim, padding: 40 }}>
            {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: theme.dim, padding: 40 }}>
            {t('chat.empty')}
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.user_id === userId
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isMine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
              }}
            >
              {!isMine && (
                <div style={{
                  fontSize: 12, color: '#f59e0b', fontWeight: 600,
                  marginBottom: 2, paddingLeft: 4,
                }}>
                  {msg.sender_name || 'Driver'}
                </div>
              )}
              <div style={{
                padding: '8px 12px',
                borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: isMine ? '#f59e0b' : theme.card2,
                color: isMine ? '#000' : theme.text,
                fontSize: 15,
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}>
                {msg.message}
              </div>
              <div style={{
                fontSize: 11,
                color: theme.dim,
                marginTop: 2,
                textAlign: isMine ? 'right' : 'left',
                paddingLeft: isMine ? 0 : 4,
                paddingRight: isMine ? 4 : 0,
              }}>
                {formatTime(msg.created_at)}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderTop: '1px solid ' + theme.border,
        background: theme.card,
        flexShrink: 0,
      }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: theme.card2,
            border: '1px solid ' + theme.border,
            borderRadius: 20,
            color: theme.text,
            fontSize: 15,
            outline: 'none',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            border: 'none',
            background: text.trim() && !sending
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : theme.card2,
            color: text.trim() && !sending ? '#fff' : theme.dim,
            fontSize: 18,
            cursor: text.trim() && !sending ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {'\u27A4'}
        </button>
      </div>
    </div>
  )
}

export function useChatUnread() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false

    const checkUnread = async () => {
      try {
        const lastVisit = localStorage.getItem('truckerbook_chat_last_visit')
        if (!lastVisit) {
          const { count, error } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
          if (!error && !cancelled) setUnread(count || 0)
        } else {
          const { count, error } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', lastVisit)
          if (!error && !cancelled) setUnread(count || 0)
        }
      } catch {}
    }

    checkUnread()
    const interval = setInterval(checkUnread, 30000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const resetUnread = useCallback(() => {
    setUnread(0)
    try {
      localStorage.setItem('truckerbook_chat_last_visit', new Date().toISOString())
    } catch {}
  }, [])

  return { unread, resetUnread }
}
