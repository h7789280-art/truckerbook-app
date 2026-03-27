import { useState, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import Overview from './tabs/Overview'
import Fuel from './tabs/Fuel'
import Byt from './tabs/Byt'
import Trips from './tabs/Trips'
import Service from './tabs/Service'
import BottomNav from './components/BottomNav'
import Auth from './components/Auth'
import FAB from './components/FAB'
import AddModal from './components/AddModal'

export default function App() {
  const { session, loading } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0)

  const handleFuelSaved = useCallback(() => {
    setFuelRefreshKey((k) => k + 1)
  }, [])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0e1a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#64748b',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}
      </div>
    )
  }

  if (!session) {
    return <Auth onComplete={() => {}} />
  }

  const userId = session.user.id

  const renderTab = () => {
    switch (activeTab) {
      case 'fuel':
        return <Fuel userId={userId} refreshKey={fuelRefreshKey} />
      case 'byt':
        return <Byt />
      case 'trips':
        return <Trips />
      case 'service':
        return <Service />
      default:
        return <Overview />
    }
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#0a0e1a',
        color: '#e2e8f0',
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
      />
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
