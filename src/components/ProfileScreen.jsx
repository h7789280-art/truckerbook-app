import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'

const BRANDS = {
  'Volvo': ['FH', 'FH16', 'FM', 'FMX', 'FE', 'FL'],
  'MAN': ['TGX', 'TGS', 'TGM', 'TGL'],
  'DAF': ['XF', 'XG', 'XG+', 'CF', 'LF'],
  'Scania': ['R', 'S', 'G', 'P', 'L'],
  'Mercedes-Benz': ['Actros', 'Arocs', 'Atego', 'Antos', 'Econic'],
  'Renault': ['T', 'T High', 'C', 'D', 'D Wide', 'K'],
  'Iveco': ['S-Way', 'X-Way', 'T-Way', 'Eurocargo', 'Daily'],
  '\u041a\u0430\u043c\u0410\u0417': ['5490', '54901', '65115', '6520', '43118'],
  '\u041c\u0410\u0417': ['5440', '6430', '6501', '5550'],
  '\u0413\u0410\u0417': ['3309', '3310', '33104', '33106'],
}

const FUEL_TYPES = [
  { value: 'diesel', label: '\u0414\u0438\u0437\u0435\u043B\u044C' },
  { value: 'gasoline', label: '\u0411\u0435\u043D\u0437\u0438\u043D' },
  { value: 'gas', label: '\u0413\u0430\u0437' },
]

function getVehicleLimit(plan) {
  if (plan === 'business_pro') return Infinity
  if (plan === 'business') return 50
  return 3
}

function getVehicleLimitMessage(plan) {
  if (plan === 'business') {
    return '\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 50 \u043C\u0430\u0448\u0438\u043D. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 Business Pro \u0434\u043B\u044F \u0431\u0435\u0437\u043B\u0438\u043C\u0438\u0442\u043D\u043E\u0433\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u0430.'
  }
  return '\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 3 \u043C\u0430\u0448\u0438\u043D\u044B \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0442\u0430\u0440\u0438\u0444\u0435. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 Business \u0434\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043E 50 \u043C\u0430\u0448\u0438\u043D.'
}

export default function ProfileScreen({ userId, profile, onBack, onLogout }) {
  const { theme } = useTheme()
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
  })

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

  const fetchVehicles = async (uid) => {
    if (!uid) return
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
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
      alert('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F')
      return
    }

    const limit = getVehicleLimit(profile?.plan)
    if (vehicles.length >= limit) {
      alert(getVehicleLimitMessage(profile?.plan))
      return
    }

    setSaving(true)
    try {
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
        is_active: false,
      }
      const { error } = await supabase.from('vehicles').insert(row)
      if (error) {
        console.error('Add vehicle error:', error)
        alert('\u041E\u0448\u0438\u0431\u043A\u0430: ' + error.message)
        return
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
        alert('\u041E\u0448\u0438\u0431\u043A\u0430: ' + error.message)
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
        alert('\u041E\u0448\u0438\u0431\u043A\u0430: ' + error.message)
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
        alert('\u041E\u0448\u0438\u0431\u043A\u0430: ' + error.message)
        return
      }
      setDeleteConfirmId(null)
      await fetchVehicles(userId)
    } finally {
      setDeleting(false)
    }
  }

  const mainBrandModels = mainForm.brand && BRANDS[mainForm.brand] ? BRANDS[mainForm.brand] : []
  const vehBrandModels = vehicleForm.brand && BRANDS[vehicleForm.brand] ? BRANDS[vehicleForm.brand] : []

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

  const brandModels = formData.brand && BRANDS[formData.brand] ? BRANDS[formData.brand] : []

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
          {'\u041F\u0440\u043E\u0444\u0438\u043B\u044C'}
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
          {profile?.name || '\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C'}
        </div>
        <div style={{ fontSize: '13px', color: theme.dim, marginTop: '4px' }}>
          {profile?.plan === 'trial' ? 'Trial' : profile?.plan === 'pro' ? 'Pro' : profile?.plan || ''}
        </div>
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
          {'\u041B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435'}
        </div>
        <Row
          label={'\u0418\u043C\u044F'}
          value={profile?.name}
        />
        <Row
          label={'\u0422\u0435\u043B\u0435\u0444\u043E\u043D'}
          value={profile?.phone}
        />
      </div>

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
            {'\u041C\u0430\u0448\u0438\u043D\u0430'}
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
              title={'\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C'}
            >{'\u270F\uFE0F'}</button>
          )}
        </div>
        {editingMain ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{'\u041C\u0430\u0440\u043A\u0430'}</label>
              <select
                value={mainForm.brand}
                onChange={(e) => setMainForm({ ...mainForm, brand: e.target.value, model: '' })}
                style={inputStyle}
              >
                <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0440\u043A\u0443'}</option>
                {Object.keys(BRANDS).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{'\u041C\u043E\u0434\u0435\u043B\u044C'}</label>
              {mainBrandModels.length > 0 ? (
                <select
                  value={mainForm.model}
                  onChange={(e) => setMainForm({ ...mainForm, model: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}</option>
                  {mainBrandModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={mainForm.model}
                  onChange={(e) => setMainForm({ ...mainForm, model: e.target.value })}
                  placeholder={'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}
                  style={inputStyle}
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>{'\u041F\u0440\u043E\u0431\u0435\u0433 (\u043A\u043C)'}</label>
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
              <label style={labelStyle}>{'\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440'}</label>
              <input
                type="text"
                value={mainForm.plate_number}
                onChange={(e) => setMainForm({ ...mainForm, plate_number: e.target.value })}
                placeholder={'\u0410123\u0411\u0412 77'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{'\u0420\u0430\u0441\u0445\u043E\u0434: ' + mainForm.fuel_consumption + ' \u043B/100\u043A\u043C'}</label>
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
                {savingMain ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
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
                {'\u041E\u0442\u043C\u0435\u043D\u0430'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row
              label={'\u041C\u0430\u0440\u043A\u0430'}
              value={profile?.brand}
            />
            <Row
              label={'\u041C\u043E\u0434\u0435\u043B\u044C'}
              value={profile?.model}
            />
            <Row
              label={'\u041F\u0440\u043E\u0431\u0435\u0433'}
              value={profile?.odometer ? profile.odometer.toLocaleString('ru-RU') + ' \u043A\u043C' : null}
            />
            <Row
              label={'\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440'}
              value={profile?.plate_number}
            />
            <Row
              label={'\u0420\u0430\u0441\u0445\u043E\u0434'}
              value={profile?.fuel_consumption ? profile.fuel_consumption + ' \u043B/100\u043A\u043C' : null}
            />
          </>
        )}
      </div>

      {/* Extra vehicles from vehicles table */}
      {vehicles.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.dim,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            {'\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043C\u0430\u0448\u0438\u043D\u044B'} ({vehicles.length})
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
                        title={'\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C'}
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
                        title={'\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
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
                      {'\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F'}
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
                      {'\u0412\u044B\u0431\u0440\u0430\u0442\u044C'}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit mode for this vehicle */}
              {editingVehicleId === v.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>{'\u041C\u0430\u0440\u043A\u0430'}</label>
                    <select
                      value={vehicleForm.brand}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value, model: '' })}
                      style={inputStyle}
                    >
                      <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0440\u043A\u0443'}</option>
                      {Object.keys(BRANDS).map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{'\u041C\u043E\u0434\u0435\u043B\u044C'}</label>
                    {vehBrandModels.length > 0 ? (
                      <select
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}</option>
                        {vehBrandModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                        placeholder={'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}
                        style={inputStyle}
                      />
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>{'\u0413\u043E\u0434 \u0432\u044B\u043F\u0443\u0441\u043A\u0430'}</label>
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
                    <label style={labelStyle}>{'\u041F\u0440\u043E\u0431\u0435\u0433 (\u043A\u043C)'}</label>
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
                    <label style={labelStyle}>{'\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440'}</label>
                    <input
                      type="text"
                      value={vehicleForm.plate_number}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                      placeholder={'\u0410123\u0411\u0412 77'}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{'\u0418\u043C\u044F \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F'}</label>
                    <input
                      type="text"
                      value={vehicleForm.driver_name}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, driver_name: e.target.value })}
                      placeholder={'\u041F\u0451\u0442\u0440 \u0418\u0432\u0430\u043D\u043E\u0432'}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{'\u0420\u0430\u0441\u0445\u043E\u0434: ' + vehicleForm.fuel_consumption + ' \u043B/100\u043A\u043C'}</label>
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
                    <label style={labelStyle}>{'\u0422\u0438\u043F \u0442\u043E\u043F\u043B\u0438\u0432\u0430'}</label>
                    <select
                      value={vehicleForm.fuel_type}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}
                      style={inputStyle}
                    >
                      {FUEL_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
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
                      {savingVehicle ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...' : '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
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
                      {'\u041E\u0442\u043C\u0435\u043D\u0430'}
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
                  <span>{v.odometer ? v.odometer.toLocaleString('ru-RU') + ' \u043A\u043C' : ''}</span>
                  <span>{v.fuel_consumption ? v.fuel_consumption + ' \u043B/100\u043A\u043C' : ''}</span>
                  {v.year && <span>{v.year} \u0433.</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle button */}
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
        {'\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u0448\u0438\u043D\u0443'}
      </button>

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
          ? '\u0412\u044B\u0445\u043E\u0434...'
          : '\u0412\u044B\u0439\u0442\u0438'}
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
                {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043C\u0430\u0448\u0438\u043D\u0443 ' + (vDel ? vDel.brand + ' ' + vDel.model : '') + '?'}
              </div>
              <div style={{ fontSize: '14px', color: theme.dim, marginBottom: '20px' }}>
                {'\u0412\u0441\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u044D\u0442\u043E\u0439 \u043C\u0430\u0448\u0438\u043D\u044B \u0431\u0443\u0434\u0443\u0442 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B.'}
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
                  {deleting ? '\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435...' : '\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
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
                  {'\u041E\u0442\u043C\u0435\u043D\u0430'}
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
                {'\u041D\u043E\u0432\u0430\u044F \u043C\u0430\u0448\u0438\u043D\u0430'}
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
                  {'\u041C\u0430\u0440\u043A\u0430 *'}
                </label>
                <select
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value, model: '' })}
                  style={inputStyle}
                >
                  <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0440\u043A\u0443'}</option>
                  {Object.keys(BRANDS).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label style={labelStyle}>
                  {'\u041C\u043E\u0434\u0435\u043B\u044C *'}
                </label>
                {brandModels.length > 0 ? (
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">{'\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}</option>
                    {brandModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder={'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C'}
                    style={inputStyle}
                  />
                )}
              </div>

              {/* Year */}
              <div>
                <label style={labelStyle}>
                  {'\u0413\u043E\u0434 \u0432\u044B\u043F\u0443\u0441\u043A\u0430'}
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
                  {'\u041F\u0440\u043E\u0431\u0435\u0433 (\u043A\u043C) *'}
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
                  {'\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440'}
                </label>
                <input
                  type="text"
                  value={formData.plate_number}
                  onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                  placeholder={'\u0410123\u0411\u0412 77'}
                  style={inputStyle}
                />
              </div>

              {/* Driver name */}
              <div>
                <label style={labelStyle}>
                  {'\u0418\u043C\u044F \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F'}
                </label>
                <input
                  type="text"
                  value={formData.driver_name}
                  onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                  placeholder={'\u041F\u0451\u0442\u0440 \u0418\u0432\u0430\u043D\u043E\u0432'}
                  style={inputStyle}
                />
              </div>

              {/* Fuel consumption */}
              <div>
                <label style={labelStyle}>
                  {'\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0440\u0430\u0441\u0445\u043E\u0434 *: ' + formData.fuel_consumption + ' \u043B/100\u043A\u043C'}
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
                  {'\u0422\u0438\u043F \u0442\u043E\u043F\u043B\u0438\u0432\u0430 *'}
                </label>
                <select
                  value={formData.fuel_type}
                  onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                  style={inputStyle}
                >
                  {FUEL_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
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
                ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...'
                : '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
