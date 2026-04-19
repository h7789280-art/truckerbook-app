import { useState, useEffect } from 'react'
import { useLanguage } from '../lib/i18n'
import { fetchVehicles } from '../lib/api'
import Fuel from './Fuel'
import Byt from './Byt'

export default function Expenses({ userId, fuelRefreshKey, bytRefreshKey, activeVehicleId, userRole, onSubTabChange, profile, initialSubTab, initialCategory, onBack }) {
  const { t } = useLanguage()
  const [subTab, setSubTab] = useState(initialSubTab || 'vehicle')
  const [vehicles, setVehicles] = useState([])
  const [filterVehicleId, setFilterVehicleId] = useState('all')

  const isCompany = userRole === 'company'

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab)
  }, [initialSubTab])

  useEffect(() => {
    if (onSubTabChange) onSubTabChange(subTab)
  }, [subTab])

  useEffect(() => {
    if (!isCompany || !userId) return
    fetchVehicles(userId).then(v => setVehicles(v || [])).catch(() => {})
  }, [userId, isCompany])

  const tabs = isCompany
    ? [{ key: 'vehicle', label: t('expenses.vehicle') }]
    : [
        { key: 'vehicle', label: t('expenses.vehicle') },
        { key: 'personal', label: t('expenses.personal') },
      ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {onBack && (
        <div style={{ padding: '12px 16px 0' }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text, #e2e8f0)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {'\u2190'}
          </button>
        </div>
      )}
      {/* Switcher — hidden for company (only vehicle expenses, no personal tab) */}
      {!isCompany && (
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
      )}

      {/* Vehicle filter for company role */}
      {isCompany && subTab === 'vehicle' && vehicles.length > 0 && (
        <div style={{ margin: '12px 16px 0' }}>
          <select
            value={filterVehicleId}
            onChange={e => setFilterVehicleId(e.target.value)}
            style={{
              width: '100%',
              minHeight: '52px',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid var(--border, #1e2a3f)',
              background: 'var(--card, #111827)',
              color: 'var(--text, #e2e8f0)',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              appearance: 'auto',
            }}
          >
            <option value="all">{'\uD83D\uDE9B'} {t('expenses.allVehicles')}</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {'\uD83D\uDE9B'} {`${v.brand || ''} ${v.model || ''} ${v.plate_number || ''}`.trim() || v.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      {subTab === 'vehicle' ? (
        <Fuel
          userId={userId}
          refreshKey={fuelRefreshKey}
          activeVehicleId={activeVehicleId}
          profile={profile}
          filterVehicleId={isCompany && filterVehicleId !== 'all' ? filterVehicleId : null}
          userRole={userRole}
          vehicles={vehicles}
          isAllVehicles={isCompany && filterVehicleId === 'all'}
          initialCategory={initialCategory}
        />
      ) : (
        <Byt userId={userId} refreshKey={bytRefreshKey} activeVehicleId={activeVehicleId} userRole={userRole} />
      )}
    </div>
  )
}
