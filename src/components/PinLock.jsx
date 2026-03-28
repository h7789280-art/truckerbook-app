import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
  },
  inner: {
    flex: 1,
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
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
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 0 20px',
    alignSelf: 'flex-start',
  },
  stepDot: (active) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? '#f59e0b' : '#1e2a3f',
  }),
}

const shakeKeyframes = `
@keyframes pinShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
`

async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

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

function Dots({ length, shake, total = 4 }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        marginTop: 32,
        animation: shake ? 'pinShake 0.4s ease' : 'none',
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={styles.dot(i < length)} />
      ))}
    </div>
  )
}

// ===== SCREEN: ENTER PIN =====
function EnterPinScreen({ onSuccess, onForgot, pinHash }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const MAX_ATTEMPTS = 3

  const handleDigit = useCallback(async (d) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')

    if (next.length === 4) {
      const h = await hashPin(next)
      if (h === pinHash) {
        setTimeout(() => onSuccess(), 200)
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setShake(true)
        if (newAttempts >= MAX_ATTEMPTS) {
          setError('\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u043f\u043e\u043f\u044b\u0442\u043e\u043a')
          setTimeout(() => {
            setShake(false)
            onForgot()
          }, 800)
        } else {
          setError('\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 PIN (' + (MAX_ATTEMPTS - newAttempts) + ' \u043e\u0441\u0442.')
          setTimeout(() => {
            setShake(false)
            setPin('')
          }, 500)
        }
      }
    }
  }, [pin, pinHash, attempts, onSuccess, onForgot])

  const handleBack = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
    setError('')
  }, [])

  return (
    <div style={styles.inner}>
      <style>{shakeKeyframes}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udd12'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 PIN-\u043a\u043e\u0434'}
        </h2>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, margin: '8px 0 0' }}>{error}</p>
        )}

        <Dots length={pin.length} shake={shake} />
        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <button
          onClick={onForgot}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: 13,
            cursor: 'pointer',
            marginTop: 32,
            padding: 8,
          }}
        >
          {'\u0417\u0430\u0431\u044b\u043b PIN?'}
        </button>
      </div>
    </div>
  )
}

// ===== SCREEN: SMS VERIFY (6 digits) =====
function SmsVerifyScreen({ phone, onBack, onVerified }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [sendingOtp, setSendingOtp] = useState(false)
  const otpSent = useRef(false)

  const sendOtp = useCallback(async () => {
    if (cooldown > 0 || sendingOtp) return
    setSendingOtp(true)
    setErrorMsg('')
    const { error: otpErr } = await supabase.auth.signInWithOtp({ phone })
    setSendingOtp(false)
    if (otpErr) {
      setErrorMsg(otpErr.message)
      return
    }
    setCooldown(60)
  }, [phone, cooldown, sendingOtp])

  useEffect(() => {
    if (!otpSent.current) {
      otpSent.current = true
      sendOtp()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleDigit = useCallback((d) => {
    if (code.length >= 6) return
    const next = code + d
    setCode(next)
    setError(false)
    setErrorMsg('')
  }, [code])

  const handleBack = useCallback(() => {
    setCode((prev) => prev.slice(0, -1))
  }, [])

  const handleConfirm = async () => {
    if (code.length !== 6 || loading) return
    setLoading(true)
    setError(false)
    setErrorMsg('')
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    })
    setLoading(false)
    if (verifyError) {
      setError(true)
      setErrorMsg(verifyError.message)
      setCode('')
    } else {
      onVerified()
    }
  }

  const maskedPhone = phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4)

  return (
    <div style={styles.inner}>
      <style>{shakeKeyframes}</style>
      <button style={styles.backBtn} onClick={onBack}>
        {'\u2190 \u041d\u0430\u0437\u0430\u0434'}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udcf1'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {'\u0421\u0431\u0440\u043e\u0441 PIN-\u043a\u043e\u0434\u0430'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0, textAlign: 'center' }}>
          {'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438\u0437 SMS'}
        </p>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {maskedPhone}
        </p>

        {errorMsg && (
          <p style={{ color: '#ef4444', fontSize: 14, margin: '12px 0 0' }}>{errorMsg}</p>
        )}

        <Dots length={code.length} shake={error} total={6} />
        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <button
          style={{ ...(code.length === 6 && !loading ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
          disabled={code.length < 6 || loading}
          onClick={handleConfirm}
        >
          {loading ? '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430...' : '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c'}
        </button>

        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 20 }}>
          {cooldown > 0 ? (
            <span>{'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u0447\u0435\u0440\u0435\u0437 ' + cooldown + ' \u0441\u0435\u043a'}</span>
          ) : (
            <span
              style={{ cursor: 'pointer' }}
              onClick={sendOtp}
            >
              {sendingOtp ? '\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...' : (
                <>{'\u041d\u0435 \u043f\u0440\u0438\u0448\u0451\u043b? '}<span style={{ color: '#f59e0b' }}>{'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430'}</span></>
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

// ===== SCREEN: CREATE NEW PIN (4 digits, enter twice) =====
function NewPinScreen({ userId, onComplete }) {
  const [pinStep, setPinStep] = useState(1)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const currentPin = pinStep === 1 ? pin1 : pin2
  const setCurrentPin = pinStep === 1 ? setPin1 : setPin2

  const handleDigit = useCallback(async (d) => {
    if (currentPin.length >= 4) return
    const next = currentPin + d
    setCurrentPin(next)
    setError('')

    if (next.length === 4) {
      if (pinStep === 1) {
        setTimeout(() => setPinStep(2), 300)
      } else {
        if (next === pin1) {
          setSaving(true)
          const h = await hashPin(next)
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({ pin_hash: h })
            .eq('id', userId)
          setSaving(false)
          if (updateErr) {
            setError(updateErr.message)
            setPin2('')
          } else {
            setTimeout(() => onComplete(), 200)
          }
        } else {
          setShake(true)
          setError('PIN \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442')
          setTimeout(() => {
            setShake(false)
            setPin2('')
          }, 500)
        }
      }
    }
  }, [currentPin, setCurrentPin, pinStep, pin1, userId, onComplete])

  const handleBack = useCallback(() => {
    setCurrentPin(currentPin.slice(0, -1))
    setError('')
  }, [currentPin, setCurrentPin])

  return (
    <div style={styles.inner}>
      <style>{shakeKeyframes}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48 }}>{'\ud83d\udd10'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
          {pinStep === 1 ? '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 PIN' : '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 PIN'}
        </h2>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, margin: '8px 0 0' }}>{error}</p>
        )}
        {saving && (
          <p style={{ color: '#64748b', fontSize: 14, margin: '8px 0 0' }}>{'\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...'}</p>
        )}

        <Dots length={currentPin.length} shake={shake} />
        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
          <div style={styles.stepDot(pinStep >= 1)} />
          <div style={styles.stepDot(pinStep >= 2)} />
        </div>
      </div>
    </div>
  )
}

// ===== MAIN PINLOCK COMPONENT =====
export default function PinLock({ userId, pinHash, phone, onUnlock }) {
  // 'enter' | 'sms' | 'newpin'
  const [screen, setScreen] = useState('enter')

  const handleForgot = () => {
    setScreen('sms')
  }

  const handleSmsVerified = () => {
    setScreen('newpin')
  }

  const handleNewPinComplete = () => {
    onUnlock()
  }

  if (screen === 'sms') {
    return (
      <div style={styles.container}>
        <SmsVerifyScreen
          phone={phone}
          onBack={() => setScreen('enter')}
          onVerified={handleSmsVerified}
        />
      </div>
    )
  }

  if (screen === 'newpin') {
    return (
      <div style={styles.container}>
        <NewPinScreen userId={userId} onComplete={handleNewPinComplete} />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <EnterPinScreen
        pinHash={pinHash}
        onSuccess={onUnlock}
        onForgot={handleForgot}
      />
    </div>
  )
}

export { hashPin }
