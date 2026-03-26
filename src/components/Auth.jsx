import { useState } from 'react'

const BRANDS = {
  'Volvo': ['FH', 'FH16', 'FM', 'FMX', 'FE', 'FL'],
  'MAN': ['TGX', 'TGS', 'TGM', 'TGL'],
  'DAF': ['XF', 'XG', 'XG+', 'CF', 'LF'],
  'Scania': ['R', 'S', 'G', 'P', 'L'],
  'Mercedes-Benz': ['Actros', 'Arocs', 'Atego', 'Antos', 'Econic'],
  'Renault': ['T', 'T High', 'C', 'D', 'D Wide', 'K'],
  'Iveco': ['S-Way', 'X-Way', 'T-Way', 'Eurocargo', 'Daily'],
  '\u041a\u0430\u043c\u0410\u0417': ['5490', '54901', '65115', '6520', '43118'],
  '\u041c\u0410\u0417': ['5440', '6430', '6501', '5550'],
  '\u0413\u0410\u0417': ['3309', '3310', '33104', '33106'],
}

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

function PinDots({ length, shake }) {
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
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={styles.dot(i < length)} />
      ))}
    </div>
  )
}

// ===== SCREEN 1: PHONE =====
function PhoneScreen({ phone, setPhone, onNext }) {
  const valid = phone.replace(/\D/g, '').length >= 10
  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={styles.logo}>{'\u0422\u0411'}</div>
        <h1 style={styles.title}>TRUCKERBOOK</h1>
        <p style={styles.subtitle}>{'\u041f\u043e\u043b\u043d\u044b\u0439 \u0443\u0447\u0451\u0442 \u0434\u043b\u044f \u0434\u0430\u043b\u044c\u043d\u043e\u0431\u043e\u0439\u0449\u0438\u043a\u0430'}</p>

        <div style={{ marginTop: 40 }}>
          <label style={styles.label}>{'\u041d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              padding: '14px 12px',
              background: '#1a2235',
              border: '1px solid #1e2a3f',
              borderRadius: 12,
              color: '#64748b',
              fontSize: 16,
              fontWeight: 600,
              flexShrink: 0,
            }}>
              +7
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

        <button
          style={valid ? styles.btnPrimary : styles.btnDisabled}
          disabled={!valid}
          onClick={onNext}
        >
          {'\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043a\u043e\u0434'}
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
function SmsScreen({ phone, onBack, onNext }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const handleDigit = (d) => {
    if (code.length < 4) {
      setCode((prev) => prev + d)
      setError(false)
    }
  }
  const handleBack = () => setCode((prev) => prev.slice(0, -1))

  const handleConfirm = () => {
    if (code.length === 4) onNext()
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
          {'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u043d\u0430 +7 ' + phone}
        </p>

        <PinDots length={code.length} shake={error} />

        <NumPad onDigit={handleDigit} onBackspace={handleBack} />

        <button
          style={{ ...(code.length === 4 ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
          disabled={code.length < 4}
          onClick={handleConfirm}
        >
          {'\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c'}
        </button>

        <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 20, cursor: 'pointer' }}>
          {'\u041d\u0435 \u043f\u0440\u0438\u0448\u0451\u043b? '}
          <span style={{ color: '#f59e0b' }}>{'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430'}</span>
        </p>
      </div>
    </div>
  )
}

// ===== SCREEN 3: PROFILE =====
function ProfileScreen({ profile, setProfile, onNext }) {
  const brandList = Object.keys(BRANDS)
  const modelList = profile.brand ? BRANDS[profile.brand] || [] : []
  const valid = profile.name && profile.brand && profile.model && profile.mileage

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
          <select
            style={styles.select}
            value={profile.brand}
            onChange={(e) => setProfile({ ...profile, brand: e.target.value, model: '' })}
          >
            <option value="">{'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043c\u0430\u0440\u043a\u0443'}</option>
            {brandList.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>{'\u041c\u043e\u0434\u0435\u043b\u044c'}</label>
          <select
            style={styles.select}
            value={profile.model}
            onChange={(e) => setProfile({ ...profile, model: e.target.value })}
            disabled={!profile.brand}
          >
            <option value="">{'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043c\u043e\u0434\u0435\u043b\u044c'}</option>
            {modelList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
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

      <button
        style={{ ...(valid ? styles.btnPrimary : styles.btnDisabled), marginTop: 24 }}
        disabled={!valid}
        onClick={onNext}
      >
        {'\u0414\u0430\u043b\u0435\u0435 \u2192'}
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

  const currentPin = pinStep === 1 ? pin1 : pin2
  const setCurrentPin = pinStep === 1 ? setPin1 : setPin2

  const handleDigit = (d) => {
    if (currentPin.length >= 4) return
    const next = currentPin + d
    setCurrentPin(next)
    setError('')

    if (next.length === 4) {
      if (pinStep === 1) {
        setTimeout(() => setPinStep(2), 300)
      } else {
        if (next === pin1) {
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

// ===== SCREEN 6: WELCOME =====
function WelcomeScreen({ profile, biometricEnabled, onStart }) {
  const features = [
    { icon: '\u26fd', label: '\u0423\u0447\u0451\u0442 \u0442\u043e\u043f\u043b\u0438\u0432\u0430' },
    { icon: '\ud83d\udccd', label: '\u0420\u0435\u0439\u0441\u044b' },
    { icon: '\ud83d\udd27', label: '\u0421\u0435\u0440\u0432\u0438\u0441' },
    { icon: '\ud83c\udfe8', label: '\u0411\u044b\u0442' },
    { icon: '\u2705', label: '\u0427\u0435\u043a-\u043b\u0438\u0441\u0442' },
    { icon: '\ud83d\uddfa\ufe0f', label: '\u041a\u0430\u0440\u0442\u0430' },
  ]

  const formattedMileage = Number(profile.mileage || 0).toLocaleString('ru-RU')

  return (
    <div style={styles.inner}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48 }}>
        <div style={{ fontSize: 56 }}>{'\ud83c\udf89'}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0 4px', textAlign: 'center' }}>
          {'\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c, ' + profile.name + '!'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          {profile.brand + ' ' + profile.model + ' \u00b7 ' + formattedMileage + ' \u043a\u043c'}
        </p>

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
export default function Auth({ onComplete }) {
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [profile, setProfile] = useState({
    name: '',
    brand: '',
    model: '',
    mileage: '',
    plate: '',
    consumption: 34,
  })
  const [biometricEnabled, setBiometricEnabled] = useState(false)

  if (step === 1) {
    return (
      <div style={styles.container}>
        <PhoneScreen phone={phone} setPhone={setPhone} onNext={() => setStep(2)} />
      </div>
    )
  }

  if (step === 2) {
    return (
      <div style={styles.container}>
        <SmsScreen phone={phone} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      </div>
    )
  }

  if (step === 3) {
    return (
      <div style={styles.container}>
        <ProfileScreen profile={profile} setProfile={setProfile} onNext={() => setStep(4)} />
      </div>
    )
  }

  if (step === 4) {
    return (
      <div style={styles.container}>
        <PinScreen onNext={() => setStep(5)} />
      </div>
    )
  }

  if (step === 5) {
    return (
      <div style={styles.container}>
        <BiometricScreen
          onEnable={() => { setBiometricEnabled(true); setStep(6) }}
          onSkip={() => setStep(6)}
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
      />
    </div>
  )
}
