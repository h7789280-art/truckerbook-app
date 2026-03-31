import { useState, useEffect } from 'react'
import { useLanguage } from '../lib/i18n'
import Fuel from './Fuel'
import Byt from './Byt'

export default function Expenses({ userId, fuelRefreshKey, bytRefreshKey, activeVehicleId, userRole, onSubTabChange, profile }) {
  const { t } = useLanguage()
  const [subTab, setSubTab] = useState('vehicle')

  const isCompany = userRole === 'company'

  useEffect(() => {
    if (onSubTabChange) onSubTabChange(subTab)
  }, [subTab])

  const tabs = isCompany
    ? [{ key: 'vehicle', label: t('expenses.vehicle') }]
    : [
        { key: 'vehicle', label: t('expenses.vehicle') },
        { key: 'personal', label: t('expenses.personal') },
      ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Switcher */}
      <div style={{
        display: 'flex',
        gap: '0',
        margin: '16px 16px 0',
        background: 'var(--card, #111827)',
        borderRadius: '12px',
        border: '1px solid var(--border, #1e2a3f)',
        padding: '4px',
      }}>
        {tabs.map(tab => {
          const active = subTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '10px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                background: active
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : 'transparent',
                color: active ? '#000' : 'var(--dim, #64748b)',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {subTab === 'vehicle' ? (
        <Fuel userId={userId} refreshKey={fuelRefreshKey} activeVehicleId={activeVehicleId} profile={profile} />
      ) : (
        <Byt userId={userId} refreshKey={bytRefreshKey} activeVehicleId={activeVehicleId} />
      )}
    </div>
  )
}
