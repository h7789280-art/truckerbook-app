// IRS Mileage Log — auto-fill from trips + manual entries, filter, export
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

const PURPOSES = [
  { key: 'Delivery', tKey: 'purposeDelivery' },
  { key: 'Pickup', tKey: 'purposePickup' },
  { key: 'Deadhead', tKey: 'purposeDeadhead' },
  { key: 'Maintenance', tKey: 'purposeMaintenance' },
  { key: 'Fuel Stop', tKey: 'purposeFuelStop' },
  { key: 'Personal', tKey: 'purposePersonal' },
  { key: 'Other', tKey: 'purposeOther' },
]

function toMiles(km) {
  return Math.round((km || 0) * 0.621371 * 10) / 10
}

function fmt1(n) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function buildMonthOptions() {
  const now = new Date()
  const months = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString('default', { month: 'short', year: 'numeric' })
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    months.push({ label, start, end: endStr })
  }
  return months
}

function buildQuarterOptions() {
  const now = new Date()
  const quarters = []
  let y = now.getFullYear()
  let q = Math.ceil((now.getMonth() + 1) / 3)
  for (let i = 0; i < 8; i++) {
    const startMonth = (q - 1) * 3 + 1
    const endMonth = q * 3
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`
    const endDate = new Date(y, endMonth, 0)
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    quarters.push({ label: `Q${q} ${y}`, start, end })
    q--
    if (q < 1) { q = 4; y-- }
  }
  return quarters
}

function buildYearOptions() {
  const cur = new Date().getFullYear()
  return [cur, cur - 1, cur - 2].map(y => ({
    label: String(y),
    start: `${y}-01-01`,
    end: `${y}-12-31`,
  }))
}

export default function MileageLogTab({ userId }) {
  const { theme } = useTheme()
  const { t, lang } = useLanguage()

  const [periodType, setPeriodType] = useState('month')
  const [periodIdx, setPeriodIdx] = useState(0)
  const [tripFilter, setTripFilter] = useState('all')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ date: '', origin: '', destination: '', miles: '', business_purpose: 'Delivery' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [exporting, setExporting] = useState(false)

  const periodOptions = useMemo(() => {
    if (periodType === 'month') return buildMonthOptions()
    if (periodType === 'quarter') return buildQuarterOptions()
    return buildYearOptions()
  }, [periodType])

  const currentPeriod = periodOptions[periodIdx] || periodOptions[0]

  // Fetch trips + manual mileage_log entries for the period
  useEffect(() => {
    if (!userId || !currentPeriod) return
    setLoading(true)

    const fetchData = async () => {
      // 1. Fetch trips in date range
      const { data: trips } = await supabase
        .from('trips')
        .select('id, origin, destination, distance_km, deadhead_km, created_at')
        .eq('user_id', userId)
        .gte('created_at', currentPeriod.start + 'T00:00:00')
        .lte('created_at', currentPeriod.end + 'T23:59:59')
        .order('created_at', { ascending: true })

      // 2. Fetch manual mileage_log entries
      const { data: manual } = await supabase
        .from('mileage_log')
        .select('*')
        .eq('user_id', userId)
        .gte('date', currentPeriod.start)
        .lte('date', currentPeriod.end)
        .order('date', { ascending: true })

      // Build unified list
      const tripEntries = (trips || []).map(tr => ({
        id: 'trip_' + tr.id,
        date: (tr.created_at || '').slice(0, 10),
        origin: tr.origin || '',
        destination: tr.destination || '',
        miles: toMiles(tr.distance_km),
        business_purpose: tr.deadhead_km > 0 ? 'Deadhead' : 'Delivery',
        source: 'trip',
        trip_id: tr.id,
      }))

      const manualEntries = (manual || []).map(m => ({
        id: 'manual_' + m.id,
        date: m.date || '',
        origin: m.origin || '',
        destination: m.destination || '',
        miles: m.miles || 0,
        business_purpose: m.business_purpose || 'Other',
        source: 'manual',
        db_id: m.id,
      }))

      const all = [...tripEntries, ...manualEntries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      setEntries(all)
      setLoading(false)
    }

    fetchData().catch(() => setLoading(false))
  }, [userId, currentPeriod])

  // Filter
  const filtered = useMemo(() => {
    if (tripFilter === 'all') return entries
    if (tripFilter === 'business') return entries.filter(e => e.business_purpose !== 'Personal')
    return entries.filter(e => e.business_purpose === 'Personal')
  }, [entries, tripFilter])

  // Summary
  const summary = useMemo(() => {
    const businessMiles = entries.filter(e => e.business_purpose !== 'Personal').reduce((s, e) => s + (e.miles || 0), 0)
    const personalMiles = entries.filter(e => e.business_purpose === 'Personal').reduce((s, e) => s + (e.miles || 0), 0)
    const total = businessMiles + personalMiles
    const businessPct = total > 0 ? (businessMiles / total) * 100 : 0
    return { businessMiles, personalMiles, businessPct }
  }, [entries])

  // Purpose label helper
  const purposeLabel = (key) => {
    const p = PURPOSES.find(pp => pp.key === key)
    return p ? t('mileageLog.' + p.tKey) : key
  }

  // Save manual entry
  const handleSave = async () => {
    if (!formData.date || !formData.miles) return
    setSaving(true)
    const row = {
      user_id: userId,
      date: formData.date,
      origin: formData.origin,
      destination: formData.destination,
      miles: parseFloat(formData.miles) || 0,
      business_purpose: formData.business_purpose,
    }
    const { error } = await supabase.from('mileage_log').insert(row)
    if (!error) {
      setShowForm(false)
      setFormData({ date: '', origin: '', destination: '', miles: '', business_purpose: 'Delivery' })
      setToast(t('mileageLog.saved'))
      setTimeout(() => setToast(null), 2000)
      // Refresh
      setPeriodIdx(prev => { setPeriodIdx(prev); return prev })
      // Force re-fetch by toggling loading
      setLoading(true)
      const { data: manual } = await supabase
        .from('mileage_log')
        .select('*')
        .eq('user_id', userId)
        .gte('date', currentPeriod.start)
        .lte('date', currentPeriod.end)
        .order('date', { ascending: true })
      const { data: trips } = await supabase
        .from('trips')
        .select('id, origin, destination, distance_km, deadhead_km, created_at')
        .eq('user_id', userId)
        .gte('created_at', currentPeriod.start + 'T00:00:00')
        .lte('created_at', currentPeriod.end + 'T23:59:59')
        .order('created_at', { ascending: true })
      const tripEntries = (trips || []).map(tr => ({
        id: 'trip_' + tr.id,
        date: (tr.created_at || '').slice(0, 10),
        origin: tr.origin || '',
        destination: tr.destination || '',
        miles: toMiles(tr.distance_km),
        business_purpose: tr.deadhead_km > 0 ? 'Deadhead' : 'Delivery',
        source: 'trip',
        trip_id: tr.id,
      }))
      const manualEntries = (manual || []).map(m => ({
        id: 'manual_' + m.id,
        date: m.date || '',
        origin: m.origin || '',
        destination: m.destination || '',
        miles: m.miles || 0,
        business_purpose: m.business_purpose || 'Other',
        source: 'manual',
        db_id: m.id,
      }))
      setEntries([...tripEntries, ...manualEntries].sort((a, b) => (a.date || '').localeCompare(b.date || '')))
      setLoading(false)
    }
    setSaving(false)
  }

  // Delete manual entry
  const handleDelete = async (entry) => {
    if (entry.source !== 'manual' || !entry.db_id) return
    await supabase.from('mileage_log').delete().eq('id', entry.db_id)
    setEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  // Export
  const handleExportPdf = async () => {
    setExporting(true)
    try {
      const { generateMileageLogPdf } = await import('../utils/mileageLogPdfExport')
      const exportEntries = filtered.map(e => ({ ...e, purpose_label: purposeLabel(e.business_purpose) }))
      await generateMileageLogPdf(exportEntries, summary, currentPeriod.label, lang)
    } catch (err) {
      console.error('PDF export error:', err)
    }
    setExporting(false)
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const { exportMileageLogExcel } = await import('../utils/mileageLogPdfExport')
      const exportEntries = filtered.map(e => ({ ...e, purpose_label: purposeLabel(e.business_purpose) }))
      exportMileageLogExcel(exportEntries, summary, currentPeriod.label)
    } catch (err) {
      console.error('Excel export error:', err)
    }
    setExporting(false)
  }

  const cardStyle = {
    background: theme.card, border: '1px solid ' + theme.border,
    borderRadius: '14px', padding: '16px', marginBottom: '12px',
  }
  const labelStyle = { fontSize: '12px', color: theme.dim, marginBottom: '4px' }
  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid ' + theme.border, background: theme.card,
    color: theme.text, fontSize: '14px', boxSizing: 'border-box',
  }
  const btnStyle = (active) => ({
    padding: '6px 14px', borderRadius: '8px', border: 'none',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    background: active ? '#f59e0b' : theme.card,
    color: active ? '#fff' : theme.text,
    border: active ? 'none' : '1px solid ' + theme.border,
  })

  return (
    <div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '14px' }}>
        {'\uD83D\uDCCB ' + t('mileageLog.title')}
      </div>

      {/* Period type selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        {['month', 'quarter', 'year'].map(pt => (
          <button key={pt} onClick={() => { setPeriodType(pt); setPeriodIdx(0) }} style={btnStyle(periodType === pt)}>
            {t('mileageLog.' + pt)}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div style={{ marginBottom: '12px' }}>
        <select
          value={periodIdx}
          onChange={e => setPeriodIdx(Number(e.target.value))}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {periodOptions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </div>

      {/* Filter: All / Business / Personal */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {['all', 'business', 'personal'].map(f => (
          <button key={f} onClick={() => setTripFilter(f)} style={btnStyle(tripFilter === f)}>
            {t('mileageLog.filter' + f.charAt(0).toUpperCase() + f.slice(1))}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={labelStyle}>{t('mileageLog.totalBusiness')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>{fmt1(summary.businessMiles)}</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={labelStyle}>{t('mileageLog.totalPersonal')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>{fmt1(summary.personalMiles)}</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={labelStyle}>{t('mileageLog.businessPct')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>{summary.businessPct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button
          onClick={handleExportPdf}
          disabled={exporting || filtered.length === 0}
          style={{
            flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
            background: (exporting || filtered.length === 0) ? theme.border : 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (exporting || filtered.length === 0) ? 'default' : 'pointer',
          }}
        >
          {t('mileageLog.exportPdf')}
        </button>
        <button
          onClick={handleExportExcel}
          disabled={exporting || filtered.length === 0}
          style={{
            flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
            background: (exporting || filtered.length === 0) ? theme.border : 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (exporting || filtered.length === 0) ? 'default' : 'pointer',
          }}
        >
          {t('mileageLog.exportExcel')}
        </button>
      </div>

      {/* Add entry button */}
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          marginBottom: '14px',
        }}
      >
        {'+ ' + t('mileageLog.addEntry')}
      </button>

      {/* Add form modal */}
      {showForm && (
        <div style={{ ...cardStyle, border: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div style={labelStyle}>{t('mileageLog.date')}</div>
              <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>{t('mileageLog.origin')}</div>
              <input value={formData.origin} onChange={e => setFormData(p => ({ ...p, origin: e.target.value }))} style={inputStyle} placeholder="City, State" />
            </div>
            <div>
              <div style={labelStyle}>{t('mileageLog.destination')}</div>
              <input value={formData.destination} onChange={e => setFormData(p => ({ ...p, destination: e.target.value }))} style={inputStyle} placeholder="City, State" />
            </div>
            <div>
              <div style={labelStyle}>{t('mileageLog.miles')}</div>
              <input type="number" inputMode="decimal" value={formData.miles} onChange={e => setFormData(p => ({ ...p, miles: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>{t('mileageLog.purpose')}</div>
              <select value={formData.business_purpose} onChange={e => setFormData(p => ({ ...p, business_purpose: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {PURPOSES.map(p => <option key={p.key} value={p.key}>{purposeLabel(p.key)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSave}
                disabled={saving || !formData.date || !formData.miles}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                  background: (saving || !formData.date || !formData.miles) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: '14px', fontWeight: 600, cursor: (saving || !formData.date || !formData.miles) ? 'default' : 'pointer',
                }}
              >
                {t('mileageLog.save')}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: '1px solid ' + theme.border, background: 'none',
                  color: theme.text, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('mileageLog.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: theme.dim, padding: '20px' }}>...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: theme.dim, padding: '20px', fontSize: '13px' }}>
          {t('mileageLog.noEntries')}
        </div>
      ) : (
        filtered.map(entry => (
          <div key={entry.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: theme.dim }}>{entry.date}</span>
                <span style={{
                  fontSize: '10px', padding: '2px 6px', borderRadius: '6px',
                  background: entry.source === 'trip' ? '#3b82f620' : '#f59e0b20',
                  color: entry.source === 'trip' ? '#3b82f6' : '#f59e0b',
                }}>
                  {entry.source === 'trip' ? t('mileageLog.fromTrips') : t('mileageLog.manual')}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, marginTop: '4px' }}>
                {entry.origin || '?'} {'\u2192'} {entry.destination || '?'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                  background: entry.business_purpose === 'Personal' ? '#ef444420' : '#22c55e20',
                  color: entry.business_purpose === 'Personal' ? '#ef4444' : '#22c55e',
                }}>
                  {purposeLabel(entry.business_purpose)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text, fontFamily: 'monospace' }}>
                  {fmt1(entry.miles)} mi
                </span>
              </div>
            </div>
            {entry.source === 'manual' && (
              <button
                onClick={() => handleDelete(entry)}
                style={{
                  background: 'none', border: 'none', color: '#ef4444',
                  fontSize: '16px', cursor: 'pointer', padding: '4px',
                }}
              >
                {'\u2715'}
              </button>
            )}
          </div>
        ))
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          background: '#22c55e', color: '#fff', padding: '10px 24px',
          borderRadius: '10px', fontSize: '13px', fontWeight: 600, zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
