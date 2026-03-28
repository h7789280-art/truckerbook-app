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
import FAB from './components/FAB'
import AddModal from './components/AddModal'
import ProfileScreen from './components/ProfileScreen'

function AppInner() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id
  const { profile } = useProfile(userId)
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState('overview')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0)
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0)
  const [bytRefreshKey, setBytRefreshKey] = useState(0)
  const [showProfile, setShowProfile] = useState(false)

  const handleFuelSaved = useCallback(() => {
    setFuelRefreshKey((k) => k + 1)
  }, [])

  const handleTripSaved = useCallback(() => {
    setTripsRefreshKey((k) => k + 1)
  }, [])

  const handleBytSaved = useCallback(() => {
    setBytRefreshKey((k) => k + 1)
  }, [])

  if (authLoading) {
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
    return <Auth onComplete={() => {}} />
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

  const renderTab = () => {
    switch (activeTab) {
      case 'fuel':
        return <Fuel userId={userId} refreshKey={fuelRefreshKey} />
      case 'byt':
        return <Byt userId={userId} refreshKey={bytRefreshKey} />
      case 'trips':
        return <Trips userId={userId} refreshKey={tripsRefreshKey} />
      case 'service':
        return <Service onLogout={() => {}} />
      default:
        return <Overview userName={userName} onOpenProfile={() => setShowProfile(true)} />
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
        {renderTab()}
      </div>
      <FAB onClick={() => setIsModalOpen(true)} />
      <AddModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userId={userId}
        onFuelSaved={handleFuelSaved}
        onTripSaved={handleTripSaved}
        onBytSaved={handleBytSaved}
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
