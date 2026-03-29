import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchJobs } from '../lib/api'
import { useLanguage, getCurrencySymbol } from '../lib/i18n'
import { useTheme } from '../lib/theme'

const COUNTRY_FLAGS = {
  RU: '\uD83C\uDDF7\uD83C\uDDFA',
  US: '\uD83C\uDDFA\uD83C\uDDF8',
  UA: '\uD83C\uDDFA\uD83C\uDDE6',
  BY: '\uD83C\uDDE7\uD83C\uDDFE',
  KZ: '\uD83C\uDDF0\uD83C\uDDFF',
  UZ: '\uD83C\uDDFA\uD83C\uDDFF',
  DE: '\uD83C\uDDE9\uD83C\uDDEA',
  FR: '\uD83C\uDDEB\uD83C\uDDF7',
  ES: '\uD83C\uDDEA\uD83C\uDDF8',
  TR: '\uD83C\uDDF9\uD83C\uDDF7',
  PL: '\uD83C\uDDF5\uD83C\uDDF1',
}

const SALARY_PERIOD_KEYS = {
  month: 'perMonth',
  week: 'perWeek',
  mile: 'perMile',
  trip: 'perTrip',
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export default function Jobs({ refreshKey }) {
  const { t } = useLanguage()
  const { theme } = useTheme()
  const cs = getCurrencySymbol()

  const JOB_TYPES = useMemo(() => [
    { key: 'all', label: t('jobs.all') },
    { key: 'otr', label: t('jobs.otr') },
    { key: 'regional', label: t('jobs.regional') },
    { key: 'local', label: t('jobs.local') },
    { key: 'dedicated', label: t('jobs.dedicated') },
  ], [t])

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const country = useMemo(() => {
    try { return localStorage.getItem('truckerbook_country') || null } catch { return null }
  }, [])

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchJobs(country, filter)
      setJobs(data)
    } catch (err) {
      console.error('Failed to load jobs:', err)
    } finally {
      setLoading(false)
    }
  }, [country, filter])

  useEffect(() => {
    loadJobs()
  }, [loadJobs, refreshKey])

  const salaryText = (job) => {
    const periodKey = SALARY_PERIOD_KEYS[job.salary_period] || 'perMonth'
    const period = t('jobs.' + periodKey)
    if (job.salary_min && job.salary_max) {
      return t('jobs.salaryFrom') + ' ' + formatNumber(job.salary_min) + ' ' + t('jobs.salaryTo') + ' ' + formatNumber(job.salary_max) + ' ' + cs + period
    }
    if (job.salary_min) {
      return t('jobs.salaryFrom') + ' ' + formatNumber(job.salary_min) + ' ' + cs + period
    }
    if (job.salary_max) {
      return t('jobs.salaryTo') + ' ' + formatNumber(job.salary_max) + ' ' + cs + period
    }
    return null
  }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700, margin: '0 0 16px',
        color: theme.text,
      }}>
        {t('jobs.title')}
      </h2>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8,
        marginBottom: 16, WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {JOB_TYPES.map((jt) => (
          <button
            key={jt.key}
            onClick={() => setFilter(jt.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: filter === jt.key ? '#f59e0b' : theme.card2,
              color: filter === jt.key ? '#fff' : theme.dim,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {jt.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: theme.dim, fontSize: 15,
        }}>
          {t('jobs.loading')}
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
        }}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCBC'}</span>
          <p style={{ fontSize: 16, color: theme.dim, margin: 0, lineHeight: 1.5 }}>
            {t('jobs.noJobs')}
          </p>
        </div>
      )}

      {/* Job cards */}
      {!loading && jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map((job) => {
            const isPremium = job.is_premium
            const salary = salaryText(job)
            const flag = COUNTRY_FLAGS[job.country] || ''

            return (
              <div
                key={job.id}
                style={{
                  background: theme.card,
                  borderRadius: 14,
                  padding: '16px',
                  border: isPremium
                    ? '2px solid #f59e0b'
                    : '1px solid ' + theme.border,
                }}
              >
                {/* Header: title + premium badge */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 8, marginBottom: 6,
                }}>
                  <h3 style={{
                    fontSize: 16, fontWeight: 700, margin: 0,
                    color: theme.text, lineHeight: 1.3, flex: 1,
                  }}>
                    {job.title}
                  </h3>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {job.truck_provided && (
                      <span title={t('jobs.truckProvided')} style={{ fontSize: 16 }}>{'\uD83D\uDE9B'}</span>
                    )}
                    {isPremium && (
                      <span title={t('jobs.premium')} style={{ fontSize: 16 }}>{'\u2B50'}</span>
                    )}
                  </div>
                </div>

                {/* Company */}
                {job.company_name && (
                  <p style={{
                    fontSize: 14, color: theme.dim, margin: '0 0 6px',
                    fontWeight: 500,
                  }}>
                    {job.company_name}
                  </p>
                )}

                {/* Location + flag */}
                {job.location && (
                  <p style={{
                    fontSize: 13, color: theme.dim, margin: '0 0 8px',
                  }}>
                    {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
                    {job.location}
                  </p>
                )}

                {/* Salary */}
                {salary && (
                  <p style={{
                    fontSize: 15, fontWeight: 700, margin: 0,
                    color: '#22c55e', fontFamily: 'monospace',
                  }}>
                    {salary}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
