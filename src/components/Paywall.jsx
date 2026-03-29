import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'

export default function Paywall({ userId }) {
  const { theme } = useTheme()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!userId) return
    async function loadStats() {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [fuelRes, tripsRes, bytRes] = await Promise.all([
        supabase.from('fuel_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
        supabase.from('trips').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
        supabase.from('byt_expenses').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
      ])
      setStats({
        fuel: fuelRes.count || 0,
        trips: tripsRes.count || 0,
        byt: bytRes.count || 0,
      })
    }
    loadStats()
  }, [userId])

  const handlePayment = () => {
    alert('\u041e\u043f\u043b\u0430\u0442\u0430 \u0431\u0443\u0434\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430 \u0432 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043c\u044f')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.bg,
      color: theme.text,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <div style={{ fontSize: 72, marginBottom: 24 }}>{'\ud83d\ude9b'}</div>
      <h1 style={{
        fontSize: 24,
        fontWeight: 700,
        textAlign: 'center',
        marginBottom: 12,
      }}>
        {'\u041f\u0440\u043e\u0431\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434 \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u043b\u0441\u044f'}
      </h1>
      <p style={{
        fontSize: 15,
        color: theme.dim,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 1.5,
      }}>
        {'\u0412\u0430\u0448\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b \u0438 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b'}
      </p>

      {stats && (stats.fuel > 0 || stats.trips > 0 || stats.byt > 0) && (
        <div style={{
          background: theme.card,
          border: '1px solid ' + theme.border,
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          width: '100%',
          maxWidth: 320,
        }}>
          <p style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 10,
            textAlign: 'center',
          }}>
            {'\u0417\u0430 7 \u0434\u043d\u0435\u0439 \u0432\u044b \u0437\u0430\u043f\u0438\u0441\u0430\u043b\u0438:'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {stats.fuel > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{stats.fuel}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{'\u0437\u0430\u043f\u0440\u0430\u0432\u043e\u043a'}</div>
              </div>
            )}
            {stats.trips > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{stats.trips}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{'\u0440\u0435\u0439\u0441\u043e\u0432'}</div>
              </div>
            )}
            {stats.byt > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{stats.byt}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{'\u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432'}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handlePayment}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 17,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        {'\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0437\u0430 249 \u20bd/\u043c\u0435\u0441'}
      </button>

      <button
        onClick={handlePayment}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '14px 24px',
          background: 'transparent',
          color: '#f59e0b',
          border: '2px solid #f59e0b',
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: 32,
        }}
      >
        {'\u0413\u043e\u0434\u043e\u0432\u043e\u0439 \u043f\u043b\u0430\u043d \u2014 1\u00a0990 \u20bd (\u0441\u043a\u0438\u0434\u043a\u0430 33%)'}
      </button>

      <p style={{
        fontSize: 13,
        color: theme.dim,
        textAlign: 'center',
      }}>
        {'\u0415\u0441\u0442\u044c \u0432\u043e\u043f\u0440\u043e\u0441\u044b? \u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043d\u0430\u043c'}
      </p>
    </div>
  )
}
