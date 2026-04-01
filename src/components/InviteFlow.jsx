import { useState } from 'react'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { hashPin } from './PinLock'

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
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 320,
    padding: '14px 16px',
    background: '#111827',
    border: '1px solid #1e2a3f',
    borderRadius: 12,
    color: '#e2e8f0',
    fontSize: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: '8px',
  },
  button: {
    width: '100%',
    maxWidth: 320,
    padding: '14px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    marginTop: 8,
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
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
    height: 72,
    borderRadius: '50%',
    border: 'none',
    background: '#111827',
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

/**
 * InviteFlow — entry point for invited drivers.
 * Steps:
 *   1. Enter phone → OTP via Supabase Auth
 *   2. Enter SMS code → verify
 *   3. Create PIN (4 digits, confirm)
 *   4. Done → redirect to app
 */
export default function InviteFlow({ inviteCode, onComplete }) {
  const { t } = useLanguage()
  const [step, setStep] = useState(1) // 1=phone, 2=otp, 3=pin, 4=done
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Send OTP
  const handlePhoneSend = async () => {
    if (!phone || phone.length < 10) {
      setError(t('auth.phone'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({ phone })
      if (otpErr) throw otpErr
      setStep(2)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP
  const handleOtpVerify = async () => {
    if (otp.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      })
      if (verifyErr) throw verifyErr

      // Link this auth user to the invited profile
      const userId = data?.user?.id
      if (userId) {
        // Update the invited profile: set id to match auth user, clear invited flag
        await supabase
          .from('profiles')
          .update({ id: userId, invited: false })
          .eq('invite_code', inviteCode)
          .eq('invited', true)
      }

      setStep(3)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 3: PIN entry
  const handlePinKey = async (digit) => {
    if (pin1.length < 4) {
      const next = pin1 + digit
      setPin1(next)
      setError('')
    } else if (pin2.length < 4) {
      const next = pin2 + digit
      setPin2(next)
      setError('')
      if (next.length === 4) {
        if (next !== pin1) {
          setError(t('auth.pinMismatch'))
          setTimeout(() => { setPin2(''); setError('') }, 1000)
          return
        }
        // Save PIN
        setLoading(true)
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('No user')
          const h = await hashPin(next)
          const { error: upErr } = await supabase
            .from('profiles')
            .update({ pin_hash: h })
            .eq('id', user.id)
          if (upErr) throw upErr
          setStep(4)
          setTimeout(() => {
            if (onComplete) onComplete()
          }, 1500)
        } catch (err) {
          setError(err.message || String(err))
        } finally {
          setLoading(false)
        }
      }
    }
  }

  const handlePinBackspace = () => {
    if (pin2.length > 0) {
      setPin2(pin2.slice(0, -1))
    } else if (pin1.length > 0 && pin2.length === 0 && pin1.length === 4) {
      // Reset to re-enter
      setPin1('')
    } else {
      setPin1(pin1.slice(0, -1))
    }
    setError('')
  }

  // Step 1: Phone
  if (step === 1) {
    return (
      <div style={styles.container}>
        <div style={styles.inner}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDE9B'}</div>
          <div style={styles.title}>{t('invite.inviteTitle')}</div>
          <div style={styles.subtitle}>{t('invite.inviteSubtitle')}</div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('invite.phonePlaceholder')}
            style={styles.input}
          />
          <button
            onClick={handlePhoneSend}
            disabled={loading}
            style={{ ...styles.button, opacity: loading ? 0.5 : 1 }}
          >
            {loading ? t('auth.sending') : t('auth.getCode')}
          </button>
          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  // Step 2: OTP code
  if (step === 2) {
    return (
      <div style={styles.container}>
        <div style={styles.inner}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD10'}</div>
          <div style={styles.title}>{t('invite.enterCode')}</div>
          <div style={styles.subtitle}>{t('auth.sentTo') + phone}</div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            style={styles.input}
          />
          <button
            onClick={handleOtpVerify}
            disabled={loading || otp.length !== 6}
            style={{ ...styles.button, opacity: (loading || otp.length !== 6) ? 0.5 : 1 }}
          >
            {loading ? t('auth.checking') : t('auth.confirm')}
          </button>
          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  // Step 3: Create PIN
  if (step === 3) {
    const currentPin = pin1.length < 4 ? pin1 : pin2
    const isConfirm = pin1.length === 4
    return (
      <div style={styles.container}>
        <div style={styles.inner}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD12'}</div>
          <div style={styles.title}>
            {isConfirm ? t('auth.repeatPinTitle') : t('auth.createPinTitle')}
          </div>
          <div style={styles.subtitle}>{t('invite.setupPin')}</div>
          {/* PIN dots */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={styles.dot(i < currentPin.length)} />
            ))}
          </div>
          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((k, i) => {
              if (k === null) return <div key={i} />
              if (k === 'del') {
                return (
                  <button key={i} onClick={handlePinBackspace} style={{ ...styles.numKey, background: 'transparent', fontSize: 20 }}>
                    {'\u232B'}
                  </button>
                )
              }
              return (
                <button key={i} onClick={() => handlePinKey(String(k))} disabled={loading} style={styles.numKey}>
                  {k}
                </button>
              )
            })}
          </div>
          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  // Step 4: Welcome
  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{'\u2705'}</div>
        <div style={styles.title}>{t('invite.welcome')}</div>
      </div>
    </div>
  )
}
