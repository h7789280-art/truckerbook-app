import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

export default function Paywall({ userId }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
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
    alert(t('paywall.paymentSoon'))
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
        {t('paywall.trialEnded')}
      </h1>
      <p style={{
        fontSize: 15,
        color: theme.dim,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 1.5,
      }}>
        {t('paywall.dataSaved')}
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
            {t('paywall.trialStats')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {stats.fuel > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{stats.fuel}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{t('paywall.fuelEntries')}</div>
              </div>
            )}
            {stats.trips > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{stats.trips}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{t('paywall.tripsCount')}</div>
              </div>
            )}
            {stats.byt > 0 && (
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{stats.byt}</div>
                <div style={{ fontSize: 12, color: theme.dim }}>{t('paywall.expensesCount')}</div>
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
        {t('paywall.monthlyBtn')}
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
        {t('paywall.yearlyBtn')}
      </button>

      <p style={{
        fontSize: 13,
        color: theme.dim,
        textAlign: 'center',
      }}>
        {t('paywall.questions')}
      </p>
    </div>
  )
}
