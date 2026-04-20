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
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    if (Date.now() - parsed.timestamp < CACHE_TTL) return parsed
    return null
  } catch {
    return null
  }
}

function saveForecast(vehicleId, text, limitedMonths) {
  if (!text || !String(text).trim()) return
  try {
    localStorage.setItem(getCacheKey(vehicleId), JSON.stringify({
      text,
      timestamp: Date.now(),
      limitedMonths: limitedMonths || 0,
    }))
  } catch { /* ignore */ }
}

async function fetchExpenseData(userId, vehicleId) {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const sinceDate = threeMonthsAgo.toISOString().slice(0, 10)

  const applyVehicle = (q) => (vehicleId ? q.eq('vehicle_id', vehicleId) : q)

  const [fuelRes, bytRes, serviceRes] = await Promise.all([
    applyVehicle(supabase.from('fuel_entries').select('cost, date').eq('user_id', userId).gte('date', sinceDate)),
    supabase.from('byt_expenses').select('amount, category, date').eq('user_id', userId).gte('date', sinceDate),
    applyVehicle(supabase.from('service_records').select('cost, date').eq('user_id', userId).gte('date', sinceDate)),
  ])

  const months = {}

  const addToMonth = (dateStr, category, amount) => {
    if (!dateStr) return
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months[key]) months[key] = {}
    if (!months[key][category]) months[key][category] = 0
    months[key][category] += (Number(amount) || 0)
  }

  if (fuelRes.data) {
    fuelRes.data.forEach(r => addToMonth(r.date, 'fuel', r.cost))
  }
  if (bytRes.data) {
    bytRes.data.forEach(r => addToMonth(r.date, r.category || 'byt', r.amount))
  }
  if (serviceRes.data) {
    serviceRes.data.forEach(r => addToMonth(r.date, 'service', r.cost))
  }

  return months
}

async function requestGeminiForecast(data, lang, monthCount) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) {
    const e = new Error('Unauthorized')
    e.code = 'UNAUTHORIZED'
    throw e
  }

  const langMap = { ru: 'Russian', en: 'English', uk: 'Ukrainian', es: 'Spanish', de: 'German', fr: 'French', tr: 'Turkish', pl: 'Polish' }
  const language = langMap[lang] || 'English'

  const partialNote = monthCount < 3
    ? ` Based on ${monthCount} month(s) of data (partial history, may be less accurate).`
    : ''

  const prompt = `You are a financial analyst for a trucking business. Based on the expense data below, provide a brief forecast for next month. Include: 1) Expected total expenses 2) Which category will likely increase 3) One money-saving tip. Keep it under 100 words. Respond in ${language} language.${partialNote} Data: ${JSON.stringify(data)}`

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({
      action: 'generate',
      prompt,
      generationConfig: { temperature: 0.7 },
    }),
  })

  if (!res.ok) {
    const err = new Error(`Gemini proxy error ${res.status}`)
    if (res.status === 401) err.code = 'UNAUTHORIZED'
    else if (res.status === 429) err.code = 'RATE_LIMITED'
    else if (res.status === 503) err.code = 'UNAVAILABLE'
    else err.code = 'NETWORK'
    throw err
  }

  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    const e = new Error('Empty Gemini response')
    e.code = 'NETWORK'
    throw e
  }
  return text
}

export default function AIForecast({ userId, activeVehicleId }) {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()
  const [forecast, setForecast] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [limitedMonths, setLimitedMonths] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadForecast = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedForecast(activeVehicleId)
      if (cached) {
        setForecast(cached.text)
        setUpdatedAt(new Date(cached.timestamp))
        setLimitedMonths(cached.limitedMonths || 0)
        setError(null)
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const data = await fetchExpenseData(userId, activeVehicleId)
      const monthCount = Object.keys(data).length

      if (monthCount === 0) {
        setError('noData')
        setForecast(null)
        setLimitedMonths(0)
        setLoading(false)
        return
      }

      const text = await requestGeminiForecast(data, lang, monthCount)
      const effectiveLimited = monthCount < 3 ? monthCount : 0
      setForecast(text)
      setUpdatedAt(new Date())
      setLimitedMonths(effectiveLimited)
      saveForecast(activeVehicleId, text, effectiveLimited)
    } catch (e) {
      console.error('AI Forecast error:', e)
      if (e?.code === 'UNAUTHORIZED') setError('authRequired')
      else if (e?.code === 'RATE_LIMITED') setError('rateLimit')
      else if (e?.code === 'UNAVAILABLE') setError('aiUnavailable')
      else setError('error')
      setForecast(null)
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

  const errorMessage = (() => {
    if (error === 'noData') return t('forecast.noData')
    if (error === 'authRequired') return t('forecast.authRequired')
    if (error === 'rateLimit') return t('forecast.rateLimit')
    if (error === 'aiUnavailable') return t('forecast.aiUnavailable')
    if (error === 'error') return t('common.error')
    return null
  })()

  const errorColor = error === 'noData' ? theme.dim : '#ef4444'

  const disclaimer = limitedMonths > 0
    ? t('forecast.limitedDisclaimer').replace('{months}', String(limitedMonths))
    : null

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

      {!loading && errorMessage && (
        <div style={{ fontSize: '13px', color: errorColor, lineHeight: 1.5 }}>
          {errorMessage}
        </div>
      )}

      {!loading && !error && forecast && (
        <>
          {disclaimer && (
            <div style={{
              fontSize: '12px',
              color: '#f59e0b',
              lineHeight: 1.4,
              marginBottom: '10px',
              padding: '8px 10px',
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.25)',
            }}>
              {'\u26a0\ufe0f '}{disclaimer}
            </div>
          )}
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
