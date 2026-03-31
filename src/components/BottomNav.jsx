import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'

export default function BottomNav({ activeTab, onTabChange, role }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const DRIVER_TABS = [
    { key: 'overview', label: t('tabs.overview').toUpperCase(), icon: '\ud83d\udcca' },
    { key: 'expenses', label: t('tabs.expenses').toUpperCase(), icon: '\ud83d\udcb5' },
    { key: 'trips', label: t('tabs.trips').toUpperCase(), icon: '\ud83d\ude9b' },
    { key: 'service', label: t('tabs.service').toUpperCase(), icon: '\ud83d\udd27' },
  ]

  const JOB_SEEKER_TABS = [
    { key: 'jobs', label: t('tabs.jobs').toUpperCase(), icon: '\ud83d\udcbc' },
    { key: 'news', label: t('tabs.news').toUpperCase(), icon: '\ud83d\udcf0' },
    { key: 'marketplace', label: t('tabs.marketplace').toUpperCase(), icon: '\ud83d\udce2' },
  ]

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        height: 72,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: theme.navBg,
        borderTop: '1px solid ' + theme.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
      }}
    >
      {(role === 'job_seeker' ? JOB_SEEKER_TABS : DRIVER_TABS).map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 0',
              color: isActive ? '#f59e0b' : theme.dim,
              fontSize: 12,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: isActive ? 700 : 500,
              transition: 'color 0.15s, transform 0.15s',
              transform: isActive ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            <span style={{ fontSize: 28 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
