import { useState, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { ThemeProvider, useTheme } from './lib/theme'
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
import VehicleSwitcher from './components/VehicleSwitcher'

function AppInner() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile(userId)
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState('overview')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0)
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0)
  const [bytRefreshKey, setBytRefreshKey] = useState(0)
  const [serviceRefreshKey, setServiceRefreshKey] = useState(0)
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0)
  const [showProfile, setShowProfile] = useState(false)
  const [activeVehicleId, setActiveVehicleId] = useState('main')
  const [pinUnlocked, setPinUnlocked] = useState(false)

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

  const renderTab = () => {
    switch (activeTab) {
      case 'fuel':
        return <Fuel userId={userId} refreshKey={fuelRefreshKey} activeVehicleId={vehicleId} />
      case 'byt':
        return <Byt userId={userId} refreshKey={bytRefreshKey} activeVehicleId={vehicleId} />
      case 'trips':
        return <Trips userId={userId} refreshKey={tripsRefreshKey} activeVehicleId={vehicleId} />
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
      <div style={{ flex: 1, paddingBottom: 64, overflow: 'auto' }}>
        <VehicleSwitcher
          userId={userId}
          profile={profile}
          activeVehicleId={activeVehicleId}
          onSelect={setActiveVehicleId}
          onAddVehicle={() => setShowProfile(true)}
        />
        {renderTab()}
      </div>
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
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
