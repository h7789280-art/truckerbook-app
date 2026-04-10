import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import IftaTab from './IftaTab'
import PerDiemTab from './PerDiemTab'

export default function BookkeepingHome({ userId, role, userVehicles, onBack }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [activeSection, setActiveSection] = useState(null)

  if (activeSection === 'ifta' || activeSection === 'perDiem') {
    return (
      <div>
        <button
          onClick={() => setActiveSection(null)}
          style={{
            background: 'none', border: 'none', color: theme.text,
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          {'\u2190 ' + t('bookkeeping.title')}
        </button>
        {activeSection === 'ifta' && <IftaTab userId={userId} role={role} userVehicles={userVehicles} />}
        {activeSection === 'perDiem' && <PerDiemTab userId={userId} role={role} userVehicles={userVehicles} />}
        <div style={{
          marginTop: '24px', padding: '12px', fontSize: '11px',
          color: theme.dim, lineHeight: '1.5', textAlign: 'center',
        }}>
          {t('legal.taxDisclaimer')}
        </div>
      </div>
    )
  }

  const cards = [
    {
      key: 'ifta',
      icon: '\u26FD',
      title: t('bookkeeping.iftaCard'),
      desc: t('bookkeeping.iftaDescription'),
    },
    {
      key: 'perDiem',
      icon: '\uD83D\uDCC5',
      title: t('bookkeeping.perDiemCard'),
      desc: t('bookkeeping.perDiemDescription'),
    },
  ]

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: theme.text,
          fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          padding: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {t('service.backToTiles')}
      </button>
      <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text, marginBottom: '16px' }}>
        {'\uD83D\uDCBC ' + t('bookkeeping.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cards.map(card => (
          <div
            key={card.key}
            onClick={() => setActiveSection(card.key)}
            style={{
              background: theme.card, border: '1px solid ' + theme.border,
              borderRadius: '14px', padding: '16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
          >
            <div style={{ fontSize: '28px' }}>{card.icon}</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{card.title}</div>
              <div style={{ fontSize: '12px', color: theme.dim, marginTop: '4px' }}>{card.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: '24px', padding: '12px', fontSize: '11px',
        color: theme.dim, lineHeight: '1.5', textAlign: 'center',
      }}>
        {t('legal.taxDisclaimer')}
      </div>
    </div>
  )
}
