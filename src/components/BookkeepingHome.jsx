import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import IftaTab from './IftaTab'
import PerDiemTab from './PerDiemTab'
import DeadlinesTab from './DeadlinesTab'
import EstimatedTaxTab from './EstimatedTaxTab'
import TaxSummaryTab from './TaxSummaryTab'
import DepreciationTab from './DepreciationTab'
import MileageLogTab from './MileageLogTab'
import DeductionChecklistTab from './DeductionChecklistTab'

export default function BookkeepingHome({ userId, role, userVehicles, profile, onBack }) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [activeSection, setActiveSection] = useState(null)

  const isOwnerOrCompany = role === 'owner_operator' || role === 'company'
  const isDriver1099 = role === 'driver' && profile?.employment_type === '1099'
  // Drivers only see Per Diem, Estimated Tax, and Deduction Checklist
  const showIfta = isOwnerOrCompany
  const showDeadlines = isOwnerOrCompany
  const showEstimatedTax = isOwnerOrCompany || role === 'driver'
  // Schedule C (Tax Summary) — owner_operator always, driver only if 1099. Hidden for company
  // (company files 1120/1120-S/1065, not Schedule C) and for W-2 drivers.
  const showTaxSummary = role === 'owner_operator' || isDriver1099
  const showDepreciation = isOwnerOrCompany
  const showMileageLog = isOwnerOrCompany
  const showDeductionChecklist = role === 'driver'

  if (activeSection === 'ifta' || activeSection === 'perDiem' || activeSection === 'deadlines' || activeSection === 'estimatedTax' || activeSection === 'taxSummary' || activeSection === 'depreciation' || activeSection === 'mileageLog' || activeSection === 'deductionChecklist') {
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
        {activeSection === 'ifta' && showIfta && <IftaTab userId={userId} role={role} userVehicles={userVehicles} />}
        {activeSection === 'perDiem' && <PerDiemTab userId={userId} role={role} userVehicles={userVehicles} employmentType={profile?.employment_type} />}
        {activeSection === 'deadlines' && showDeadlines && <DeadlinesTab userId={userId} />}
        {activeSection === 'estimatedTax' && showEstimatedTax && <EstimatedTaxTab userId={userId} role={role} userVehicles={userVehicles} employmentType={profile?.employment_type} />}
        {activeSection === 'taxSummary' && showTaxSummary && <TaxSummaryTab userId={userId} role={role} userVehicles={userVehicles} employmentType={profile?.employment_type} />}
        {activeSection === 'depreciation' && showDepreciation && <DepreciationTab userId={userId} role={role} userVehicles={userVehicles} employmentType={profile?.employment_type} />}
        {activeSection === 'mileageLog' && showMileageLog && <MileageLogTab userId={userId} />}
        {activeSection === 'deductionChecklist' && showDeductionChecklist && <DeductionChecklistTab />}
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
    ...(showIfta ? [{
      key: 'ifta',
      icon: '\u26FD',
      title: t('bookkeeping.iftaCard'),
      desc: t('bookkeeping.iftaDescription'),
    }] : []),
    {
      key: 'perDiem',
      icon: '\uD83D\uDCC5',
      title: t('bookkeeping.perDiemCard'),
      desc: t('bookkeeping.perDiemDescription'),
    },
    ...(showDeadlines ? [{
      key: 'deadlines',
      icon: '\uD83D\uDCC5',
      title: t('bookkeeping.deadlinesCard'),
      desc: t('bookkeeping.deadlinesDescription'),
    }] : []),
    ...(showEstimatedTax ? [{
      key: 'estimatedTax',
      icon: '\uD83D\uDCB0',
      title: t('bookkeeping.estimatedTaxCard'),
      desc: t('bookkeeping.estimatedTaxDescription'),
    }] : []),
    ...(showTaxSummary ? [{
      key: 'taxSummary',
      icon: '\uD83D\uDCCA',
      title: t('bookkeeping.taxSummaryCard'),
      desc: t('bookkeeping.taxSummaryDescription'),
    }] : []),
    ...(showDepreciation ? [{
      key: 'depreciation',
      icon: '\uD83D\uDE9B',
      title: t('bookkeeping.depreciationCard'),
      desc: t('bookkeeping.depreciationDescription'),
    }] : []),
    ...(showMileageLog ? [{
      key: 'mileageLog',
      icon: '\uD83D\uDCCB',
      title: t('bookkeeping.mileageLogCard'),
      desc: t('bookkeeping.mileageLogDescription'),
    }] : []),
    ...(showDeductionChecklist ? [{
      key: 'deductionChecklist',
      icon: '\u2705',
      title: t('bookkeeping.deductionChecklistCard'),
      desc: t('bookkeeping.deductionChecklistDescription'),
    }] : []),
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
