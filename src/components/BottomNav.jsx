import { useTheme } from '../lib/theme'

const TABS = [
  { key: 'overview', label: '\u041e\u0411\u0417\u041e\u0420', icon: '\ud83d\udcca' },
  { key: 'fuel', label: '\u0422\u041e\u041f\u041b\u0418\u0412\u041e', icon: '\u26fd' },
  { key: 'byt', label: '\u0411\u042b\u0422', icon: '\ud83c\udfe8' },
  { key: 'trips', label: '\u0420\u0415\u0419\u0421\u042b', icon: '\ud83d\ude9b' },
  { key: 'service', label: '\u0421\u0415\u0420\u0412\u0418\u0421', icon: '\ud83d\udd27' },
]

export default function BottomNav({ activeTab, onTabChange }) {
  const { theme } = useTheme()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        height: 64,
        background: theme.navBg,
        borderTop: '1px solid ' + theme.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
      }}
    >
      {TABS.map((tab) => {
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
              gap: 2,
              padding: '6px 0',
              color: isActive ? '#f59e0b' : theme.dim,
              fontSize: 10,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: isActive ? 700 : 500,
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
