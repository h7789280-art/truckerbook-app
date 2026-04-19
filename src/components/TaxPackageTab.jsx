// Year-end Tax Package — one-click ZIP with everything a CPA needs.
import { useState, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import {
  generateTaxPackage,
  downloadTaxPackage,
  TAX_PACKAGE_MAX_BYTES,
} from '../utils/taxPackageGenerator'

const ALL_SECTION_KEYS = [
  'scheduleC',
  'mileageLog',
  'perDiem',
  'amortization',
  'personalExpenses',
  'fuelVehicleExpenses',
  'iftaQuarterly',
  'serviceRecords',
  'bolRegistry',
  'receipts',
]

const STEP_ORDER = [
  'load',
  'scheduleC',
  'mileageLog',
  'perDiem',
  'amortization',
  'personalExpenses',
  'fuelVehicleExpenses',
  'iftaQuarterly',
  'serviceRecords',
  'bolRegistry',
  'receipts',
  'readme',
]

function buildYearOptions() {
  const cur = new Date().getFullYear()
  return [cur, cur - 1, cur - 2]
}

export default function TaxPackageTab({ userId, role, profile }) {
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [year, setYear] = useState(new Date().getFullYear())
  const [sections, setSections] = useState(() => {
    const obj = {}
    for (const k of ALL_SECTION_KEYS) obj[k] = true
    obj.quarterlyEstimated = false
    return obj
  })
  const [cpaName, setCpaName] = useState('')
  const [cpaEmail, setCpaEmail] = useState('')
  const [clientName, setClientName] = useState(profile?.full_name || profile?.name || '')
  const [einSsnLast4, setEinSsnLast4] = useState('')

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({}) // { step: 'done' | 'in_progress' }
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const yearOptions = useMemo(() => buildYearOptions(), [])

  const toggle = (key) => setSections(s => ({ ...s, [key]: !s[key] }))

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setError(null)
    setResult(null)
    setProgress({})

    try {
      const pkg = await generateTaxPackage({
        supabase,
        userId,
        role,
        taxYear: year,
        profile,
        options: sections,
        recipient: {
          cpaName: cpaName.trim() || null,
          cpaEmail: cpaEmail.trim() || null,
          clientName: clientName.trim() || null,
          einSsnLast4: einSsnLast4.trim() || null,
        },
        onProgress: ({ step, status }) => {
          setProgress(prev => ({ ...prev, [step]: status }))
        },
      })
      setResult(pkg)
    } catch (err) {
      console.error('[taxPackage] generation failed', err)
      setError(err?.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!result) return
    await downloadTaxPackage(result.blob, result.fileName)
  }

  const handleEmail = () => {
    if (!result) return
    const subject = encodeURIComponent('Tax Package ' + year + ' \u2014 ' + (clientName || 'Client'))
    const body = encodeURIComponent(
      'Hi' + (cpaName ? ' ' + cpaName : '') + ',\n\n' +
      'Attached is my TruckerBook year-end tax package for ' + year + '.\n' +
      'Filename: ' + result.fileName + '\n\n' +
      'Please let me know if you need anything else.\n\n' +
      'Thanks.'
    )
    const to = encodeURIComponent(cpaEmail)
    window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body
  }

  const card = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const selectStyle = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '14px',
    fontWeight: 600,
  }

  const inputStyle = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.bg,
    color: theme.text,
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  }

  // Render a single progress row for the given step key
  const renderStep = (stepKey, label) => {
    const st = progress[stepKey]
    const icon = st === 'done' ? '\u2713' : st === 'in_progress' ? '\u25cb' : '\u00b7'
    const color = st === 'done' ? '#22c55e' : st === 'in_progress' ? '#f59e0b' : theme.dim
    return (
      <div key={stepKey} style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '6px 0', fontSize: '13px', color: st ? theme.text : theme.dim,
      }}>
        <span style={{ width: '16px', textAlign: 'center', color, fontWeight: 700 }}>{icon}</span>
        <span>{label}</span>
      </div>
    )
  }

  // Hide for wrong roles (defense-in-depth; BookkeepingHome also gates this)
  const visible =
    role === 'owner_operator' ||
    role === 'driver_1099' ||
    (role === 'driver' && profile?.employment_type === '1099')
  if (!visible) {
    return (
      <div style={card}>
        <div style={{ color: theme.dim, fontSize: '13px' }}>
          {t('taxPackage.notAvailable')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={card}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '4px' }}>
          {'\uD83D\uDCE6 '}{t('taxPackage.title').replace('{year}', year)}
        </div>
        <div style={{ fontSize: '12px', color: theme.dim, lineHeight: 1.5 }}>
          {t('taxPackage.subtitle')}
        </div>
      </div>

      {/* Block 1 — What's in the package */}
      <div style={card}>
        <div style={{
          fontSize: '12px', fontWeight: 700, color: theme.dim,
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
        }}>
          {t('taxPackage.willInclude')}
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ['01', t('taxPackage.incScheduleC'), t('taxPackage.incScheduleCDesc')],
            ['02', t('taxPackage.incMileage'), t('taxPackage.incMileageDesc')],
            ['03', t('taxPackage.incPerDiem'), t('taxPackage.incPerDiemDesc')],
            ['04', t('taxPackage.incAmortization'), t('taxPackage.incAmortizationDesc')],
            ['05', t('taxPackage.incPersonal'), t('taxPackage.incPersonalDesc')],
            ['06', t('taxPackage.incFuelVehicle'), t('taxPackage.incFuelVehicleDesc')],
            ['07', t('taxPackage.incIfta'), t('taxPackage.incIftaDesc')],
            ['08', t('taxPackage.incService'), t('taxPackage.incServiceDesc')],
            ['09', t('taxPackage.incBol'), t('taxPackage.incBolDesc')],
            ['\uD83D\uDCC1', t('taxPackage.incReceipts'), t('taxPackage.incReceiptsDesc')],
            ['\uD83D\uDCC4', t('taxPackage.incReadme'), t('taxPackage.incReadmeDesc')],
          ].map(([num, title, desc]) => (
            <li key={num} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
              <span style={{
                minWidth: '30px', color: '#f59e0b', fontWeight: 700, fontFamily: 'monospace',
              }}>{num}</span>
              <span>
                <span style={{ color: theme.text, fontWeight: 600 }}>{title}</span>
                <span style={{ color: theme.dim, fontSize: '11px', marginLeft: '6px' }}>{'\u2014 ' + desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Block 2 — Export settings */}
      <div style={card}>
        <label style={{
          display: 'block', fontSize: '11px', fontWeight: 600, color: theme.dim,
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
        }}>
          {t('taxPackage.taxYear')}
        </label>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          disabled={generating}
          style={{ ...selectStyle, width: '100%' }}
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div style={{
          marginTop: '14px', fontSize: '11px', fontWeight: 600, color: theme.dim,
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {t('taxPackage.include')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          {[
            ['scheduleC', t('taxPackage.optScheduleC')],
            ['mileageLog', t('taxPackage.optMileage')],
            ['perDiem', t('taxPackage.optPerDiem')],
            ['amortization', t('taxPackage.optAmortization')],
            ['personalExpenses', t('taxPackage.optPersonal')],
            ['fuelVehicleExpenses', t('taxPackage.optFuelVehicle')],
            ['iftaQuarterly', t('taxPackage.optIfta')],
            ['serviceRecords', t('taxPackage.optService')],
            ['bolRegistry', t('taxPackage.optBol')],
            ['receipts', t('taxPackage.optReceipts')],
            ['quarterlyEstimated', t('taxPackage.optQuarterly')],
          ].map(([key, label]) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '6px 0', cursor: generating ? 'default' : 'pointer',
              fontSize: '13px', color: theme.text,
            }}>
              <input
                type="checkbox"
                checked={!!sections[key]}
                disabled={generating}
                onChange={() => toggle(key)}
                style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* CPA / client info */}
      <div style={card}>
        <div style={{
          fontSize: '11px', fontWeight: 600, color: theme.dim,
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
        }}>
          {t('taxPackage.recipient')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px', display: 'block' }}>
              {t('taxPackage.cpaName')}
            </label>
            <input
              type="text"
              value={cpaName}
              onChange={e => setCpaName(e.target.value)}
              disabled={generating}
              style={inputStyle}
              placeholder={t('taxPackage.cpaNamePlaceholder')}
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px', display: 'block' }}>
              {t('taxPackage.cpaEmail')}
            </label>
            <input
              type="email"
              value={cpaEmail}
              onChange={e => setCpaEmail(e.target.value)}
              disabled={generating}
              style={inputStyle}
              placeholder="cpa@example.com"
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px', display: 'block' }}>
              {t('taxPackage.clientName')}
            </label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              disabled={generating}
              style={inputStyle}
              placeholder={t('taxPackage.clientNamePlaceholder')}
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: theme.dim, marginBottom: '4px', display: 'block' }}>
              {t('taxPackage.ssnLast4')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={einSsnLast4}
              onChange={e => setEinSsnLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={generating}
              style={{ ...inputStyle, maxWidth: '120px' }}
              placeholder="1234"
            />
          </div>
        </div>

        <div style={{
          marginTop: '10px', fontSize: '11px', color: theme.dim,
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: '8px', padding: '8px 10px', lineHeight: 1.4,
        }}>
          {'\uD83D\uDD12 '}{t('taxPackage.privacyNote')}
        </div>
      </div>

      {/* Generate button */}
      {!result && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '16px', borderRadius: '12px', border: 'none',
            background: generating ? theme.border : 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: generating ? theme.dim : '#fff',
            fontSize: '15px', fontWeight: 700,
            cursor: generating ? 'default' : 'pointer',
          }}
        >
          {generating
            ? '\u23f3 ' + t('taxPackage.generating')
            : '\uD83D\uDCE6 ' + t('taxPackage.generateBtn')}
        </button>
      )}

      {/* Progress */}
      {generating && (
        <div style={card}>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: theme.dim,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
          }}>
            {t('taxPackage.progressTitle')}
          </div>
          {renderStep('load', t('taxPackage.stepLoad'))}
          {sections.scheduleC && renderStep('scheduleC', t('taxPackage.stepScheduleC'))}
          {sections.mileageLog && renderStep('mileageLog', t('taxPackage.stepMileage'))}
          {sections.perDiem && renderStep('perDiem', t('taxPackage.stepPerDiem'))}
          {sections.amortization && renderStep('amortization', t('taxPackage.stepAmortization'))}
          {sections.personalExpenses && renderStep('personalExpenses', t('taxPackage.stepPersonal'))}
          {sections.fuelVehicleExpenses && renderStep('fuelVehicleExpenses', t('taxPackage.stepFuelVehicle'))}
          {sections.iftaQuarterly && renderStep('iftaQuarterly', t('taxPackage.stepIfta'))}
          {sections.serviceRecords && renderStep('serviceRecords', t('taxPackage.stepService'))}
          {sections.bolRegistry && renderStep('bolRegistry', t('taxPackage.stepBol'))}
          {sections.receipts && renderStep('receipts', t('taxPackage.stepReceipts'))}
          {renderStep('readme', t('taxPackage.stepReadme'))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '12px', padding: '14px',
          color: '#ef4444', fontSize: '13px', lineHeight: 1.5,
        }}>
          {'\u2717 '}{error}
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          <div style={{
            ...card,
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}>
            <div style={{
              fontSize: '14px', fontWeight: 700, color: '#22c55e', marginBottom: '10px',
            }}>
              {'\u2705 '}{t('taxPackage.ready')}
            </div>
            <div style={{ fontSize: '13px', color: theme.text, fontFamily: 'monospace', lineHeight: 1.6 }}>
              {'\uD83D\uDCE6 ' + result.fileName}
            </div>
            <div style={{ fontSize: '12px', color: theme.dim, marginTop: '6px', lineHeight: 1.6 }}>
              {t('taxPackage.size')}: {result.sizeMB} MB<br />
              {t('taxPackage.docs')}: {result.docsCount}<br />
              {t('taxPackage.photos')}: {result.photosCount}
            </div>
            {result.exceedsSizeLimit && (
              <div style={{
                marginTop: '10px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '8px', padding: '8px 10px',
                color: '#f59e0b', fontSize: '11px', lineHeight: 1.4,
              }}>
                {'\u26a0 '}{t('taxPackage.sizeWarning').replace('{max}', String(Math.round(TAX_PACKAGE_MAX_BYTES / (1024 * 1024))))}
              </div>
            )}
          </div>

          <button
            onClick={handleDownload}
            style={{
              padding: '14px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {'\uD83D\uDCE5 '}{t('taxPackage.downloadBtn')}
          </button>
          {cpaEmail && (
            <button
              onClick={handleEmail}
              style={{
                padding: '14px', borderRadius: '10px',
                border: '1px solid ' + theme.border,
                background: theme.card, color: theme.text,
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {'\uD83D\uDCE7 '}{t('taxPackage.emailBtn')}
            </button>
          )}

          <button
            onClick={() => { setResult(null); setProgress({}) }}
            style={{
              padding: '12px', borderRadius: '10px',
              border: '1px solid ' + theme.border,
              background: 'none', color: theme.dim,
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('taxPackage.generateAgain')}
          </button>
        </>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: '6px', fontSize: '11px', color: theme.dim,
        lineHeight: 1.6, padding: '8px 4px',
      }}>
        {'\uD83D\uDCCC '}{t('taxPackage.disclaimer')}
      </div>
    </div>
  )
}
