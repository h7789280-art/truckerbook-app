import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { fetchAchievementStats } from '../lib/api'

const ACHIEVEMENTS = [
  { key: 'firstTrip', icon: '\ud83d\ude80', target: 1, stat: 'tripCount' },
  { key: 'longHauler', icon: '\ud83d\udee3\ufe0f', target: 10, stat: 'tripCount' },
  { key: 'roadVeteran', icon: '\ud83c\udfc6', target: 50, stat: 'tripCount' },
  { key: 'economist', icon: '\u26fd', target: 20, stat: 'fuelCount' },
  { key: 'inspector', icon: '\ud83d\udcf8', target: 5, stat: 'dvirCount' },
  { key: 'flawless', icon: '\u2705', target: 10, stat: 'dvirPassStreak' },
  { key: 'analyst', icon: '\ud83d\udcca', target: 30, stat: 'consecutiveDays' },
  { key: 'mileageMillionaire', icon: '\ud83d\udcb0', target: 100000, stat: 'totalKm' },
  { key: 'globe', icon: '\ud83c\udf0d', target: 3, stat: 'uniqueCities' },
  { key: 'punctual', icon: '\u23f1\ufe0f', target: 20, stat: 'sessionCount' },
]

export default function Achievements({ userId, onClose }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    fetchAchievementStats(userId).then(data => {
      if (!cancelled) {
        setStats(data)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const getProgress = (a) => {
    if (!stats) return 0
    return stats[a.stat] || 0
  }

  const isUnlocked = (a) => getProgress(a) >= a.target

  const unlockedCount = ACHIEVEMENTS.filter(a => isUnlocked(a)).length

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '16px', paddingBottom: '80px' }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#f59e0b', fontSize: '15px',
            cursor: 'pointer', padding: '4px 0', marginBottom: '12px', fontWeight: 600,
          }}
        >{'\u2190'} {t('common.back')}</button>
      )}

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{t('achievements.title')}</div>
        <div style={{ color: theme.dim, fontSize: '14px', marginTop: '4px' }}>
          {unlockedCount}/{ACHIEVEMENTS.length} {t('achievements.earned')}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: theme.dim, padding: '40px 0' }}>{t('common.loading')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {ACHIEVEMENTS.map(a => {
            const progress = getProgress(a)
            const unlocked = progress >= a.target
            const pct = Math.min(progress / a.target, 1)
            return (
              <div key={a.key} style={{
                background: theme.card,
                border: unlocked ? '2px solid #f59e0b' : '1px solid ' + theme.border,
                borderRadius: '12px',
                padding: '14px 10px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '32px', filter: unlocked ? 'none' : 'grayscale(1)', opacity: unlocked ? 1 : 0.5 }}>
                  {a.icon}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '6px' }}>
                  {t(`achievements.${a.key}`)}
                </div>
                <div style={{ fontSize: '11px', color: theme.dim, marginTop: '2px' }}>
                  {t(`achievements.${a.key}Desc`)}
                </div>
                {unlocked ? (
                  <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px', fontWeight: 600 }}>
                    {t('achievements.unlocked')}
                  </div>
                ) : (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{
                      background: theme.border,
                      borderRadius: '4px',
                      height: '6px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        background: '#f59e0b',
                        height: '100%',
                        width: `${pct * 100}%`,
                        borderRadius: '4px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: theme.dim, marginTop: '3px', fontFamily: 'monospace' }}>
                      {a.stat === 'totalKm' ? `${Math.round(progress).toLocaleString()}/${a.target.toLocaleString()}` : `${progress}/${a.target}`}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { ACHIEVEMENTS }
