import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'

export default function DeductionChecklistTab() {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [checked, setChecked] = useState({})

  const items = [
    { key: 'phone', icon: '\uD83D\uDCF1', label: t('deductionChecklist.phone') },
    { key: 'clothing', icon: '\uD83D\uDC55', label: t('deductionChecklist.clothing') },
    { key: 'tools', icon: '\uD83D\uDD27', label: t('deductionChecklist.tools') },
    { key: 'training', icon: '\uD83C\uDF93', label: t('deductionChecklist.training') },
    { key: 'travel', icon: '\u2708\uFE0F', label: t('deductionChecklist.travel') },
    { key: 'subscriptions', icon: '\uD83D\uDCBB', label: t('deductionChecklist.subscriptions') },
    { key: 'parking', icon: '\uD83C\uDD7F\uFE0F', label: t('deductionChecklist.parking') },
    { key: 'scales', icon: '\u2696\uFE0F', label: t('deductionChecklist.scales') },
  ]

  const toggle = (key) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text, marginBottom: '4px' }}>
        {'\u2705 ' + t('deductionChecklist.title')}
      </div>
      <div style={{ fontSize: '13px', color: theme.dim, marginBottom: '16px' }}>
        {t('deductionChecklist.subtitle')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map(item => (
          <div
            key={item.key}
            onClick={() => toggle(item.key)}
            style={{
              background: theme.card,
              border: '1px solid ' + (checked[item.key] ? '#22c55e44' : theme.border),
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'border-color 0.15s, opacity 0.15s',
              opacity: checked[item.key] ? 0.7 : 1,
            }}
          >
            <div style={{
              width: '24px', height: '24px', borderRadius: '6px',
              border: checked[item.key] ? 'none' : '2px solid ' + theme.border,
              background: checked[item.key] ? '#22c55e' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}>
              {checked[item.key] && (
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{'\u2713'}</span>
              )}
            </div>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
            <span style={{
              fontSize: '14px', fontWeight: 500, color: theme.text,
              textDecoration: checked[item.key] ? 'line-through' : 'none',
            }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '20px', padding: '14px', fontSize: '11px',
        color: theme.dim, lineHeight: '1.6', textAlign: 'center',
        background: theme.card, borderRadius: '12px',
        border: '1px solid ' + theme.border,
      }}>
        {'\u26A0\uFE0F '}{t('deductionChecklist.disclaimer')}
      </div>
    </div>
  )
}
