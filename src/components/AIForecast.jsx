import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function getCacheKey(vehicleId) {
  return `truckerbook_forecast_${vehicleId || 'default'}`
}

function getCachedForecast(vehicleId) {
  try {
    const raw = localStorage.getItem(getCacheKey(vehicleId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.timestamp < CACHE_TTL) return parsed
    return null
  } catch {
    return null
  }
}

function saveForecast(vehicleId, text) {
  try {
    localStorage.setItem(getCacheKey(vehicleId), JSON.stringify({
      text,
      timestamp: Date.now(),
    }))
  } catch { /* ignore */ }
}

async function fetchExpenseData(userId, vehicleId) {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const since = threeMonthsAgo.toISOString()

  const filters = (q) => {
    q = q.gte('created_at', since)
    if (vehicleId) q = q.eq('vehicle_id', vehicleId)
    return q
  }

  const [fuelRes, bytRes, serviceRes] = await Promise.all([
    filters(supabase.from('fuel_entries').select('amount, created_at').eq('user_id', userId)),
    supabase.from('byt_expenses').select('amount, category, created_at').eq('user_id', userId).gte('created_at', since),
    filters(supabase.from('service_records').select('cost, created_at').eq('user_id', userId)),
  ])

  const months = {}

  const addToMonth = (dateStr, category, amount) => {
    const d = new Date(dateStr)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months[key]) months[key] = {}
    if (!months[key][category]) months[key][category] = 0
    months[key][category] += (amount || 0)
  }

  if (fuelRes.data) {
    fuelRes.data.forEach(r => addToMonth(r.created_at, 'fuel', r.amount))
  }
  if (bytRes.data) {
    bytRes.data.forEach(r => addToMonth(r.created_at, r.category || 'byt', r.amount))
  }
  if (serviceRes.data) {
    serviceRes.data.forEach(r => addToMonth(r.created_at, 'service', r.cost))
  }

  return months
}

async function requestGeminiForecast(data, lang) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('No Gemini API key')

  const langMap = { ru: 'Russian', en: 'English', uk: 'Ukrainian', es: 'Spanish', de: 'German', fr: 'French', tr: 'Turkish', pl: 'Polish' }
  const language = langMap[lang] || 'English'

  const prompt = `You are a financial analyst for a trucking business. Based on the expense data below, provide a brief forecast for next month. Include: 1) Expected total expenses 2) Which category will likely increase 3) One money-saving tip. Keep it under 100 words. Respond in ${language} language. Data: ${JSON.stringify(data)}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty Gemini response')
  return text
}

export default function AIForecast({ userId, activeVehicleId }) {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()
  const [forecast, setForecast] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadForecast = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedForecast(activeVehicleId)
      if (cached) {
        setForecast(cached.text)
        setUpdatedAt(new Date(cached.timestamp))
        setError(null)
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const data = await fetchExpenseData(userId, activeVehicleId)
      if (Object.keys(data).length < 3) {
        setError('noData')
        setForecast(null)
        setLoading(false)
        return
      }

      const text = await requestGeminiForecast(data, lang)
      setForecast(text)
      setUpdatedAt(new Date())
      saveForecast(activeVehicleId, text)
    } catch (e) {
      console.error('AI Forecast error:', e)
      setError('error')
    } finally {
      setLoading(false)
    }
  }, [userId, activeVehicleId, lang])

  useEffect(() => {
    if (userId) loadForecast(false)
  }, [userId, activeVehicleId, loadForecast])

  const cardStyle = {
    background: theme.card,
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '12px',
    border: `1px solid ${theme.border}`,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{'\ud83e\udd16'}</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>
            {t('forecast.title')}
          </span>
        </div>
        <button
          onClick={() => loadForecast(true)}
          disabled={loading}
          style={{
            background: 'none',
            border: '1px solid ' + theme.border,
            borderRadius: '8px',
            padding: '4px 10px',
            color: '#f59e0b',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {t('forecast.update')}
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '3px solid ' + theme.border,
            borderTopColor: '#f59e0b',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ marginLeft: '10px', fontSize: '13px', color: theme.dim }}>
            {t('forecast.loading')}
          </span>
        </div>
      )}

      {!loading && error === 'noData' && (
        <div style={{ fontSize: '13px', color: theme.dim, lineHeight: 1.5 }}>
          {t('forecast.noData')}
        </div>
      )}

      {!loading && error === 'error' && (
        <div style={{ fontSize: '13px', color: '#ef4444', lineHeight: 1.5 }}>
          {t('common.error')}
        </div>
      )}

      {!loading && !error && forecast && (
        <>
          <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {forecast}
          </div>
          {updatedAt && (
            <div style={{ fontSize: '11px', color: theme.dim, marginTop: '10px' }}>
              {t('forecast.updatedAt')}: {updatedAt.toLocaleDateString()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
