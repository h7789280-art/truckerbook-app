import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { useOffline } from './hooks/useOffline'
import { ThemeProvider, useTheme } from './lib/theme'
import { LanguageProvider, useLanguage, applyCountryDefaults } from './lib/i18n'
import { supabase } from './lib/supabase'
import Overview from './tabs/Overview'
import Expenses from './tabs/Expenses'
import Trips from './tabs/Trips'
import Service, { DocsTab } from './tabs/Service'
import Jobs from './tabs/Jobs'
import News from './tabs/News'
import Marketplace from './tabs/Marketplace'
import FinanceDetails from './tabs/FinanceDetails'
import TripsDetails from './tabs/TripsDetails'
import Reports from './tabs/Reports'
import MySalary from './tabs/MySalary'
import BottomNav from './components/BottomNav'
import Auth from './components/Auth'
import PinLock from './components/PinLock'
import FAB from './components/FAB'
import { requestPermission, isPermissionGranted } from './lib/notifications'
import AddModal from './components/AddModal'
import SmartScan from './components/SmartScan'
import ProfileScreen from './components/ProfileScreen'
import Paywall from './components/Paywall'
import VehicleSwitcher from './components/VehicleSwitcher'
import BrandComboBox from './components/BrandComboBox'
import DriverChat, { useChatUnread } from './components/DriverChat'
import InviteFlow from './components/InviteFlow'

const WELCOME_COUNTRIES = [
  { value: 'RU', flag: '\uD83C\uDDF7\uD83C\uDDFA', label: '\u0420\u043E\u0441\u0441\u0438\u044F' },
  { value: 'US', flag: '\uD83C\uDDFA\uD83C\uDDF8', label: 'USA' },
  { value: 'UA', flag: '\uD83C\uDDFA\uD83C\uDDE6', label: '\u0423\u043A\u0440\u0430\u0457\u043D\u0430' },
  { value: 'BY', flag: '\uD83C\uDDE7\uD83C\uDDFE', label: '\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u044C' },
  { value: 'KZ', flag: '\uD83C\uDDF0\uD83C\uDDFF', label: '\u041A\u0430\u0437\u0430\u0445\u0441\u0442\u0430\u043D' },
  { value: 'UZ', flag: '\uD83C\uDDFA\uD83C\uDDFF', label: '\u0423\u0437\u0431\u0435\u043A\u0438\u0441\u0442\u0430\u043D' },
  { value: 'DE', flag: '\uD83C\uDDE9\uD83C\uDDEA', label: 'Deutschland' },
  { value: 'FR', flag: '\uD83C\uDDEB\uD83C\uDDF7', label: 'France' },
  { value: 'ES', flag: '\uD83C\uDDEA\uD83C\uDDF8', label: 'Espa\u00F1a' },
  { value: 'TR', flag: '\uD83C\uDDF9\uD83C\uDDF7', label: 'T\u00FCrkiye' },
  { value: 'PL', flag: '\uD83C\uDDF5\uD83C\uDDF1', label: 'Polska' },
]

const WELCOME_LANGUAGES = [
  { value: 'ru', flag: '\uD83C\uDDF7\uD83C\uDDFA', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439' },
  { value: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8', label: 'English' },
  { value: 'uk', flag: '\uD83C\uDDFA\uD83C\uDDE6', label: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430' },
  { value: 'es', flag: '\uD83C\uDDEA\uD83C\uDDF8', label: 'Espa\u00F1ol' },
  { value: 'de', flag: '\uD83C\uDDE9\uD83C\uDDEA', label: 'Deutsch' },
  { value: 'fr', flag: '\uD83C\uDDEB\uD83C\uDDF7', label: 'Fran\u00E7ais' },
  { value: 'tr', flag: '\uD83C\uDDF9\uD83C\uDDF7', label: 'T\u00FCrk\u00E7e' },
  { value: 'pl', flag: '\uD83C\uDDF5\uD83C\uDDF1', label: 'Polski' },
]

const LANG_TO_COUNTRY = { ru: 'RU', en: 'US', uk: 'UA', de: 'DE', fr: 'FR', es: 'ES', tr: 'TR', pl: 'PL' }

const CONTINUE_LABELS = {
  ru: '\u0414\u0430\u043B\u0435\u0435',
  en: 'Continue',
  uk: '\u0414\u0430\u043B\u0456',
  es: 'Continuar',
  de: 'Weiter',
  fr: 'Continuer',
  tr: 'Devam',
  pl: 'Dalej',
}

function detectBrowserLang() {
  try {
    const nav = (navigator.language || '').toLowerCase().split('-')[0]
    if (['ru', 'en', 'uk', 'es', 'de', 'fr', 'tr', 'pl'].includes(nav)) return nav
  } catch {}
  return 'en'
}

function WelcomeSetup({ onComplete }) {
  const detectedLang = detectBrowserLang()
  const [selectedLang, setSelectedLang] = useState(detectedLang)
  const [selectedCountry, setSelectedCountry] = useState(LANG_TO_COUNTRY[detectedLang] || 'US')

  const handleContinue = () => {
    try {
      localStorage.setItem('truckerbook_lang', selectedLang)
      localStorage.setItem('truckerbook_country', selectedCountry)
    } catch {}
    applyCountryDefaults(selectedCountry)
    onComplete(selectedLang)
  }

  const selectStyle = {
    width: '100%',
    padding: '14px 16px',
    background: '#111827',
    border: '1px solid #1e2a3f',
    borderRadius: 12,
    color: '#e2e8f0',
    fontSize: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 360,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{'\uD83D\uDE9B'}</div>
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          color: '#e2e8f0',
          margin: '0 0 4px',
        }}>TruckerBook</h1>
        <p style={{
          fontSize: 14,
          color: '#64748b',
          margin: '0 0 32px',
        }}>Trucker accounting app</p>

        <div style={{ textAlign: 'left', marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#64748b', marginBottom: 6, display: 'block' }}>
            {'\uD83C\uDF0D'} Country / {'\u0421\u0442\u0440\u0430\u043D\u0430'}
          </label>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            style={selectStyle}
          >
            {WELCOME_COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>{c.flag + ' ' + c.label}</option>
            ))}
          </select>
        </div>

        <div style={{ textAlign: 'left', marginBottom: 32 }}>
          <label style={{ fontSize: 13, color: '#64748b', marginBottom: 6, display: 'block' }}>
            {'\uD83D\uDDE3\uFE0F'} Language / {'\u042F\u0437\u044B\u043A'}
          </label>
          <select
            value={selectedLang}
            onChange={(e) => {
              const newLang = e.target.value
              setSelectedLang(newLang)
              if (LANG_TO_COUNTRY[newLang]) setSelectedCountry(LANG_TO_COUNTRY[newLang])
            }}
            style={selectStyle}
          >
            {WELCOME_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.flag + ' ' + l.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleContinue}
          style={{
            width: '100%',
            padding: 16,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: 'none',
            borderRadius: 14,
            color: '#fff',
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {CONTINUE_LABELS[selectedLang] || 'Continue'}
        </button>
      </div>
    </div>
  )
}

function AppInner() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile(userId)
  const { theme } = useTheme()
  const { t, setLang } = useLanguage()
  const { isOnline, syncStatus, syncedCount } = useOffline()
  const [setupDone, setSetupDone] = useState(() => {
    try { return !!localStorage.getItem('truckerbook_country') } catch { return false }
  })
  const userRole = profile?.role || 'owner_operator'
  const [activeTab, setActiveTab] = useState(userRole === 'job_seeker' ? 'jobs' : 'overview')
  const [navStack, setNavStack] = useState([])
  const isExtraTab = ['jobs', 'news', 'marketplace'].includes(activeTab) && userRole !== 'job_seeker'

  const [expensesInitSubTab, setExpensesInitSubTab] = useState(null)
  const [expensesInitCategory, setExpensesInitCategory] = useState(null)

  const handleExtraTabNav = useCallback((tab) => {
    setNavStack((s) => [...s, activeTab])
    if (tab === 'vehicle_expenses') {
      setExpensesInitSubTab('vehicle')
      setExpensesInitCategory(null)
      setActiveTab('expenses')
    } else if (tab === 'fuel_analytics') {
      setExpensesInitSubTab('vehicle')
      setExpensesInitCategory('fuel')
      setActiveTab('expenses')
    } else if (tab === 'personal_expenses') {
      setExpensesInitSubTab('personal')
      setExpensesInitCategory(null)
      setActiveTab('expenses')
    } else {
      setExpensesInitSubTab(null)
      setExpensesInitCategory(null)
      setActiveTab(tab)
    }
  }, [activeTab])

  const handleBackFromExtra = useCallback(() => {
    setNavStack((s) => {
      if (s.length === 0) {
        setActiveTab('overview')
        return s
      }
      const target = s[s.length - 1]
      setActiveTab(target)
      return s.slice(0, -1)
    })
  }, [])

  const backFromReports = navStack.length > 0 && navStack[navStack.length - 1] === 'reports'
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0)
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0)
  const [bytRefreshKey, setBytRefreshKey] = useState(0)
  const [serviceRefreshKey, setServiceRefreshKey] = useState(0)
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0)
  const [expensesSubTab, setExpensesSubTab] = useState('vehicle')
  const [showProfile, setShowProfile] = useState(false)
  const [activeVehicleId, setActiveVehicleId] = useState('main')
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({ brand: '', model: '', mileage: '', plate: '', consumption: 34 })
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [vehicleError, setVehicleError] = useState('')
  const [showWelcome, setShowWelcome] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showFabMenu, setShowFabMenu] = useState(false)
  const [showSmartScan, setShowSmartScan] = useState(false)
  const { unread: chatUnread, resetUnread: resetChatUnread } = useChatUnread()

  useEffect(() => {
    if (session && pinUnlocked && !isPermissionGranted()) {
      requestPermission()
    }
  }, [session, pinUnlocked])

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

  if (!setupDone) {
    return <WelcomeSetup onComplete={(chosenLang) => {
      setLang(chosenLang)
      setSetupDone(true)
    }} />
  }

  // Check for /invite/:code URL path
  const inviteMatch = window.location.pathname.match(/\/invite\/([a-z0-9]+)/i)
  if (inviteMatch && !session) {
    return (
      <InviteFlow
        inviteCode={inviteMatch[1]}
        onComplete={() => {
          window.history.replaceState(null, '', '/')
          refetchProfile()
        }}
      />
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

  // Deactivated driver block
  if (profile.is_active === false && profile.company_id) {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        padding: '24px',
      }}>
        <div style={{
          background: theme.card,
          borderRadius: '16px',
          padding: '32px 24px',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
          border: '1px solid ' + theme.border,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\ud83d\udeab'}</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: theme.text, marginBottom: '12px' }}>
            {t('overview.accountDeactivated')}
          </div>
        </div>
      </div>
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
          paddingTop: 'env(safe-area-inset-top, 44px)',
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
        role: 'owner_operator',
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
          return <Jobs refreshKey={0} profile={profile} />
        case 'news':
          return <News />
        case 'marketplace':
          return <Marketplace />
        default:
          return <LockedTab />
      }
    }
    switch (activeTab) {
      case 'expenses':
        return <Expenses userId={userId} fuelRefreshKey={fuelRefreshKey} bytRefreshKey={bytRefreshKey} activeVehicleId={vehicleId} userRole={userRole} onSubTabChange={setExpensesSubTab} profile={profile} initialSubTab={expensesInitSubTab} initialCategory={expensesInitCategory} onBack={backFromReports ? handleBackFromExtra : undefined} />
      case 'trips':
        return <Trips userId={userId} refreshKey={tripsRefreshKey} activeVehicleId={vehicleId} profile={profile} onBack={navStack.length > 0 ? handleBackFromExtra : undefined} />
      case 'service':
        return <Service userId={userId} activeVehicleId={vehicleId} refreshKey={serviceRefreshKey} userRole={userRole} profile={profile} />
      case 'documents':
        return <DocsTab userId={userId} vehicleId={vehicleId} userRole={userRole} profile={profile} />
      case 'jobs':
        return <Jobs refreshKey={0} profile={profile} />
      case 'news':
        return <News />
      case 'marketplace':
        return <Marketplace />
      case 'finance':
        return <FinanceDetails userId={userId} profile={profile} onBack={handleBackFromExtra} />
      case 'trips_detail':
        return <TripsDetails userId={userId} profile={profile} onBack={handleBackFromExtra} />
      case 'reports':
        return <Reports userId={userId} profile={profile} onBack={handleBackFromExtra} onNavigate={handleExtraTabNav} />
      case 'my_salary':
        return <MySalary userId={userId} profile={profile} onBack={handleBackFromExtra} onOpenProfile={() => setShowProfile(true)} />

      default:
        return <Overview userName={userName} userId={userId} profile={profile} onOpenProfile={() => setShowProfile(true)} activeVehicleId={vehicleId} refreshKey={overviewRefreshKey} onExtraNav={handleExtraTabNav} userRole={userRole} onOpenSmartScan={() => setShowSmartScan(true)} onOpenAddModal={() => setIsModalOpen(true)} />
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
        paddingTop: 'env(safe-area-inset-top, 44px)',
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
      <div style={{ flex: 1, paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', overflow: 'auto' }}>
        {userRole === 'company' && (
          <VehicleSwitcher
            userId={userId}
            profile={profile}
            activeVehicleId={activeVehicleId}
            onSelect={setActiveVehicleId}
            onAddVehicle={() => setShowProfile(true)}
          />
        )}
        {isExtraTab && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            gap: 12,
          }}>
            <button
              onClick={handleBackFromExtra}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                color: '#f59e0b',
                padding: '4px 0',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {'\u2190 ' + (activeTab === 'jobs' ? '\u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438' : activeTab === 'news' ? '\u041d\u043e\u0432\u043e\u0441\u0442\u0438' : '\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441')}
            </button>
          </div>
        )}
        {renderTab()}
      </div>
      {userRole !== 'job_seeker' && userRole !== 'company' && userRole !== 'driver' && (
        <>
          <FAB onClick={() => setShowFabMenu(true)} />
          {showFabMenu && (
            <div
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }}
              onClick={() => setShowFabMenu(false)}
            >
              <div
                style={{
                  position: 'fixed',
                  bottom: 'calc(72px + env(safe-area-inset-bottom, 0px) + 80px)',
                  right: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  alignItems: 'flex-end',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setShowFabMenu(false); setShowSmartScan(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 18px', borderRadius: 14,
                    background: theme.card, border: '1px solid ' + theme.border,
                    color: theme.text, fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  }}
                >
                  {'\uD83E\uDD16'} {t('smartScan.title')}
                </button>
                <button
                  onClick={() => { setShowFabMenu(false); setIsModalOpen(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 18px', borderRadius: 14,
                    background: theme.card, border: '1px solid ' + theme.border,
                    color: theme.text, fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  }}
                >
                  {'\u270F\uFE0F'} {t('scan.addManually')}
                </button>
              </div>
            </div>
          )}
          <AddModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            userId={userId}
            activeTab={activeTab}
            activeVehicleId={vehicleId}
            profilePlate={profile?.plate_number}
            expensesSubTab={expensesSubTab}
            onFuelSaved={handleFuelSaved}
            onTripSaved={handleTripSaved}
            onBytSaved={handleBytSaved}
            onServiceSaved={handleServiceSaved}
            onVehicleExpenseSaved={handleVehicleExpenseSaved}
          />
          {showSmartScan && (
            <SmartScan
              onClose={() => setShowSmartScan(false)}
              userId={userId}
              vehicleId={vehicleId}
              onSaved={(count) => {
                setShowSmartScan(false)
                setFuelRefreshKey(k => k + 1)
                setBytRefreshKey(k => k + 1)
                setOverviewRefreshKey(k => k + 1)
              }}
              onTripSaved={() => {
                setShowSmartScan(false)
                setTripsRefreshKey(k => k + 1)
                setOverviewRefreshKey(k => k + 1)
              }}
              onServiceSaved={() => {
                setShowSmartScan(false)
                setServiceRefreshKey(k => k + 1)
                setOverviewRefreshKey(k => k + 1)
              }}
            />
          )}
        </>
      )}
      <BottomNav activeTab={activeTab} onTabChange={(tab) => { setExpensesInitSubTab(null); setExpensesInitCategory(null); setNavStack([]); setActiveTab(tab) }} role={userRole} />
      {userRole !== 'job_seeker' && activeTab === 'overview' && showChat && (
        <DriverChat
          userId={userId}
          profile={profile}
          onClose={() => { setShowChat(false); resetChatUnread() }}
        />
      )}
      {userRole !== 'job_seeker' && activeTab === 'overview' && !showChat && (
        <button
          onClick={() => { setShowChat(true); resetChatUnread() }}
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 44px) + 12px)',
            right: 16,
            zIndex: 99,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 22,
            padding: 8,
            lineHeight: 1,
            minWidth: 40,
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'\uD83D\uDCAC'}
          {chatUnread > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: -2,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: '50%',
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}>
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </button>
      )}
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
