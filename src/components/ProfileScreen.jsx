import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'

export default function ProfileScreen({ userId, profile, onBack, onLogout }) {
  const { theme } = useTheme()
  const [vehicle, setVehicle] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          console.log('ProfileScreen: vehicle fetch error', error)
        }
        if (data && data.length > 0) setVehicle(data[0])
      })
  }, [userId])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('signOut error:', error)
        alert(error.message)
      } else {
        if (onLogout) onLogout()
      }
    } catch (err) {
      console.error('signOut exception:', err)
      alert(String(err))
    } finally {
      setLoggingOut(false)
    }
  }

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const Row = ({ label, value }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid ' + theme.border,
    }}>
      <span style={{ fontSize: '14px', color: theme.dim }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>
        {value || '\u2014'}
      </span>
    </div>
  )

  return (
    <div style={{
      padding: '16px',
      minHeight: '100vh',
      backgroundColor: theme.bg,
      paddingBottom: '80px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px',
            color: theme.text,
            padding: '4px',
          }}
        >{'\u2190'}</button>
        <div style={{ fontSize: '20px', fontWeight: 700, color: theme.text }}>
          {'\u041F\u0440\u043E\u0444\u0438\u043B\u044C'}
        </div>
      </div>

      {/* Avatar */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          margin: '0 auto 8px',
        }}>
          {'\uD83D\uDE9B'}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
          {profile?.name || '\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C'}
        </div>
        <div style={{ fontSize: '13px', color: theme.dim, marginTop: '4px' }}>
          {profile?.plan === 'trial' ? 'Trial' : profile?.plan === 'pro' ? 'Pro' : profile?.plan || ''}
        </div>
      </div>

      {/* Profile info */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: theme.dim,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          {'\u041B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435'}
        </div>
        <Row
          label={'\u0418\u043C\u044F'}
          value={profile?.name}
        />
        <Row
          label={'\u0422\u0435\u043B\u0435\u0444\u043E\u043D'}
          value={profile?.phone}
        />
      </div>

      {/* Vehicle info */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: theme.dim,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          {'\u041C\u0430\u0448\u0438\u043D\u0430'}
        </div>
        <Row
          label={'\u041C\u0430\u0440\u043A\u0430'}
          value={vehicle?.brand}
        />
        <Row
          label={'\u041C\u043E\u0434\u0435\u043B\u044C'}
          value={vehicle?.model}
        />
        <Row
          label={'\u041F\u0440\u043E\u0431\u0435\u0433'}
          value={vehicle?.odometer ? vehicle.odometer.toLocaleString('ru-RU') + ' \u043A\u043C' : null}
        />
        <Row
          label={'\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440'}
          value={vehicle?.plate_number}
        />
        <Row
          label={'\u0420\u0430\u0441\u0445\u043E\u0434'}
          value={vehicle?.fuel_consumption ? vehicle.fuel_consumption + ' \u043B/100\u043A\u043C' : null}
        />
      </div>

      {/* Logout button */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: '1px solid #ef4444',
          background: '#ef444415',
          color: '#ef4444',
          fontSize: '16px',
          fontWeight: 600,
          cursor: loggingOut ? 'not-allowed' : 'pointer',
          opacity: loggingOut ? 0.5 : 1,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {loggingOut
          ? '\u0412\u044B\u0445\u043E\u0434...'
          : '\u0412\u044B\u0439\u0442\u0438'}
      </button>
    </div>
  )
}
