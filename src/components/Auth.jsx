import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { hashPin } from './PinLock'
import BrandComboBox from './BrandComboBox'

const COUNTRIES = [
  // \u0421\u041d\u0413
  { flag: '\ud83c\uddf7\ud83c\uddfa', code: '+7', name: '\u0420\u043e\u0441\u0441\u0438\u044f', id: 'ru' },
  { flag: '\ud83c\uddfa\ud83c\udde6', code: '+380', name: '\u0423\u043a\u0440\u0430\u0438\u043d\u0430', id: 'ua' },
  { flag: '\ud83c\udde7\ud83c\uddfe', code: '+375', name: '\u0411\u0435\u043b\u0430\u0440\u0443\u0441\u044c', id: 'by' },
  { flag: '\ud83c\uddf0\ud83c\uddff', code: '+7', name: '\u041a\u0430\u0437\u0430\u0445\u0441\u0442\u0430\u043d', id: 'kz' },
  { flag: '\ud83c\uddfa\ud83c\uddff', code: '+998', name: '\u0423\u0437\u0431\u0435\u043a\u0438\u0441\u0442\u0430\u043d', id: 'uz' },
  { flag: '\ud83c\uddf0\ud83c\uddec', code: '+996', name: '\u041a\u044b\u0440\u0433\u044b\u0437\u0441\u0442\u0430\u043d', id: 'kg' },
  { flag: '\ud83c\uddf9\ud83c\uddef', code: '+992', name: '\u0422\u0430\u0434\u0436\u0438\u043a\u0438\u0441\u0442\u0430\u043d', id: 'tj' },
  { flag: '\ud83c\uddf9\ud83c\uddf2', code: '+993', name: '\u0422\u0443\u0440\u043a\u043c\u0435\u043d\u0438\u0441\u0442\u0430\u043d', id: 'tm' },
  { flag: '\ud83c\udde6\ud83c\uddff', code: '+994', name: '\u0410\u0437\u0435\u0440\u0431\u0430\u0439\u0434\u0436\u0430\u043d', id: 'az' },
  { flag: '\ud83c\udde6\ud83c\uddf2', code: '+374', name: '\u0410\u0440\u043c\u0435\u043d\u0438\u044f', id: 'am' },
  { flag: '\ud83c\uddec\ud83c\uddea', code: '+995', name: '\u0413\u0440\u0443\u0437\u0438\u044f', id: 'ge' },
  { flag: '\ud83c\uddf2\ud83c\udde9', code: '+373', name: '\u041c\u043e\u043b\u0434\u043e\u0432\u0430', id: 'md' },
  // \u0415\u0432\u0440\u043e\u043f\u0430
  { flag: '\ud83c\uddf9\ud83c\uddf7', code: '+90', name: '\u0422\u0443\u0440\u0446\u0438\u044f', id: 'tr' },
  { flag: '\ud83c\udde9\ud83c\uddea', code: '+49', name: '\u0413\u0435\u0440\u043c\u0430\u043d\u0438\u044f', id: 'de' },
  { flag: '\ud83c\uddf5\ud83c\uddf1', code: '+48', name: '\u041f\u043e\u043b\u044c\u0448\u0430', id: 'pl' },
  { flag: '\ud83c\uddf7\ud83c\uddf4', code: '+40', name: '\u0420\u0443\u043c\u044b\u043d\u0438\u044f', id: 'ro' },
  { flag: '\ud83c\udde7\ud83c\uddec', code: '+359', name: '\u0411\u043e\u043b\u0433\u0430\u0440\u0438\u044f', id: 'bg' },
  { flag: '\ud83c\udde8\ud83c\uddff', code: '+420', name: '\u0427\u0435\u0445\u0438\u044f', id: 'cz' },
  { flag: '\ud83c\udded\ud83c\uddfa', code: '+36', name: '\u0412\u0435\u043d\u0433\u0440\u0438\u044f', id: 'hu' },
  { flag: '\ud83c\udde6\ud83c\uddf9', code: '+43', name: '\u0410\u0432\u0441\u0442\u0440\u0438\u044f', id: 'at' },
  { flag: '\ud83c\uddf3\ud83c\uddf1', code: '+31', name: '\u041d\u0438\u0434\u0435\u0440\u043b\u0430\u043d\u0434\u044b', id: 'nl' },
  { flag: '\ud83c\udde7\ud83c\uddea', code: '+32', name: '\u0411\u0435\u043b\u044c\u0433\u0438\u044f', id: 'be' },
  { flag: '\ud83c\uddeb\ud83c\uddf7', code: '+33', name: '\u0424\u0440\u0430\u043d\u0446\u0438\u044f', id: 'fr' },
  { flag: '\ud83c\uddee\ud83c\uddf9', code: '+39', name: '\u0418\u0442\u0430\u043b\u0438\u044f', id: 'it' },
  { flag: '\ud83c\uddea\ud83c\uddf8', code: '+34', name: '\u0418\u0441\u043f\u0430\u043d\u0438\u044f', id: 'es' },
  { flag: '\ud83c\uddec\ud83c\udde7', code: '+44', name: '\u0412\u0435\u043b\u0438\u043a\u043e\u0431\u0440\u0438\u0442\u0430\u043d\u0438\u044f', id: 'gb' },
  { flag: '\ud83c\uddee\ud83c\uddea', code: '+353', name: '\u0418\u0440\u043b\u0430\u043d\u0434\u0438\u044f', id: 'ie' },
  { flag: '\ud83c\uddeb\ud83c\uddee', code: '+358', name: '\u0424\u0438\u043d\u043b\u044f\u043d\u0434\u0438\u044f', id: 'fi' },
  { flag: '\ud83c\uddf8\ud83c\uddea', code: '+46', name: '\u0428\u0432\u0435\u0446\u0438\u044f', id: 'se' },
  { flag: '\ud83c\uddf3\ud83c\uddf4', code: '+47', name: '\u041d\u043e\u0440\u0432\u0435\u0433\u0438\u044f', id: 'no' },
  { flag: '\ud83c\udde9\ud83c\uddf0', code: '+45', name: '\u0414\u0430\u043d\u0438\u044f', id: 'dk' },
  { flag: '\ud83c\uddf1\ud83c\uddf9', code: '+370', name: '\u041b\u0438\u0442\u0432\u0430', id: 'lt' },
  { flag: '\ud83c\uddf1\ud83c\uddfb', code: '+371', name: '\u041b\u0430\u0442\u0432\u0438\u044f', id: 'lv' },
  { flag: '\ud83c\uddea\ud83c\uddea', code: '+372', name: '\u042d\u0441\u0442\u043e\u043d\u0438\u044f', id: 'ee' },
  { flag: '\ud83c\udded\ud83c\uddf7', code: '+385', name: '\u0425\u043e\u0440\u0432\u0430\u0442\u0438\u044f', id: 'hr' },
  { flag: '\ud83c\uddf7\ud83c\uddf8', code: '+381', name: '\u0421\u0435\u0440\u0431\u0438\u044f', id: 'rs' },
  { flag: '\ud83c\uddf8\ud83c\uddf0', code: '+421', name: '\u0421\u043b\u043e\u0432\u0430\u043a\u0438\u044f', id: 'sk' },
  { flag: '\ud83c\uddf8\ud83c\uddee', code: '+386', name: '\u0421\u043b\u043e\u0432\u0435\u043d\u0438\u044f', id: 'si' },
  { flag: '\ud83c\uddec\ud83c\uddf7', code: '+30', name: '\u0413\u0440\u0435\u0446\u0438\u044f', id: 'gr' },
  { flag: '\ud83c\uddf5\ud83c\uddf9', code: '+351', name: '\u041f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u0438\u044f', id: 'pt' },
  { flag: '\ud83c\udde8\ud83c\udded', code: '+41', name: '\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0438\u044f', id: 'ch' },
  // \u0411\u043b\u0438\u0436\u043d\u0438\u0439 \u0412\u043e\u0441\u0442\u043e\u043a
  { flag: '\ud83c\udde6\ud83c\uddea', code: '+971', name: '\u041e\u0410\u042d', id: 'ae' },
  { flag: '\ud83c\uddf8\ud83c\udde6', code: '+966', name: '\u0421\u0430\u0443\u0434\u043e\u0432\u0441\u043a\u0430\u044f \u0410\u0440\u0430\u0432\u0438\u044f', id: 'sa' },
  { flag: '\ud83c\uddf6\ud83c\udde6', code: '+974', name: '\u041a\u0430\u0442\u0430\u0440', id: 'qa' },
  { flag: '\ud83c\uddf0\ud83c\uddfc', code: '+965', name: '\u041a\u0443\u0432\u0435\u0439\u0442', id: 'kw' },
  { flag: '\ud83c\udde7\ud83c\udded', code: '+973', name: '\u0411\u0430\u0445\u0440\u0435\u0439\u043d', id: 'bh' },
  { flag: '\ud83c\uddf4\ud83c\uddf2', code: '+968', name: '\u041e\u043c\u0430\u043d', id: 'om' },
  { flag: '\ud83c\uddee\ud83c\uddf6', code: '+964', name: '\u0418\u0440\u0430\u043a', id: 'iq' },
  { flag: '\ud83c\uddef\ud83c\uddf4', code: '+962', name: '\u0418\u043e\u0440\u0434\u0430\u043d\u0438\u044f', id: 'jo' },
  { flag: '\ud83c\uddf1\ud83c\udde7', code: '+961', name: '\u041b\u0438\u0432\u0430\u043d', id: 'lb' },
  { flag: '\ud83c\uddea\ud83c\uddec', code: '+20', name: '\u0415\u0433\u0438\u043f\u0435\u0442', id: 'eg' },
  { flag: '\ud83c\uddee\ud83c\uddf7', code: '+98', name: '\u0418\u0440\u0430\u043d', id: 'ir' },
  // \u0410\u0437\u0438\u044f \u0438 \u041b\u0430\u0442\u0438\u043d\u0441\u043a\u0430\u044f \u0410\u043c\u0435\u0440\u0438\u043a\u0430
  { flag: '\ud83c\uddee\ud83c\uddf3', code: '+91', name: '\u0418\u043d\u0434\u0438\u044f', id: 'in' },
  { flag: '\ud83c\uddf5\ud83c\uddf0', code: '+92', name: '\u041f\u0430\u043a\u0438\u0441\u0442\u0430\u043d', id: 'pk' },
  { flag: '\ud83c\udde8\ud83c\uddf3', code: '+86', name: '\u041a\u0438\u0442\u0430\u0439', id: 'cn' },
  { flag: '\ud83c\uddf2\ud83c\uddfd', code: '+52', name: '\u041c\u0435\u043a\u0441\u0438\u043a\u0430', id: 'mx' },
  { flag: '\ud83c\udde7\ud83c\uddf7', code: '+55', name: '\u0411\u0440\u0430\u0437\u0438\u043b\u0438\u044f', id: 'br' },
  { flag: '\ud83c\udde6\ud83c\uddf7', code: '+54', name: '\u0410\u0440\u0433\u0435\u043d\u0442\u0438\u043d\u0430', id: 'ar' },
  // \u0414\u0440\u0443\u0433\u0438\u0435
  { flag: '\ud83c\uddfa\ud83c\uddf8', code: '+1', name: '\u0421\u0428\u0410', id: 'us' },
  { flag: '\ud83c\udde8\ud83c\udde6', code: '+1', name: '\u041a\u0430\u043d\u0430\u0434\u0430', id: 'ca' },
  { flag: '\ud83c\uddee\ud83c\uddf1', code: '+972', name: '\u0418\u0437\u0440\u0430\u0438\u043b\u044c', id: 'il' },
  { flag: '\ud83c\uddf2\ud83c\uddf3', code: '+976', name: '\u041c\u043e\u043d\u0433\u043e\u043b\u0438\u044f', id: 'mn' },
]


const styles = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  inner: {
    flex: 1,
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    fontWeight: 800,
    color: '#fff',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    textAlign: 'center',
    letterSpacing: 2,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    background: '#1a2235',
    border: '1px solid #1e2a3f',
    borderRadius: 12,
    color: '#e2e8f0',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '14px 16px',
    background: '#1a2235',
    border: '1px solid #1e2a3f',
    borderRadius: 12,
    color: '#e2e8f0',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'none',
  },
  label: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
    display: 'block',
  },
  btnPrimary: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none',
    borderRadius: 14,
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnDisabled: {
    width: '100%',
    padding: '16px',
    background: '#1e2a3f',
    border: 'none',
    borderRadius: 14,
    color: '#64748b',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'not-allowed',
  },
  btnSecondary: {
    width: '100%',
    padding: '14px',
    background: 'transparent',
    border: '1px solid #1e2a3f',
    borderRadius: 14,
    color: '#64748b',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 12,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 0 20px',
    alignSelf: 'flex-start',
  },
  card: {
    background: '#111827',
    borderRadius: 16,
    padding: 20,
    border: '1px solid #1e2a3f',
  },
  dot: (filled) => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: filled ? '#f59e0b' : '#1e2a3f',
    transition: 'background 0.15s',
  }),
  numKey: {
    width: 72,
    height: 54,
    borderRadius: 14,
    background: '#1a2235',
    border: '1px solid #1e2a3f',
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numKeyEmpty: {
    width: 72,
    height: 54,
    visibility: 'hidden',
  },
  stepDot: (active) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? '#f59e0b' : '#1e2a3f',
  }),
}

const shakeKeyframes = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
`

function NumPad({ onDigit, onBackspace }) {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'back']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, justifyItems: 'center', marginTop: 24 }}>
      {keys.map((k, i) => {
        if (k === null) return <div key={i} style={styles.numKeyEmpty} />
        if (k === 'back') {
          return (
            <button key={i} style={styles.numKey} onClick={onBackspace}>
              {'\u232b'}
            </button>
          )
        }
        return (
          <button key={i} style={styles.numKey} onClick={() => onDigit(k)}>
            {k}
          </button>
        )
      })}
    </div>
  )
}

function PinDots({ length, shake, total = 4 }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        marginTop: 32,
        animation: shake ? 'shake 0.4s ease' : 'none',
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={styles.dot(i < length)} />
      ))}
    </div>
  )
}

// ===== SCREEN 1: PHONE =====
function PhoneScreen({ phone, setPhone, country, setCountry, onNext, loading, error }) {
  // E.164: total digits (country code + number) must be 7-15
  const phoneDigits = phone.replace(/\D/g, '')
  const codeDigits = country.code.replace(/\D/g, '')
  const totalDigits = codeDigits.length + phoneDigits.length
  const valid = phoneDigits.length >= 1 && totalDigits >= 7 && totalDigits <= 15
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  useEffect(() => {
    if (dropdownOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [dropdownOpen])

  const filtered = COUNTRIES.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.code.includes(q)
  })

  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={styles.logo}>{'\u0422\u0411'}</div>
        <h1 style={styles.title}>TRUCKERBOOK</h1>
        <p style={styles.subtitle}>{'\u041f\u043e\u043b\u043d\u044b\u0439 \u0443\u0447\u0451\u0442 \u0434\u043b\u044f \u0434\u0430\u043b\u044c\u043d\u043e\u0431\u043e\u0439\u0449\u0438\u043a\u0430'}</p>

        <div style={{ marginTop: 40 }}>
          <label style={styles.label}>{'\u041d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => { setDropdownOpen(!dropdownOpen); setSearch('') }}
                style={{
                  padding: '14px 12px',
                  background: '#1a2235',
                  border: '1px solid #1e2a3f',
                  borderRadius: 12,
                  color: '#e2e8f0',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{country.flag}</span>
                <span>{country.code}</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>{'\u25be'}</span>
              </button>
              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: '#1a2235',
                  border: '1px solid #1e2a3f',
                  borderRadius: 12,
                  overflow: 'hidden',
                  zIndex: 100,
                  width: 280,
                  maxHeight: 360,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={'\u041f\u043e\u0438\u0441\u043a \u0441\u0442\u0440\u0430\u043d\u044b...'}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: '#111827',
                        border: '1px solid #1e2a3f',
                        borderRadius: 8,
                        color: '#e2e8f0',
                        fontSize: 14,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCountry(c); setDropdownOpen(false); setSearch('') }}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          background: c.id === country.id ? '#111827' : 'transparent',
                          border: 'none',
                          color: '#e2e8f0',
                          fontSize: 15,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          textAlign: 'left',
                        }}
                      >
                        <span>{c.flag}</span>
                        <span style={{ flex: 1 }}>{c.name}</span>
                        <span style={{ color: '#64748b', fontSize: 14 }}>{c.code}</span>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div style={{ padding: '16px 14px', color: '#64748b', fontSize: 14, textAlign: 'center' }}>
                        {'\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <input
              style={styles.input}
              type="tel"
              placeholder="XXX XXX XX XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={13}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', margin: '0 0 12px' }}>{error}</p>
        )}

        <button
          style={valid && !loading ? styles.btnPrimary : styles.btnDisabled}
          disabled={!valid || loading}
          onClick={onNext}
        >
          {loading ? '\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...' : '\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043a\u043e\u0434'}
        </button>

        <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 16 }}>
          {'\u041d\u0430\u0436\u0438\u043c\u0430\u044f \u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043a\u043e\u0434, \u0432\u044b \u043f\u0440\u0438\u043d\u0438\u043c\u0430\u0435\u0442\u0435 '}
          <span style={{ color: '#f59e0b', cursor: 'pointer' }}>{'\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f'}</span>
        </p>
      </div>
    </div>
  )
}

// ===== SCREEN 2: SMS CODE =====
function SmsScreen({ phone, countryCode, onBack, onNext, onResend }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const handleDigit = (d) => {
    if (code.length < 6) {
      setCode((prev) => prev + d)
      setError(false)
      setErrorMsg('')
    }
  }
  const handleBack = () => setCode((prev) => prev.slice(0, -1))

  const handleConfirm = async () => {
    if (code.length !== 6 || loading) return
    setLoading(true)
    setError(false)
    setErrorMsg('')
    const fullPhone = countryCode + phone.replace(/\D/g, '')
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: code,
      type: 'sms',
    })
    setLoading(false)
    if (verifyError) {
      setError(true)
      setErrorMsg(verifyError.message)
      setCode('')
    } else {
      onNext()
    }
  }

  const handleResend = async () => {
    if (resending) return
    setResending(true)
    await onResend()
    setResending(false)
  }

  return (
    <div style={styles.inner}>
      <button style={styles.backBtn} onClick={onBack}>
        {'\u2190 \u041d\u0430\u0437\u0430\u0434'}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udcf1'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438\u0437 SMS'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          {'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u043d\u0430 ' + countryCode + ' ' + phone}
        </p>

        {errorMsg && (
          <p style={{ color: '#ef4444', fontSize: 14, margin: '12px 0 0' }}>{errorMsg}</p>
        )}

        <PinDots length={code.length} shake={error} total={6} />

        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <button
          style={{ ...(code.length === 6 && !loading ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
          disabled={code.length < 6 || loading}
          onClick={handleConfirm}
        >
          {loading ? '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430...' : '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c'}
        </button>

        <p
          style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 20, cursor: 'pointer' }}
          onClick={handleResend}
        >
          {resending ? '\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...' : (
            <>{'\u041d\u0435 \u043f\u0440\u0438\u0448\u0451\u043b? '}<span style={{ color: '#f59e0b' }}>{'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430'}</span></>
          )}
        </p>
      </div>
    </div>
  )
}

// ===== SCREEN 2.5: ROLE SELECTION =====
function RoleScreen({ role, setRole, onNext }) {
  const roles = [
    { value: 'driver', icon: '\ud83d\ude9b', title: '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', desc: '\u0415\u0441\u0442\u044c \u043c\u0430\u0448\u0438\u043d\u0430, \u0432\u0435\u0434\u0443 \u0443\u0447\u0451\u0442' },
    { value: 'company', icon: '\ud83c\udfe2', title: '\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f', desc: '\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u044e \u043f\u0430\u0440\u043a\u043e\u043c \u043c\u0430\u0448\u0438\u043d' },
    { value: 'job_seeker', icon: '\ud83d\udd0d', title: '\u0418\u0449\u0443 \u0440\u0430\u0431\u043e\u0442\u0443', desc: '\u041d\u0443\u0436\u043d\u0430 \u0440\u0430\u0431\u043e\u0442\u0430 \u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u043c' },
  ]

  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udc64'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {'\u041a\u0442\u043e \u0432\u044b?'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 32px' }}>
          {'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0430\u0448\u0443 \u0440\u043e\u043b\u044c'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              style={{
                ...styles.card,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '20px 20px',
                cursor: 'pointer',
                border: role === r.value ? '2px solid #f59e0b' : '1px solid #1e2a3f',
                background: role === r.value ? '#1a1500' : '#111827',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ fontSize: 36, flexShrink: 0 }}>{r.icon}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>{r.title}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <button
          style={{ ...(role ? styles.btnPrimary : styles.btnDisabled), marginTop: 32, width: '100%' }}
          disabled={!role}
          onClick={onNext}
        >
          {'\u0414\u0430\u043b\u0435\u0435 \u2192'}
        </button>
      </div>
    </div>
  )
}

// ===== SCREEN 3b: JOB SEEKER MINI-PROFILE =====
function JobSeekerProfileScreen({ profile, setProfile, onNext, saving, error }) {
  const valid = profile.name && !saving

  const cdlOptions = ['B', 'C', 'CE', 'D', 'CDL-A', 'CDL-B']

  return (
    <div style={styles.inner}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udd0d'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '12px 0 4px' }}>
          {'\u0420\u0430\u0441\u0441\u043a\u0430\u0436\u0438\u0442\u0435 \u043e \u0441\u0435\u0431\u0435'}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <div>
          <label style={styles.label}>{'\u0418\u043c\u044f'}</label>
          <input
            style={styles.input}
            placeholder={'\u0418\u0432\u0430\u043d'}
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>{'\u0413\u043e\u0440\u043e\u0434'}</label>
          <input
            style={styles.input}
            placeholder={'\u041c\u043e\u0441\u043a\u0432\u0430'}
            value={profile.city || ''}
            onChange={(e) => setProfile({ ...profile, city: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>{'\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f \u043f\u0440\u0430\u0432'}</label>
          <select
            style={styles.select}
            value={profile.cdl_category || ''}
            onChange={(e) => setProfile({ ...profile, cdl_category: e.target.value })}
          >
            <option value="">{'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435...'}</option>
            {cdlOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>{'\u0421\u0442\u0430\u0436 \u0432\u043e\u0436\u0434\u0435\u043d\u0438\u044f (\u043b\u0435\u0442)'}</label>
          <input
            style={styles.input}
            type="number"
            placeholder="5"
            min="0"
            value={profile.experience_years || ''}
            onChange={(e) => setProfile({ ...profile, experience_years: e.target.value })}
          />
        </div>
      </div>

      {error && (
        <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', margin: '12px 0 0' }}>{error}</p>
      )}

      <button
        style={{ ...(valid ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
        disabled={!valid}
        onClick={onNext}
      >
        {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0414\u0430\u043b\u0435\u0435 \u2192'}
      </button>
    </div>
  )
}

// ===== SCREEN 3: PROFILE =====
function ProfileScreen({ profile, setProfile, onNext, saving, error }) {
  const valid = profile.name && profile.brand && profile.model && profile.mileage && !saving

  return (
    <div style={styles.inner}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\ude9b'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '12px 0 4px' }}>
          {'\u0420\u0430\u0441\u0441\u043a\u0430\u0436\u0438\u0442\u0435 \u043e \u0441\u0435\u0431\u0435'}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <div>
          <label style={styles.label}>{'\u0418\u043c\u044f'}</label>
          <input
            style={styles.input}
            placeholder={'\u0418\u0432\u0430\u043d'}
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>{'\u041c\u0430\u0440\u043a\u0430'}</label>
          <BrandComboBox
            value={profile.brand}
            onChange={(v) => setProfile({ ...profile, brand: v })}
            inputStyle={styles.input}
            dropdownBg="#1a2235"
            dropdownBorder="#1e2a3f"
            textColor="#e2e8f0"
            dimColor="#64748b"
            hoverBg="#111827"
          />
        </div>

        <div>
          <label style={styles.label}>{'\u041c\u043e\u0434\u0435\u043b\u044c'}</label>
          <input
            style={styles.input}
            placeholder={'\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: FH, Actros, 5490'}
            value={profile.model}
            onChange={(e) => setProfile({ ...profile, model: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>{'\u041f\u0440\u043e\u0431\u0435\u0433, \u043a\u043c'}</label>
          <input
            style={styles.input}
            type="number"
            placeholder="500000"
            value={profile.mileage}
            onChange={(e) => setProfile({ ...profile, mileage: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>{'\u0413\u043e\u0441\u043d\u043e\u043c\u0435\u0440 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)'}</label>
          <input
            style={styles.input}
            placeholder={'\u0410123\u0411\u0412 77'}
            value={profile.plate}
            onChange={(e) => setProfile({ ...profile, plate: e.target.value })}
          />
        </div>

        <div>
          <label style={styles.label}>
            {'\u0420\u0430\u0441\u0445\u043e\u0434, \u043b/100\u043a\u043c: '}{profile.consumption}
          </label>
          <input
            type="range"
            min={20}
            max={50}
            value={profile.consumption}
            onChange={(e) => setProfile({ ...profile, consumption: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
            <span>20</span>
            <span>50</span>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', margin: '12px 0 0' }}>{error}</p>
      )}

      <button
        style={{ ...(valid ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
        disabled={!valid}
        onClick={onNext}
      >
        {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0414\u0430\u043b\u0435\u0435 \u2192'}
      </button>
    </div>
  )
}

// ===== SCREEN 4: CREATE PIN =====
function PinScreen({ onNext }) {
  const [pinStep, setPinStep] = useState(1)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const currentPin = pinStep === 1 ? pin1 : pin2
  const setCurrentPin = pinStep === 1 ? setPin1 : setPin2

  const handleDigit = async (d) => {
    if (currentPin.length >= 4 || saving) return
    const next = currentPin + d
    setCurrentPin(next)
    setError('')

    if (next.length === 4) {
      if (pinStep === 1) {
        setTimeout(() => setPinStep(2), 300)
      } else {
        if (next === pin1) {
          setSaving(true)
          try {
            const h = await hashPin(next)
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await supabase.from('profiles').update({ pin_hash: h }).eq('id', user.id)
            }
          } catch (e) {
            console.error('Failed to save PIN hash:', e)
          }
          setSaving(false)
          setTimeout(() => onNext(), 300)
        } else {
          setShake(true)
          setError('\u041d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442!')
          setTimeout(() => {
            setShake(false)
            setPin2('')
          }, 500)
        }
      }
    }
  }

  const handleBack = () => {
    setCurrentPin(currentPin.slice(0, -1))
    setError('')
  }

  return (
    <div style={styles.inner}>
      <style>{shakeKeyframes}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udd12'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {pinStep === 1 ? '\u041f\u0440\u0438\u0434\u0443\u043c\u0430\u0439\u0442\u0435 PIN-\u043a\u043e\u0434' : '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 PIN-\u043a\u043e\u0434'}
        </h2>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, margin: '8px 0 0' }}>{error}</p>
        )}

        <PinDots length={currentPin.length} shake={shake} />

        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
          <div style={styles.stepDot(pinStep >= 1)} />
          <div style={styles.stepDot(pinStep >= 2)} />
        </div>
      </div>
    </div>
  )
}

// ===== SCREEN 5: BIOMETRIC =====
function BiometricScreen({ onEnable, onSkip }) {
  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
            <circle cx="48" cy="48" r="46" stroke="#1e2a3f" strokeWidth="2"/>
            <path d="M48 20c-15.5 0-28 12.5-28 28s12.5 28 28 28" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" fill="none"/>
            <path d="M48 28c-11 0-20 9-20 20s9 20 20 20" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M48 36c-6.6 0-12 5.4-12 12s5.4 12 12 12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
            <line x1="48" y1="44" x2="48" y2="56" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <div style={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: '#fff',
            fontWeight: 700,
          }}>
            {'\u2713'}
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
          {'\u0412\u0445\u043e\u0434 \u043f\u043e \u043b\u0438\u0446\u0443 \u0438\u043b\u0438 \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0443'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', margin: '0 0 40px', lineHeight: 1.5 }}>
          {'\u0412\u043c\u0435\u0441\u0442\u043e PIN-\u043a\u043e\u0434\u0430 \u043c\u043e\u0436\u043d\u043e \u0432\u0445\u043e\u0434\u0438\u0442\u044c \u043f\u043e Face ID \u0438\u043b\u0438 \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0443'}
        </p>

        <button style={styles.btnPrimary} onClick={onEnable}>
          {'\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c'}
        </button>
        <button style={styles.btnSecondary} onClick={onSkip}>
          {'\u041f\u043e\u0437\u0436\u0435'}
        </button>
      </div>
    </div>
  )
}

// ===== SCREEN 7: WELCOME =====
function WelcomeScreen({ profile, biometricEnabled, onStart, role }) {
  const isJobSeeker = role === 'job_seeker'

  const driverFeatures = [
    { icon: '\u26fd', label: '\u0423\u0447\u0451\u0442 \u0442\u043e\u043f\u043b\u0438\u0432\u0430' },
    { icon: '\ud83d\udccd', label: '\u0420\u0435\u0439\u0441\u044b' },
    { icon: '\ud83d\udd27', label: '\u0421\u0435\u0440\u0432\u0438\u0441' },
    { icon: '\ud83c\udfe8', label: '\u0411\u044b\u0442' },
    { icon: '\u2705', label: '\u0427\u0435\u043a-\u043b\u0438\u0441\u0442' },
    { icon: '\ud83d\uddfa\ufe0f', label: '\u041a\u0430\u0440\u0442\u0430' },
  ]

  const jobSeekerFeatures = [
    { icon: '\ud83d\udcbc', label: '\u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438' },
    { icon: '\ud83d\udcf0', label: '\u041d\u043e\u0432\u043e\u0441\u0442\u0438' },
    { icon: '\ud83d\udecd\ufe0f', label: '\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441' },
  ]

  const features = isJobSeeker ? jobSeekerFeatures : driverFeatures

  const formattedMileage = Number(profile.mileage || 0).toLocaleString('ru-RU')

  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48 }}>
        <div style={{ fontSize: 56 }}>{'\ud83c\udf89'}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0 4px', textAlign: 'center' }}>
          {'\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c, ' + profile.name + '!'}
        </h2>
        {!isJobSeeker && (
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            {profile.brand + ' ' + profile.model + ' \u00b7 ' + formattedMileage + ' \u043a\u043c'}
          </p>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          padding: '8px 16px',
          background: '#0d2818',
          borderRadius: 20,
          border: '1px solid #14532d',
        }}>
          <span style={{ color: '#22c55e', fontSize: 14 }}>{'\u2713'}</span>
          <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
            {biometricEnabled ? 'Face ID \u0432\u043a\u043b\u044e\u0447\u0451\u043d' : 'PIN \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d'}
          </span>
        </div>

        {!isJobSeeker && (
          <div style={{
            ...styles.card,
            width: '100%',
            marginTop: 24,
            background: 'linear-gradient(135deg, #1a1500, #111827)',
            borderColor: '#3d2f00',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{'\ud83d\udd13'}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>
                {'7 \u0434\u043d\u0435\u0439 Pro \u2014 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e'}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, margin: '8px 0 0' }}>
              {'\u041f\u043e\u043b\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a\u043e \u0432\u0441\u0435\u043c \u0444\u0443\u043d\u043a\u0446\u0438\u044f\u043c'}
            </p>
          </div>
        )}

        {isJobSeeker && (
          <p style={{ color: '#64748b', fontSize: 14, margin: '24px 0 0', textAlign: 'center' }}>
            {'\u041d\u0430\u0439\u0434\u0438 \u0440\u0430\u0431\u043e\u0442\u0443 \u043c\u0435\u0447\u0442\u044b!'}
          </p>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          width: '100%',
          marginTop: 24,
        }}>
          {features.map((f) => (
            <div key={f.label} style={{
              ...styles.card,
              padding: 14,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{f.label}</div>
            </div>
          ))}
        </div>

        <button style={{ ...styles.btnPrimary, marginTop: 32 }} onClick={onStart}>
          {'\u041f\u043e\u0435\u0445\u0430\u043b\u0438! \ud83d\ude80'}
        </button>
      </div>
    </div>
  )
}

// ===== MAIN AUTH COMPONENT =====
// Flow: 1=Phone, 2=SMS, 3=Role, 4=Profile (driver/company) or JobSeekerProfile, 5=PIN, 6=Biometric, 7=Welcome
export default function Auth({ onComplete, onboardingOnly }) {
  const [step, setStep] = useState(onboardingOnly ? 3 : 1)
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [role, setRole] = useState('')
  const [profile, setProfile] = useState({
    name: '',
    brand: '',
    model: '',
    mileage: '',
    plate: '',
    consumption: 34,
    city: '',
    cdl_category: '',
    experience_years: '',
  })
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')

  const sendOtp = async () => {
    const fullPhone = country.code + phone.replace(/\D/g, '')
    setOtpLoading(true)
    setOtpError('')
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone })
    setOtpLoading(false)
    if (error) {
      setOtpError(error.message)
      return false
    }
    return true
  }

  const handlePhoneNext = async () => {
    const ok = await sendOtp()
    if (ok) setStep(2)
  }

  const saveProfileAndVehicle = async () => {
    setProfileSaving(true)
    setProfileError('')
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error(authErr?.message || 'No user')

      const fullPhone = phone ? country.code + phone.replace(/\D/g, '') : (user.phone || '')

      const isJobSeeker = role === 'job_seeker'

      // Upsert profile
      const profileData = {
        id: user.id,
        name: profile.name,
        phone: fullPhone,
        role: role,
        city: profile.city || null,
        cdl_category: profile.cdl_category || null,
        experience_years: profile.experience_years ? parseInt(profile.experience_years, 10) : null,
      }

      if (isJobSeeker) {
        profileData.plan = 'job_seeker'
      } else {
        profileData.brand = profile.brand
        profileData.model = profile.model
        profileData.odometer = parseInt(profile.mileage, 10) || 0
        profileData.plate_number = profile.plate || null
        profileData.fuel_consumption = profile.consumption || 34
        profileData.plan = 'trial'
        profileData.trial_ends_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }

      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
      if (profileErr) throw profileErr

      // Insert vehicle only for driver/company
      if (!isJobSeeker) {
        const { error: vehicleErr } = await supabase
          .from('vehicles')
          .insert({
            user_id: user.id,
            brand: profile.brand,
            model: profile.model,
            odometer: parseInt(profile.mileage, 10) || 0,
            plate_number: profile.plate || null,
            fuel_consumption: profile.consumption || 34,
          })
        if (vehicleErr) throw vehicleErr
      }

      setStep(5)
    } catch (err) {
      console.error('saveProfileAndVehicle error:', err)
      setProfileError(err.message || String(err))
    } finally {
      setProfileSaving(false)
    }
  }

  if (step === 1) {
    return (
      <div style={styles.container}>
        <PhoneScreen phone={phone} setPhone={setPhone} country={country} setCountry={setCountry} onNext={handlePhoneNext} loading={otpLoading} error={otpError} />
      </div>
    )
  }

  if (step === 2) {
    return (
      <div style={styles.container}>
        <SmsScreen phone={phone} countryCode={country.code} onBack={() => setStep(1)} onNext={() => setStep(3)} onResend={sendOtp} />
      </div>
    )
  }

  if (step === 3) {
    return (
      <div style={styles.container}>
        <RoleScreen role={role} setRole={setRole} onNext={() => setStep(4)} />
      </div>
    )
  }

  if (step === 4) {
    if (role === 'job_seeker') {
      return (
        <div style={styles.container}>
          <JobSeekerProfileScreen profile={profile} setProfile={setProfile} onNext={saveProfileAndVehicle} saving={profileSaving} error={profileError} />
        </div>
      )
    }
    return (
      <div style={styles.container}>
        <ProfileScreen profile={profile} setProfile={setProfile} onNext={saveProfileAndVehicle} saving={profileSaving} error={profileError} />
      </div>
    )
  }

  if (step === 5) {
    return (
      <div style={styles.container}>
        <PinScreen onNext={() => setStep(6)} />
      </div>
    )
  }

  if (step === 6) {
    return (
      <div style={styles.container}>
        <BiometricScreen
          onEnable={() => { setBiometricEnabled(true); setStep(7) }}
          onSkip={() => setStep(7)}
        />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <WelcomeScreen
        profile={profile}
        biometricEnabled={biometricEnabled}
        onStart={onComplete}
        role={role}
      />
    </div>
  )
}
