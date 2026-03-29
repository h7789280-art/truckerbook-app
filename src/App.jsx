import { useState, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { useOffline } from './hooks/useOffline'
import { ThemeProvider, useTheme } from './lib/theme'
import { LanguageProvider } from './lib/i18n'
import { supabase } from './lib/supabase'
import Overview from './tabs/Overview'
import Fuel from './tabs/Fuel'
import Byt from './tabs/Byt'
import Trips from './tabs/Trips'
import Service from './tabs/Service'
import BottomNav from './components/BottomNav'
import Auth from './components/Auth'
import PinLock from './components/PinLock'
import FAB from './components/FAB'
import AddModal from './components/AddModal'
import ProfileScreen from './components/ProfileScreen'
import Paywall from './components/Paywall'
import VehicleSwitcher from './components/VehicleSwitcher'
import BrandComboBox from './components/BrandComboBox'

function AppInner() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile(userId)
  const { theme } = useTheme()
  const { isOnline, syncStatus, syncedCount } = useOffline()
  const userRole = profile?.role || 'driver'
  const [activeTab, setActiveTab] = useState(userRole === 'job_seeker' ? 'jobs' : 'overview')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0)
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0)
  const [bytRefreshKey, setBytRefreshKey] = useState(0)
  const [serviceRefreshKey, setServiceRefreshKey] = useState(0)
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0)
  const [showProfile, setShowProfile] = useState(false)
  const [activeVehicleId, setActiveVehicleId] = useState('main')
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({ brand: '', model: '', mileage: '', plate: '', consumption: 34 })
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [vehicleError, setVehicleError] = useState('')
  const [showWelcome, setShowWelcome] = useState(false)

  const handleFuelSaved = useCallback(() => {
    setFuelRefreshKey((k) => k + 1)
  }, [])

  const handleTripSaved = useCallback(() => {
    setTripsRefreshKey((k) => k + 1)
  }, [])

  const handleBytSaved = useCallback(() => {
    setBytRefreshKey((k) => k + 1)
  }, [])

  const handleServiceSaved = useCallback(() => {
    setServiceRefreshKey((k) => k + 1)
  }, [])

  const handleVehicleExpenseSaved = useCallback(() => {
    setOverviewRefreshKey((k) => k + 1)
    setFuelRefreshKey((k) => k + 1)
  }, [])

  if (authLoading || (session && profileLoading)) {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: theme.dim,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
      </div>
    )
  }

  if (!session) {
    return <Auth onComplete={() => refetchProfile()} />
  }

  if (!profile) {
    return <Auth onComplete={() => refetchProfile()} onboardingOnly />
  }

  if (profile.pin_hash && !pinUnlocked) {
    return (
      <PinLock
        userId={userId}
        pinHash={profile.pin_hash}
        phone={session?.user?.phone || profile.phone || ''}
        onUnlock={() => setPinUnlocked(true)}
      />
    )
  }

  const isTrialExpired = profile.plan === 'trial'
    && profile.trial_ends_at
    && new Date(profile.trial_ends_at).getTime() < Date.now()

  if (userRole !== 'job_seeker' && (profile.plan === 'expired' || isTrialExpired)) {
    return <Paywall userId={userId} />
  }

  if (showProfile) {
    return (
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          minHeight: '100vh',
          background: theme.bg,
          color: theme.text,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <ProfileScreen
          userId={userId}
          profile={profile}
          onBack={() => setShowProfile(false)}
          onLogout={() => setShowProfile(false)}
        />
      </div>
    )
  }

  const userName = profile?.name || profile?.first_name || null

  const vehicleId = activeVehicleId === 'main' ? null : activeVehicleId

  const handleSaveVehicle = async () => {
    if (!vehicleForm.brand || !vehicleForm.model || !vehicleForm.mileage) return
    setVehicleSaving(true)
    setVehicleError('')
    try {
      const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('profiles').update({
        brand: vehicleForm.brand,
        model: vehicleForm.model,
        odometer: Number(vehicleForm.mileage),
        plate_number: vehicleForm.plate || null,
        fuel_consumption: vehicleForm.consumption,
        role: 'driver',
        plan: 'trial',
        trial_ends_at: trialEnds,
      }).eq('id', userId)
      if (error) throw error
      setShowAddVehicle(false)
      setShowWelcome(true)
      await refetchProfile()
      setTimeout(() => {
        setShowWelcome(false)
        setActiveTab('overview')
      }, 2500)
    } catch (e) {
      setVehicleError(e.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f')
    } finally {
      setVehicleSaving(false)
    }
  }

  const LockedTab = () => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
    }}>
      <span style={{ fontSize: 48, marginBottom: 16 }}>{'\ud83d\udd12'}</span>
      <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: theme.text }}>
        {'\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043f\u043e\u0441\u043b\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043c\u0430\u0448\u0438\u043d\u044b'}
      </p>
      <button
        onClick={() => setShowAddVehicle(true)}
        style={{
          marginTop: 16, padding: '12px 24px', background: '#f59e0b',
          color: '#fff', border: 'none', borderRadius: 12, fontSize: 15,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        {'\u0423\u0441\u0442\u0440\u043e\u0438\u043b\u0438\u0441\u044c \u043d\u0430 \u0440\u0430\u0431\u043e\u0442\u0443? \u2192 \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043c\u0430\u0448\u0438\u043d\u0443'}
      </button>
    </div>
  )

  const JobSeekerStub = ({ title }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 20, fontWeight: 600, color: theme.text }}>{title}</p>
      <p style={{ fontSize: 14, color: theme.dim, marginTop: 8 }}>{'\u0421\u043a\u043e\u0440\u043e'}</p>
    </div>
  )

  const renderTab = () => {
    if (userRole === 'job_seeker') {
      switch (activeTab) {
        case 'jobs':
          return <JobSeekerStub title={'\ud83d\udcbc \u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u2014 \u0441\u043a\u043e\u0440\u043e'} />
        case 'news':
          return <JobSeekerStub title={'\ud83d\udcf0 \u041d\u043e\u0432\u043e\u0441\u0442\u0438 \u2014 \u0441\u043a\u043e\u0440\u043e'} />
        case 'marketplace':
          return <JobSeekerStub title={'\ud83d\udce2 \u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441 \u2014 \u0441\u043a\u043e\u0440\u043e'} />
        default:
          return <LockedTab />
      }
    }
    switch (activeTab) {
      case 'fuel':
        return <Fuel userId={userId} refreshKey={fuelRefreshKey} activeVehicleId={vehicleId} />
      case 'byt':
        return <Byt userId={userId} refreshKey={bytRefreshKey} activeVehicleId={vehicleId} />
      case 'trips':
        return <Trips userId={userId} refreshKey={tripsRefreshKey} activeVehicleId={vehicleId} profile={profile} />
      case 'service':
        return <Service userId={userId} activeVehicleId={vehicleId} refreshKey={serviceRefreshKey} />
      default:
        return <Overview userName={userName} userId={userId} profile={profile} onOpenProfile={() => setShowProfile(true)} activeVehicleId={vehicleId} refreshKey={overviewRefreshKey} />
    }
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {!isOnline && (
        <div style={{
          background: '#ef4444',
          color: '#fff',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: 14,
          fontWeight: 500,
        }}>
          {'\ud83d\udce1 \u041d\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f. \u0414\u0430\u043d\u043d\u044b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e.'}
        </div>
      )}
      {syncStatus === 'done' && (
        <div style={{
          background: '#22c55e',
          color: '#fff',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: 14,
          fontWeight: 500,
        }}>
          {'\u2705 \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e. \u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u043e: ' + syncedCount + ' \u0437\u0430\u043f\u0438\u0441\u0435\u0439.'}
        </div>
      )}
      {showWelcome && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: theme.card, borderRadius: 20, padding: '40px 32px',
            textAlign: 'center', maxWidth: 340, width: '90%',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\ud83c\udf89'}</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, margin: '0 0 8px' }}>
              {'\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c!'}
            </h2>
            <p style={{ fontSize: 15, color: theme.dim, margin: 0 }}>
              {'\u0423 \u0432\u0430\u0441 7 \u0434\u043d\u0435\u0439 Pro-\u0434\u043e\u0441\u0442\u0443\u043f\u0430'}
            </p>
          </div>
        </div>
      )}
      {showAddVehicle && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9998,
        }}>
          <div style={{
            background: theme.card, borderRadius: 20, padding: '32px 24px',
            maxWidth: 400, width: '90%', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40 }}>{'\ud83d\ude9b'}</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, margin: '8px 0 0' }}>
                {'\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u043c\u0430\u0448\u0438\u043d\u0443'}
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, color: theme.dim, marginBottom: 6, display: 'block' }}>
                  {'\u041c\u0430\u0440\u043a\u0430'}
                </label>
                <BrandComboBox
                  value={vehicleForm.brand}
                  onChange={(v) => setVehicleForm({ ...vehicleForm, brand: v })}
                  inputStyle={{
                    width: '100%', padding: '14px 16px', background: theme.card2,
                    border: '1px solid ' + theme.border, borderRadius: 12,
                    color: theme.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                  dropdownBg={theme.card2}
                  dropdownBorder={theme.border}
                  textColor={theme.text}
                  dimColor={theme.dim}
                  hoverBg={theme.card}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: theme.dim, marginBottom: 6, display: 'block' }}>
                  {'\u041c\u043e\u0434\u0435\u043b\u044c'}
                </label>
                <input
                  style={{
                    width: '100%', padding: '14px 16px', background: theme.card2,
                    border: '1px solid ' + theme.border, borderRadius: 12,
                    color: theme.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                  placeholder={'FH, Actros, 5490'}
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: theme.dim, marginBottom: 6, display: 'block' }}>
                  {'\u041f\u0440\u043e\u0431\u0435\u0433, \u043a\u043c'}
                </label>
                <input
                  style={{
                    width: '100%', padding: '14px 16px', background: theme.card2,
                    border: '1px solid ' + theme.border, borderRadius: 12,
                    color: theme.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                  type="number"
                  placeholder="500000"
                  value={vehicleForm.mileage}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: theme.dim, marginBottom: 6, display: 'block' }}>
                  {'\u0413\u043e\u0441\u043d\u043e\u043c\u0435\u0440 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)'}
                </label>
                <input
                  style={{
                    width: '100%', padding: '14px 16px', background: theme.card2,
                    border: '1px solid ' + theme.border, borderRadius: 12,
                    color: theme.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                  placeholder={'\u0410123\u0411\u0412 77'}
                  value={vehicleForm.plate}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: theme.dim, marginBottom: 6, display: 'block' }}>
                  {'\u0420\u0430\u0441\u0445\u043e\u0434, \u043b/100\u043a\u043c: '}{vehicleForm.consumption}
                </label>
                <input
                  type="range" min={20} max={50}
                  value={vehicleForm.consumption}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, consumption: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#f59e0b' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.dim }}>
                  <span>20</span><span>50</span>
                </div>
              </div>
            </div>
            {vehicleError && (
              <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', margin: '12px 0 0' }}>{vehicleError}</p>
            )}
            <button
              disabled={!vehicleForm.brand || !vehicleForm.model || !vehicleForm.mileage || vehicleSaving}
              onClick={handleSaveVehicle}
              style={{
                width: '100%', padding: '16px', marginTop: 20,
                background: (vehicleForm.brand && vehicleForm.model && vehicleForm.mileage && !vehicleSaving)
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#1e2a3f',
                border: 'none', borderRadius: 14, color: '#fff', fontSize: 17,
                fontWeight: 700, cursor: (vehicleForm.brand && vehicleForm.model && vehicleForm.mileage && !vehicleSaving) ? 'pointer' : 'not-allowed',
              }}
            >
              {vehicleSaving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
            </button>
            <button
              onClick={() => setShowAddVehicle(false)}
              style={{
                width: '100%', padding: '14px', marginTop: 8,
                background: 'transparent', border: 'none',
                color: theme.dim, fontSize: 15, cursor: 'pointer',
              }}
            >
              {'\u041e\u0442\u043c\u0435\u043d\u0430'}
            </button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, paddingBottom: 64, overflow: 'auto' }}>
        {userRole !== 'job_seeker' && (
          <VehicleSwitcher
            userId={userId}
            profile={profile}
            activeVehicleId={activeVehicleId}
            onSelect={setActiveVehicleId}
            onAddVehicle={() => setShowProfile(true)}
          />
        )}
        {renderTab()}
      </div>
      {userRole !== 'job_seeker' && (
        <>
          <FAB onClick={() => setIsModalOpen(true)} />
          <AddModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            userId={userId}
            activeTab={activeTab}
            activeVehicleId={vehicleId}
            onFuelSaved={handleFuelSaved}
            onTripSaved={handleTripSaved}
            onBytSaved={handleBytSaved}
            onServiceSaved={handleServiceSaved}
            onVehicleExpenseSaved={handleVehicleExpenseSaved}
          />
        </>
      )}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} role={userRole} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppInner />
      </LanguageProvider>
    </ThemeProvider>
  )
}
