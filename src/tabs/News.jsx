import { useState, useEffect, useCallback } from 'react'
import { fetchNews } from '../lib/api'
import { useLanguage } from '../lib/i18n'
import { useTheme } from '../lib/theme'

const CATEGORIES = ['all', 'regulations', 'market', 'safety', 'technology', 'lifestyle']

const CATEGORY_COLORS = {
  regulations: '#ef4444',
  market: '#3b82f6',
  safety: '#f59e0b',
  technology: '#8b5cf6',
  lifestyle: '#22c55e',
}

function formatRelativeDate(dateStr, t) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return t('news.justNow')
  if (diffMin < 60) return t('news.minutesAgo').replace('{n}', diffMin)
  if (diffHours < 24) return t('news.hoursAgo').replace('{n}', diffHours)
  if (diffDays === 1) return t('news.yesterday')
  if (diffDays < 7) return t('news.daysAgo').replace('{n}', diffDays)
  if (diffDays < 30) return t('news.weeksAgo').replace('{n}', Math.floor(diffDays / 7))
  return date.toLocaleDateString()
}

export default function News() {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const country = localStorage.getItem('truckerbook_country') || 'RU'

  const loadNews = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchNews(country, filter === 'all' ? null : filter)
      setArticles(data)
    } catch (err) {
      console.error('Failed to load news:', err)
    } finally {
      setLoading(false)
    }
  }, [country, filter])

  useEffect(() => {
    loadNews()
  }, [loadNews])

  const openArticle = (url) => {
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      {/* Category filters */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        {CATEGORIES.map(cat => {
          const isActive = filter === cat
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: 20,
                border: isActive ? 'none' : '1px solid ' + theme.border,
                background: isActive ? '#f59e0b' : theme.card,
                color: isActive ? '#000' : theme.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('news.cat_' + cat)}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: theme.dim }}>
          <div style={{
            width: 32, height: 32, border: '3px solid ' + theme.border,
            borderTopColor: '#f59e0b', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          {t('news.loading')}
        </div>
      )}

      {/* Empty state */}
      {!loading && articles.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
        }}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCF0'}</span>
          <p style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>
            {t('news.noNews')}
          </p>
          <p style={{ fontSize: 14, color: theme.dim, marginTop: 8 }}>
            {t('news.noNewsSub')}
          </p>
        </div>
      )}

      {/* Articles list */}
      {!loading && articles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map(article => (
            <div
              key={article.id}
              onClick={() => openArticle(article.original_url)}
              style={{
                background: theme.card,
                borderRadius: 14,
                border: '1px solid ' + theme.border,
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                gap: 0,
              }}
            >
              {/* Image */}
              {article.image_url && (
                <div style={{
                  width: 110, minHeight: 110, flexShrink: 0,
                  backgroundImage: 'url(' + article.image_url + ')',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }} />
              )}

              {/* Content */}
              <div style={{ padding: '12px 14px', flex: 1, minWidth: 0 }}>
                {/* Category badge + date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {article.category && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: (CATEGORY_COLORS[article.category] || '#64748b') + '22',
                      color: CATEGORY_COLORS[article.category] || '#64748b',
                      whiteSpace: 'nowrap',
                    }}>
                      {t('news.cat_' + article.category)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: theme.dim }}>
                    {formatRelativeDate(article.published_at, t)}
                  </span>
                </div>

                {/* Title */}
                <p style={{
                  fontSize: 15, fontWeight: 700, color: theme.text,
                  margin: '0 0 4px', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {article.title}
                </p>

                {/* Summary */}
                {article.summary && (
                  <p style={{
                    fontSize: 13, color: theme.dim, margin: 0, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {article.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
