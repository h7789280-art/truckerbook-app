import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useLanguage, applyCountryDefaults, COUNTRY_DEFAULTS, ALL_CURRENCIES, getCurrencySymbol, getUnits } from '../lib/i18n'
import { formatNumber } from '../lib/format'
import { supabase } from '../lib/supabase'
import BrandComboBox from './BrandComboBox'
import { STATE_OPTIONS } from '../utils/stateTaxData2026'

const FUEL_TYPE_KEYS = [
  { value: 'diesel', labelKey: 'profile.fuelDiesel' },
  { value: 'gasoline', labelKey: 'profile.fuelGasoline' },
  { value: 'gas', labelKey: 'profile.fuelGas' },
]

function getCountryLabel(code, uiLang) {
  try {
    return new Intl.DisplayNames([uiLang || 'en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

function getLanguageLabel(code) {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code
  } catch {
    return code
  }
}

function getVehicleLimit(plan) {
  if (plan === 'business_pro') return Infinity
  if (plan === 'business') return 50
  return 3
}

function getVehicleLimitMessage(plan, t) {
  if (plan === 'business') return t('profile.maxFleet50')
  return t('profile.maxFleet3')
}

function PaySection({ userId, profile, theme, cardStyle, inputStyle, labelStyle }) {
  const { t } = useLanguage()
  const savedType = profile?.pay_type || 'none'
  const savedRate = profile?.pay_rate ? String(profile.pay_rate) : ''
  const [payType, setPayType] = useState(savedType)
  const [payRate, setPayRate] = useState(savedRate)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'ok' | 'err'

  const isDirty = payType !== savedType || payRate !== savedRate

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          pay_type: payType,
          pay_rate: payRate ? parseFloat(payRate) : null,
        })
        .eq('id', userId)
      if (error) throw error
      setStatus('ok')
      setTimeout(() => setStatus(null), 2000)
    } catch (e) {
      console.error('PaySection save error:', e)
      setStatus('err')
      setTimeout(() => setStatus(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleTypeChange = async (newType) => {
    setPayType(newType)
    if (newType === 'none') {
      setPayRate('')
      setSaving(true)
      setStatus(null)
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ pay_type: 'none', pay_rate: 0 })
          .eq('id', userId)
        if (error) throw error
        setStatus('ok')
        setTimeout(() => setStatus(null), 2000)
      } catch (e) {
        console.error('PaySection save error:', e)
        setStatus('err')
        setTimeout(() => setStatus(null), 3000)
      } finally {
        setSaving(false)
      }
    }
  }

  const payOptions = [
    { key: 'none', label: t('pay.none') },
    { key: 'per_mile', label: t('pay.perMile') },
    { key: 'percent', label: t('pay.percent') },
  ]

  return (
    <div style={{ ...cardStyle, marginBottom: '12px' }}>
      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: theme.dim,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {t('pay.paySection')}
      </div>
      <div style={{ display: 'flex', gap: '4px', background: theme.bg, borderRadius: '10px', padding: '3px', marginBottom: payType !== 'none' ? '12px' : '0' }}>
        {payOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleTypeChange(opt.key)}
            disabled={saving}
            style={{
              flex: 1,
              padding: '8px 6px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: payType === opt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
              color: payType === opt.key ? '#fff' : theme.dim,
              transition: 'all 0.2s',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {payType !== 'none' && (
        <div>
          <label style={labelStyle}>{t('pay.rate')}</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              placeholder={payType === 'per_mile' ? '0.50' : '25'}
              style={{ ...inputStyle, paddingRight: '50px' }}
            />
            <span style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.dim,
              fontSize: '14px',
              fontWeight: 600,
            }}>
              {payType === 'per_mile' ? '$/mi' : '%'}
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '10px',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: (saving || !isDirty) ? 'not-allowed' : 'pointer',
              background: (saving || !isDirty) ? theme.border : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: (saving || !isDirty) ? theme.dim : '#fff',
              transition: 'all 0.2s',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {saving ? '...' : t('pay.save')}
          </button>
        </div>
      )}
      {status === 'ok' && (
        <div style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600, marginTop: '6px', textAlign: 'center' }}>
          {t('pay.saved')} \u2713
        </div>
      )}
      {status === 'err' && (
        <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600, marginTop: '6px', textAlign: 'center' }}>
          {t('pay.saveError')}
        </div>
      )}
    </div>
  )
}

export default function ProfileScreen({ userId, profile, onBack, onLogout }) {
  const { theme } = useTheme()
  const { t, lang, setLang } = useLanguage()
  const unitSys = getUnits()
  const [vehicles, setVehicles] = useState([])
  const [loggingOut, setLoggingOut] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    year: '',
    odometer: '',
    plate_number: '',
    fuel_consumption: 34,
    fuel_type: 'diesel',
    driver_name: '',
    driver_phone: '',
    driver_pay_type: '',
    driver_pay_rate: '',
    driver_employment_type: '',
  })
  const [inviteStatus, setInviteStatus] = useState(null) // null | 'sending' | 'sent' | 'error'

  // Edit main vehicle state
  const [editingMain, setEditingMain] = useState(false)
  const [mainForm, setMainForm] = useState({
    brand: '',
    model: '',
    odometer: '',
    plate_number: '',
    fuel_consumption: 34,
  })
  const [savingMain, setSavingMain] = useState(false)

  // Edit additional vehicle state
  const [editingVehicleId, setEditingVehicleId] = useState(null)
  const [vehicleForm, setVehicleForm] = useState({
    brand: '',
    model: '',
    year: '',
    odometer: '',
    plate_number: '',
    fuel_consumption: 34,
    fuel_type: 'diesel',
    driver_name: '',
  })
  const [savingVehicle, setSavingVehicle] = useState(false)

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [hosMode, setHosMode] = useState(profile?.hos_mode || 'cis')
  const [savingHos, setSavingHos] = useState(false)
  const [stateOfResidence, setStateOfResidence] = useState(profile?.state_of_residence || 'TX')
  const [savingState, setSavingState] = useState(false)
  const [stateSavedFlash, setStateSavedFlash] = useState(false)
  const [country, setCountry] = useState(() => {
    try { return localStorage.getItem('truckerbook_country') || 'RU' } catch { return 'RU' }
  })
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem('truckerbook_currency') || 'RUB' } catch { return 'RUB' }
  })
  const [units, setUnitsState] = useState(() => {
    try { return localStorage.getItem('truckerbook_units') || 'metric' } catch { return 'metric' }
  })

  const isHiredDriver = !!(profile?.company_id)

  const fetchVehicles = async (uid) => {
    if (!uid) return
    try {
      let query = supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: true })
      if (isHiredDriver) {
        query = query.eq('driver_id', uid)
      } else {
        query = query.eq('user_id', uid)
      }
      const { data, error } = await query
      if (error) {
        console.error('ProfileScreen: vehicles fetch error', error)
        return
      }
      setVehicles(data || [])
    } catch (err) {
      console.error('ProfileScreen: vehicles fetch exception', err)
    }
  }

  useEffect(() => {
    if (userId) {
      fetchVehicles(userId)
    }
  }, [userId])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('signOut error:', error)
        alert(error.message)
      } else {
        if (onLogout) onLogout()
      }
    } catch (err) {
      console.error('signOut exception:', err)
      alert(String(err))
    } finally {
      setLoggingOut(false)
    }
  }

  const handleSetActive = async (vehicleId) => {
    // Deactivate all, then activate selected
    await supabase
      .from('vehicles')
      .update({ is_active: false })
      .eq('user_id', userId)
    await supabase
      .from('vehicles')
      .update({ is_active: true })
      .eq('id', vehicleId)
    await fetchVehicles(userId)
  }

  const handleAddVehicle = async () => {
    if (!formData.brand || !formData.model || !formData.odometer || !formData.fuel_consumption) {
      alert(t('profile.fillRequired'))
      return
    }

    const limit = getVehicleLimit(profile?.plan)
    if (vehicles.length >= limit) {
      alert(getVehicleLimitMessage(profile?.plan, t))
      return
    }

    setSaving(true)
    setInviteStatus(null)
    try {
      const isCompany = profile?.role === 'company'
      const driverPhone = isCompany ? (formData.driver_phone || '').trim() : ''

      // 1) If company + driver phone: create driver profile via invite
      let driverProfileId = null
      if (isCompany && driverPhone) {
        const inviteCode = Math.random().toString(36).slice(2, 10)
        // Create a placeholder profile for the invited driver
        const { data: driverData, error: driverErr } = await supabase
          .from('profiles')
          .insert({
            phone: driverPhone,
            name: formData.driver_name || '',
            role: 'driver',
            company_id: userId,
            invited: true,
            invite_code: inviteCode,
            pay_type: formData.driver_pay_type || 'none',
            pay_rate: formData.driver_pay_rate ? parseFloat(formData.driver_pay_rate) : null,
            employment_type: formData.driver_employment_type || null,
            plan: 'pro',
          })
          .select('id')
          .single()
        if (driverErr) {
          console.error('Create driver profile error:', driverErr)
          // Driver profile creation may fail if phone already exists — continue without linking
        } else {
          driverProfileId = driverData?.id || null
        }
      }

      // 2) Create vehicle
      const row = {
        user_id: userId,
        brand: formData.brand,
        model: formData.model,
        year: formData.year ? parseInt(formData.year, 10) : null,
        odometer: parseInt(formData.odometer, 10) || 0,
        plate_number: formData.plate_number || null,
        fuel_consumption: parseFloat(formData.fuel_consumption) || 34,
        fuel_type: formData.fuel_type || 'diesel',
        driver_name: formData.driver_name || null,
        driver_id: driverProfileId,
        is_active: false,
      }
      const { error } = await supabase.from('vehicles').insert(row)
      if (error) {
        console.error('Add vehicle error:', error)
        alert(t('profile.errorPrefix') + error.message)
        return
      }

      // 3) Send SMS invite via n8n webhook
      const webhookUrl = import.meta.env.VITE_N8N_INVITE_WEBHOOK
      if (isCompany && driverPhone && driverProfileId && webhookUrl) {
        setInviteStatus('sending')
        try {
          const inviteUrl = `${window.location.origin}/invite/${inviteCode}`
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: driverPhone,
              driverName: formData.driver_name || '',
              companyName: profile?.name || 'TruckerBook',
              inviteCode,
              inviteUrl,
            }),
          })
          setInviteStatus('sent')
        } catch (smsErr) {
          console.error('SMS invite error:', smsErr)
          setInviteStatus('error')
          // Non-blocking: vehicle still created
        }
      } else if (isCompany && driverPhone && driverProfileId) {
        // Webhook not configured — driver added without SMS
        setInviteStatus('added_no_sms')
      }

      setShowAddForm(false)
      setFormData({
        brand: '',
        model: '',
        year: '',
        odometer: '',
        plate_number: '',
        fuel_consumption: 34,
        fuel_type: 'diesel',
        driver_name: '',
        driver_phone: '',
        driver_pay_type: '',
        driver_pay_rate: '',
        driver_employment_type: '',
      })
      await fetchVehicles(userId)
    } finally {
      setSaving(false)
    }
  }

  // --- Edit main vehicle handlers ---
  const startEditMain = () => {
    setMainForm({
      brand: profile?.brand || '',
      model: profile?.model || '',
      odometer: profile?.odometer ? String(profile.odometer) : '',
      plate_number: profile?.plate_number || '',
      fuel_consumption: profile?.fuel_consumption || 34,
    })
    setEditingMain(true)
  }

  const cancelEditMain = () => {
    setEditingMain(false)
  }

  const saveMain = async () => {
    setSavingMain(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          brand: mainForm.brand,
          model: mainForm.model,
          odometer: parseInt(mainForm.odometer, 10) || 0,
          plate_number: mainForm.plate_number || null,
          fuel_consumption: parseFloat(mainForm.fuel_consumption) || 34,
        })
        .eq('id', userId)
      if (error) {
        console.error('Update main vehicle error:', error)
        alert(t('profile.errorPrefix') + error.message)
        return
      }
      setEditingMain(false)
      if (onBack) onBack()
    } finally {
      setSavingMain(false)
    }
  }

  // --- Edit additional vehicle handlers ---
  const startEditVehicle = (v) => {
    setVehicleForm({
      brand: v.brand || '',
      model: v.model || '',
      year: v.year ? String(v.year) : '',
      odometer: v.odometer ? String(v.odometer) : '',
      plate_number: v.plate_number || '',
      fuel_consumption: v.fuel_consumption || 34,
      fuel_type: v.fuel_type || 'diesel',
      driver_name: v.driver_name || '',
    })
    setEditingVehicleId(v.id)
  }

  const cancelEditVehicle = () => {
    setEditingVehicleId(null)
  }

  const saveVehicle = async (vehicleId) => {
    setSavingVehicle(true)
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          brand: vehicleForm.brand,
          model: vehicleForm.model,
          year: vehicleForm.year ? parseInt(vehicleForm.year, 10) : null,
          odometer: parseInt(vehicleForm.odometer, 10) || 0,
          plate_number: vehicleForm.plate_number || null,
          fuel_consumption: parseFloat(vehicleForm.fuel_consumption) || 34,
          fuel_type: vehicleForm.fuel_type || 'diesel',
          driver_name: vehicleForm.driver_name || null,
        })
        .eq('id', vehicleId)
      if (error) {
        console.error('Update vehicle error:', error)
        alert(t('profile.errorPrefix') + error.message)
        return
      }
      setEditingVehicleId(null)
      await fetchVehicles(userId)
    } finally {
      setSavingVehicle(false)
    }
  }

  // --- Delete vehicle handlers ---
  const confirmDeleteVehicle = async (vehicleId) => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicleId)
      if (error) {
        console.error('Delete vehicle error:', error)
        alert(t('profile.errorPrefix') + error.message)
        return
      }
      setDeleteConfirmId(null)
      await fetchVehicles(userId)
    } finally {
      setDeleting(false)
    }
  }


  const handleHosMode = async (newMode) => {
    if (newMode === hosMode || savingHos) return
    setSavingHos(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ hos_mode: newMode })
        .eq('id', userId)
      if (error) {
        console.error('Update hos_mode error:', error)
        return
      }
      setHosMode(newMode)
    } finally {
      setSavingHos(false)
    }
  }

  const handleStateChange = async (newState) => {
    if (newState === stateOfResidence || savingState) return
    setSavingState(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ state_of_residence: newState })
        .eq('id', userId)
      if (error) {
        console.error('Update state_of_residence error:', error)
        return
      }
      setStateOfResidence(newState)
      setStateSavedFlash(true)
      setTimeout(() => setStateSavedFlash(false), 1800)
    } finally {
      setSavingState(false)
    }
  }

  const cardStyle = {
    background: theme.card,
    border: '1px solid ' + theme.border,
    borderRadius: '12px',
    padding: '16px',
  }

  const Row = ({ label, value }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid ' + theme.border,
    }}>
      <span style={{ fontSize: '14px', color: theme.dim }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>
        {value || '\u2014'}
      </span>
    </div>
  )

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid ' + theme.border,
    background: theme.card2 || theme.card,
    color: theme.text,
    fontSize: '15px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    boxSizing: 'border-box',
    outline: 'none',
  }

  const labelStyle = {
    fontSize: '13px',
    color: theme.dim,
    marginBottom: '4px',
    display: 'block',
  }


  return (
    <div style={{
      padding: '16px',
      minHeight: '100vh',
      backgroundColor: theme.bg,
      paddingBottom: '80px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px',
            color: theme.text,
            padding: '4px',
          }}
        >{'\u2190'}</button>
        <div style={{ fontSize: '20px', fontWeight: 700, color: theme.text }}>
          {t('profile.title')}
        </div>
      </div>

      {/* Avatar */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          margin: '0 auto 8px',
        }}>
          {'\uD83D\uDE9B'}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
          {profile?.name || t('profile.driverFallback')}
        </div>
        <div style={{ fontSize: '13px', color: theme.dim, marginTop: '4px' }}>
          {profile?.plan === 'trial' ? 'Trial' : profile?.plan === 'pro' ? 'Pro' : profile?.plan || ''}
        </div>
      </div>

      {/* Language & Country selectors */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: '18px' }}>{'\uD83C\uDF0D'}</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid ' + theme.border,
            background: theme.card,
            color: theme.text,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            outline: 'none',
            cursor: 'pointer',
            maxWidth: '160px',
          }}
          onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        >
          {[
            { code: 'ru', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
            { code: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
            { code: 'uk', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
            { code: 'es', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
            { code: 'de', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
            { code: 'fr', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
            { code: 'tr', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
            { code: 'pl', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
          ].map(opt => (
            <option key={opt.code} value={opt.code}>{opt.flag + ' ' + getLanguageLabel(opt.code)}</option>
          ))}
        </select>
        <select
          value={country}
          onChange={(e) => {
            const v = e.target.value
            setCountry(v)
            try { localStorage.setItem('truckerbook_country', v) } catch {}
            applyCountryDefaults(v)
            const defaults = COUNTRY_DEFAULTS[v]
            if (defaults) {
              setCurrency(defaults.currency)
              setUnitsState(defaults.units)
            }
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid ' + theme.border,
            background: theme.card,
            color: theme.text,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            outline: 'none',
            cursor: 'pointer',
            maxWidth: '160px',
          }}
          onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        >
          {[
            { code: 'RU', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
            { code: 'US', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
            { code: 'UA', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
            { code: 'BY', flag: '\uD83C\uDDE7\uD83C\uDDFE' },
            { code: 'KZ', flag: '\uD83C\uDDF0\uD83C\uDDFF' },
            { code: 'UZ', flag: '\uD83C\uDDFA\uD83C\uDDFF' },
            { code: 'DE', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
            { code: 'FR', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
            { code: 'ES', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
            { code: 'TR', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
            { code: 'PL', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
          ].map(opt => (
            <option key={opt.code} value={opt.code}>{opt.flag + ' ' + getCountryLabel(opt.code, lang)}</option>
          ))}
        </select>
      </div>

      {/* Currency & Units selects */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: '18px' }}>{'\uD83D\uDCB1'}</span>
        <select
          value={currency}
          onChange={(e) => {
            const v = e.target.value
            setCurrency(v)
            try { localStorage.setItem('truckerbook_currency', v) } catch {}
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid ' + theme.border,
            background: theme.card,
            color: theme.text,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            outline: 'none',
            cursor: 'pointer',
            maxWidth: '160px',
          }}
          onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        >
          {ALL_CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <select
          value={units}
          onChange={(e) => {
            const v = e.target.value
            setUnitsState(v)
            try { localStorage.setItem('truckerbook_units', v) } catch {}
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid ' + theme.border,
            background: theme.card,
            color: theme.text,
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            outline: 'none',
            cursor: 'pointer',
            maxWidth: '200px',
          }}
          onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        >
          <option value="metric">{t('profile.unitsMetric')}</option>
          <option value="imperial">{'Imperial (mi, gal)'}</option>
        </select>
      </div>

      {/* Profile info */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: theme.dim,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          {t('profile.personalInfo')}
        </div>
        <Row
          label={t('profile.name')}
          value={profile?.name}
        />
        <Row
          label={t('profile.phone')}
          value={profile?.phone}
        />
        {/* HOS mode toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          borderBottom: '1px solid ' + theme.border,
        }}>
          <span style={{ fontSize: '14px', color: theme.dim }}>{t('profile.drivingMode')}</span>
          <div style={{ display: 'flex', gap: '4px', background: theme.bg, borderRadius: '10px', padding: '3px' }}>
            {[
              { key: 'cis', label: '\uD83C\uDDF7\uD83C\uDDFA ' + (getCountryLabel('RU', lang) || 'CIS') },
              { key: 'usa', label: '\uD83C\uDDFA\uD83C\uDDF8 ' + (getCountryLabel('US', lang) || 'USA') },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => handleHosMode(opt.key)}
                disabled={savingHos}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingHos ? 'not-allowed' : 'pointer',
                  background: hosMode === opt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                  color: hosMode === opt.key ? '#fff' : theme.dim,
                  transition: 'all 0.2s',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* State of residence — owner_operator and driver_1099 only (Schedule C filers) */}
        {(profile?.role === 'owner_operator' || (profile?.role === 'driver' && profile?.employment_type === '1099')) && (
          <div style={{
            padding: '12px 0',
            borderBottom: '1px solid ' + theme.border,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ fontSize: '14px', color: theme.dim }}>{t('taxSummary.stateOfResidenceLabel')}</span>
              <select
                value={stateOfResidence}
                onChange={(e) => handleStateChange(e.target.value)}
                disabled={savingState}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid ' + theme.border,
                  background: theme.card,
                  color: theme.text,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingState ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  minWidth: '180px',
                }}
              >
                {STATE_OPTIONS.map(s => (
                  <option key={s.code} value={s.code}>{s.code + ' \u2014 ' + s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: '11px', color: theme.dim, marginTop: '6px', lineHeight: 1.4 }}>
              {t('taxSummary.stateOfResidenceHint')}
            </div>
            {stateSavedFlash && (
              <div style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600, marginTop: '4px' }}>
                {t('pay.saved') + ' \u2713'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pay settings — driver only */}
      {profile?.role === 'driver' && (
        <PaySection userId={userId} profile={profile} theme={theme} cardStyle={cardStyle} inputStyle={inputStyle} labelStyle={labelStyle} />
      )}

      {/* Main vehicle from profiles */}
      <div style={{ ...cardStyle, marginBottom: '12px', position: 'relative' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.dim,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}>
            {t('profile.vehicle')}
          </div>
          {!editingMain && (
            <button
              onClick={startEditMain}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px',
                lineHeight: 1,
              }}
              title={t('profile.edit')}
            >{'\u270F\uFE0F'}</button>
          )}
        </div>
        {editingMain ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{t('vehicle.brand')}</label>
              <BrandComboBox
                value={mainForm.brand}
                onChange={(v) => setMainForm({ ...mainForm, brand: v })}
                inputStyle={inputStyle}
                dropdownBg={theme.card}
                dropdownBorder={theme.border}
                textColor={theme.text}
                dimColor={theme.dim}
                hoverBg={theme.card2 || theme.card}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('vehicle.model')}</label>
              <input
                type="text"
                value={mainForm.model}
                onChange={(e) => setMainForm({ ...mainForm, model: e.target.value })}
                placeholder={t('profile.modelPlaceholder')}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('profile.mileage') + ' (' + (unitSys === 'imperial' ? t('common.mi') : t('common.km')) + ')'}</label>
              <input
                type="number"
                value={mainForm.odometer}
                onChange={(e) => setMainForm({ ...mainForm, odometer: e.target.value })}
                placeholder="0"
                min="0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('profile.plateLabel')}</label>
              <input
                type="text"
                value={mainForm.plate_number}
                onChange={(e) => setMainForm({ ...mainForm, plate_number: e.target.value })}
                placeholder={t('profile.platePlaceholder')}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('profile.consumption') + ': ' + mainForm.fuel_consumption + ' ' + t('profile.consumptionUnit')}</label>
              <input
                type="range"
                min="5"
                max="60"
                step="0.5"
                value={mainForm.fuel_consumption}
                onChange={(e) => setMainForm({ ...mainForm, fuel_consumption: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.dim }}>
                <span>5</span>
                <span>60</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={saveMain}
                disabled={savingMain}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: savingMain ? 'not-allowed' : 'pointer',
                  opacity: savingMain ? 0.5 : 1,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {savingMain ? t('common.saving') : t('common.save')}
              </button>
              <button
                onClick={cancelEditMain}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid ' + theme.border,
                  background: theme.card2 || theme.card,
                  color: theme.text,
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row
              label={t('vehicle.brand')}
              value={profile?.brand}
            />
            <Row
              label={t('vehicle.model')}
              value={profile?.model}
            />
            <Row
              label={t('profile.mileage')}
              value={profile?.odometer
                ? formatNumber(unitSys === 'imperial' ? profile.odometer * 0.621371 : profile.odometer, lang, { maximumFractionDigits: 0 }) + ' ' + (unitSys === 'imperial' ? t('common.mi') : t('common.km'))
                : null}
            />
            <Row
              label={t('profile.plateLabel')}
              value={profile?.plate_number}
            />
            <Row
              label={t('profile.consumption')}
              value={profile?.fuel_consumption ? profile.fuel_consumption + ' ' + t('profile.consumptionUnit') : null}
            />
          </>
        )}
      </div>

      {/* Extra vehicles from vehicles table — only for company (fleet) */}
      {vehicles.length > 0 && profile?.role === 'company' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.dim,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            {t('profile.extraVehicles')} ({vehicles.length})
          </div>

          {vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                ...cardStyle,
                marginBottom: '8px',
                border: v.is_active
                  ? '2px solid #f59e0b'
                  : '1px solid ' + theme.border,
              }}
            >
              {/* Header row with title + action icons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{'\uD83D\uDE9B'}</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
                      {v.brand} {v.model}
                    </div>
                    {v.plate_number && (
                      <div style={{ fontSize: '12px', color: theme.dim }}>{v.plate_number}</div>
                    )}
                    {v.driver_name && (
                      <div style={{ fontSize: '12px', color: theme.dim }}>{'\uD83D\uDC64'} {v.driver_name}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {editingVehicleId !== v.id && (
                    <>
                      <button
                        onClick={() => startEditVehicle(v)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px',
                          lineHeight: 1,
                        }}
                        title={t('profile.edit')}
                      >{'\u270F\uFE0F'}</button>
                      <button
                        onClick={() => setDeleteConfirmId(v.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px',
                          lineHeight: 1,
                        }}
                        title={t('common.delete')}
                      >{'\uD83D\uDDD1\uFE0F'}</button>
                    </>
                  )}
                  {v.is_active ? (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#f59e0b',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#f59e0b20',
                      marginLeft: '4px',
                    }}>
                      {t('profile.active')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetActive(v.id)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: theme.text,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: theme.card2 || theme.card,
                        border: '1px solid ' + theme.border,
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                        marginLeft: '4px',
                      }}
                    >
                      {t('profile.select')}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit mode for this vehicle */}
              {editingVehicleId === v.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>{t('vehicle.brand')}</label>
                    <BrandComboBox
                      value={vehicleForm.brand}
                      onChange={(v) => setVehicleForm({ ...vehicleForm, brand: v })}
                      inputStyle={inputStyle}
                      dropdownBg={theme.card}
                      dropdownBorder={theme.border}
                      textColor={theme.text}
                      dimColor={theme.dim}
                      hoverBg={theme.card2 || theme.card}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('vehicle.model')}</label>
                    <input
                      type="text"
                      value={vehicleForm.model}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                      placeholder={t('profile.modelPlaceholder')}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.year')}</label>
                    <input
                      type="number"
                      value={vehicleForm.year}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                      placeholder="2020"
                      min="1990"
                      max="2030"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.mileage') + ' (' + (unitSys === 'imperial' ? t('common.mi') : t('common.km')) + ')'}</label>
                    <input
                      type="number"
                      value={vehicleForm.odometer}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, odometer: e.target.value })}
                      placeholder="0"
                      min="0"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.plateLabel')}</label>
                    <input
                      type="text"
                      value={vehicleForm.plate_number}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                      placeholder={t('profile.platePlaceholder')}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.driverNameField')}</label>
                    <input
                      type="text"
                      value={vehicleForm.driver_name}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, driver_name: e.target.value })}
                      placeholder={t('profile.driverNamePlaceholder')}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.consumption') + ': ' + vehicleForm.fuel_consumption + ' ' + t('profile.consumptionUnit')}</label>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="0.5"
                      value={vehicleForm.fuel_consumption}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, fuel_consumption: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: '#f59e0b' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.dim }}>
                      <span>5</span>
                      <span>60</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('profile.fuelType')}</label>
                    <select
                      value={vehicleForm.fuel_type}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}
                      style={inputStyle}
                    >
                      {FUEL_TYPE_KEYS.map((ft) => (
                        <option key={ft.value} value={ft.value}>{t(ft.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={() => saveVehicle(v.id)}
                      disabled={savingVehicle}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: savingVehicle ? 'not-allowed' : 'pointer',
                        opacity: savingVehicle ? 0.5 : 1,
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      }}
                    >
                      {savingVehicle ? t('common.saving') : t('common.save')}
                    </button>
                    <button
                      onClick={cancelEditVehicle}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid ' + theme.border,
                        background: theme.card2 || theme.card,
                        color: theme.text,
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  fontSize: '12px',
                  color: theme.dim,
                }}>
                  <span>{v.odometer ? formatNumber(unitSys === 'imperial' ? v.odometer * 0.621371 : v.odometer, lang, { maximumFractionDigits: 0 }) + ' ' + (unitSys === 'imperial' ? t('common.mi') : t('common.km')) : ''}</span>
                  <span>{v.fuel_consumption ? v.fuel_consumption + ' ' + t('profile.consumptionUnit') : ''}</span>
                  {v.year && <span>{v.year + ' ' + t('profile.yearShort')}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle button — only for company (owner_operator has single vehicle, driver gets assigned one) */}
      {profile?.role === 'company' && (
        <button
          onClick={() => {
            const limit = getVehicleLimit(profile?.plan)
            if (vehicles.length >= limit) {
              alert(getVehicleLimitMessage(profile?.plan))
              return
            }
            setShowAddForm(true)
          }}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '20px' }}>+</span>
          {t('vehicle.addVehicle')}
        </button>
      )}

      {/* Logout button */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: '1px solid #ef4444',
          background: '#ef444415',
          color: '#ef4444',
          fontSize: '16px',
          fontWeight: 600,
          cursor: loggingOut ? 'not-allowed' : 'pointer',
          opacity: loggingOut ? 0.5 : 1,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {loggingOut
          ? t('logout.loading')
          : t('logout.button')}
      </button>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (() => {
        const vDel = vehicles.find((v) => v.id === deleteConfirmId)
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}>
            <div style={{
              background: theme.bg,
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '360px',
              border: '1px solid ' + theme.border,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\u26A0\uFE0F'}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '8px' }}>
                {t('profile.deleteVehicleConfirm').replace('{vehicle}', vDel ? vDel.brand + ' ' + vDel.model : '')}
              </div>
              <div style={{ fontSize: '14px', color: theme.dim, marginBottom: '20px' }}>
                {t('profile.deleteVehicleWarning')}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => confirmDeleteVehicle(deleteConfirmId)}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  }}
                >
                  {deleting ? t('profile.deleting') : t('common.delete')}
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid ' + theme.border,
                    background: theme.card2 || theme.card,
                    color: theme.text,
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add vehicle modal */}
      {showAddForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            background: theme.bg,
            borderRadius: '16px',
            padding: '20px',
            width: '100%',
            maxWidth: '420px',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '1px solid ' + theme.border,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
                {t('profile.newVehicle')}
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: theme.dim,
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >{'\u2715'}</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Brand */}
              <div>
                <label style={labelStyle}>
                  {t('vehicle.brand') + ' *'}
                </label>
                <BrandComboBox
                  value={formData.brand}
                  onChange={(v) => setFormData({ ...formData, brand: v })}
                  inputStyle={inputStyle}
                  dropdownBg={theme.card}
                  dropdownBorder={theme.border}
                  textColor={theme.text}
                  dimColor={theme.dim}
                  hoverBg={theme.card2 || theme.card}
                />
              </div>

              {/* Model */}
              <div>
                <label style={labelStyle}>
                  {t('vehicle.model') + ' *'}
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder={t('profile.modelPlaceholder')}
                  style={inputStyle}
                />
              </div>

              {/* Year */}
              <div>
                <label style={labelStyle}>
                  {t('profile.year')}
                </label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  placeholder="2020"
                  min="1990"
                  max="2030"
                  style={inputStyle}
                />
              </div>

              {/* Odometer */}
              <div>
                <label style={labelStyle}>
                  {t('profile.mileage') + ' (' + (unitSys === 'imperial' ? t('common.mi') : t('common.km')) + ') *'}
                </label>
                <input
                  type="number"
                  value={formData.odometer}
                  onChange={(e) => setFormData({ ...formData, odometer: e.target.value })}
                  placeholder="0"
                  min="0"
                  style={inputStyle}
                />
              </div>

              {/* Plate number */}
              <div>
                <label style={labelStyle}>
                  {t('profile.plateLabel')}
                </label>
                <input
                  type="text"
                  value={formData.plate_number}
                  onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                  placeholder={t('profile.platePlaceholder')}
                  style={inputStyle}
                />
              </div>

              {/* Driver name */}
              <div>
                <label style={labelStyle}>
                  {t('invite.driverName')}
                </label>
                <input
                  type="text"
                  value={formData.driver_name}
                  onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                  placeholder={t('profile.driverNamePlaceholder')}
                  style={inputStyle}
                />
              </div>

              {/* Company-only: driver phone + pay settings */}
              {profile?.role === 'company' && (
                <>
                  <div>
                    <label style={labelStyle}>
                      {t('invite.driverPhone')} <span style={{ color: theme.dim, fontSize: '12px' }}>{t('invite.optional')}</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.driver_phone}
                      onChange={(e) => setFormData({ ...formData, driver_phone: e.target.value })}
                      placeholder={t('invite.phonePlaceholder')}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      {t('invite.payType')} <span style={{ color: theme.dim, fontSize: '12px' }}>{t('invite.optional')}</span>
                    </label>
                    <div style={{ display: 'flex', gap: '4px', background: theme.bg, borderRadius: '10px', padding: '3px' }}>
                      {[
                        { key: '', label: '\u2014' },
                        { key: 'per_mile', label: t('invite.perMile') },
                        { key: 'percent', label: t('invite.percent') },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setFormData({ ...formData, driver_pay_type: opt.key })}
                          style={{
                            flex: 1,
                            padding: '8px 6px',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: formData.driver_pay_type === opt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                            color: formData.driver_pay_type === opt.key ? '#fff' : theme.dim,
                            transition: 'all 0.2s',
                            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {formData.driver_pay_type && (
                    <div>
                      <label style={labelStyle}>
                        {t('invite.payRate')} {formData.driver_pay_type === 'per_mile' ? '($)' : '(%)'}
                      </label>
                      <input
                        type="number"
                        value={formData.driver_pay_rate}
                        onChange={(e) => setFormData({ ...formData, driver_pay_rate: e.target.value })}
                        placeholder={formData.driver_pay_type === 'per_mile' ? '0.55' : '25'}
                        min="0"
                        step="0.01"
                        style={inputStyle}
                      />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>
                      {t('invite.employmentType')} *
                    </label>
                    <div style={{ display: 'flex', gap: '4px', background: theme.bg, borderRadius: '10px', padding: '3px' }}>
                      {[
                        { key: 'w2', label: t('invite.w2Employee') },
                        { key: '1099', label: t('invite.contractor1099') },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setFormData({ ...formData, driver_employment_type: opt.key })}
                          style={{
                            flex: 1,
                            padding: '8px 6px',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: formData.driver_employment_type === opt.key ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                            color: formData.driver_employment_type === opt.key ? '#fff' : theme.dim,
                            transition: 'all 0.2s',
                            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Fuel consumption */}
              <div>
                <label style={labelStyle}>
                  {t('profile.consumptionAvg') + ' *: ' + formData.fuel_consumption + ' ' + t('profile.consumptionUnit')}
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="0.5"
                  value={formData.fuel_consumption}
                  onChange={(e) => setFormData({ ...formData, fuel_consumption: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#f59e0b' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.dim }}>
                  <span>5</span>
                  <span>60</span>
                </div>
              </div>

              {/* Fuel type */}
              <div>
                <label style={labelStyle}>
                  {t('profile.fuelType') + ' *'}
                </label>
                <select
                  value={formData.fuel_type}
                  onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                  style={inputStyle}
                >
                  {FUEL_TYPE_KEYS.map((ft) => (
                    <option key={ft.value} value={ft.value}>{t(ft.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleAddVehicle}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                marginTop: '16px',
              }}
            >
              {saving
                ? t('common.saving')
                : t('common.save')}
            </button>
            {inviteStatus === 'sent' && (
              <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: '#22c55e20', color: '#22c55e', fontSize: '13px', textAlign: 'center' }}>
                {t('invite.inviteSentSms')}
              </div>
            )}
            {inviteStatus === 'added_no_sms' && (
              <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: '#22c55e20', color: '#22c55e', fontSize: '13px', textAlign: 'center' }}>
                {t('invite.driverAdded')}
              </div>
            )}
            {inviteStatus === 'error' && (
              <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: '#ef444420', color: '#ef4444', fontSize: '13px', textAlign: 'center' }}>
                SMS error — {t('invite.driverPhone')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
