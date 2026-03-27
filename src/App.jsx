import { useState } from 'react'
import Overview from './tabs/Overview'
import Fuel from './tabs/Fuel'
import Byt from './tabs/Byt'
import Trips from './tabs/Trips'
import Service from './tabs/Service'
import BottomNav from './components/BottomNav'
import Auth from './components/Auth'
import FAB from './components/FAB'
import AddModal from './components/AddModal'

const TABS = {
  overview: Overview,
  fuel: Fuel,
  byt: Byt,
  trips: Trips,
  service: Service,
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (!isLoggedIn) {
    return <Auth onComplete={() => setIsLoggedIn(true)} />
  }

  const ActiveComponent = TABS[activeTab]

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
        <ActiveComponent />
      </div>
      <FAB onClick={() => setIsModalOpen(true)} />
      <AddModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
