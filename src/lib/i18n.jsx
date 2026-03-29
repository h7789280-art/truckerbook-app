import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const translations = {
  ru: {
    tabs: {
      overview: '\u041e\u0431\u0437\u043e\u0440',
      fuel: '\u0422\u043e\u043f\u043b\u0438\u0432\u043e',
      byt: '\u0411\u044b\u0442',
      trips: '\u0420\u0435\u0439\u0441\u044b',
      service: '\u0421\u0435\u0440\u0432\u0438\u0441',
      jobs: '\u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438',
      news: '\u041d\u043e\u0432\u043e\u0441\u0442\u0438',
      marketplace: '\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441',
    },
    greeting: {
      morning: '\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e',
      afternoon: '\u0414\u043e\u0431\u0440\u044b\u0439 \u0434\u0435\u043d\u044c',
      evening: '\u0414\u043e\u0431\u0440\u044b\u0439 \u0432\u0435\u0447\u0435\u0440',
      night: '\u0414\u043e\u0431\u0440\u043e\u0439 \u043d\u043e\u0447\u0438',
    },
    common: {
      save: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c',
      cancel: '\u041e\u0442\u043c\u0435\u043d\u0430',
      delete: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c',
      add: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c',
      edit: '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c',
      back: '\u041d\u0430\u0437\u0430\u0434',
      next: '\u0414\u0430\u043b\u0435\u0435',
      loading: '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...',
      noData: '\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445',
      saving: '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...',
      error: '\u041e\u0448\u0438\u0431\u043a\u0430',
      profile: '\u041f\u0440\u043e\u0444\u0438\u043b\u044c',
      language: '\u042f\u0437\u044b\u043a',
    },
    auth: {
      phone: '\u0422\u0435\u043b\u0435\u0444\u043e\u043d',
      code: '\u041a\u043e\u0434 \u0438\u0437 SMS',
      enter: '\u0412\u043e\u0439\u0442\u0438',
      getCode: '\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043a\u043e\u0434',
      createPin: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c PIN',
      repeatPin: '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 PIN',
      wrongPin: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 PIN',
    },
    roles: {
      driver: '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c',
      company: '\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f',
      jobSeeker: '\u0418\u0449\u0443 \u0440\u0430\u0431\u043e\u0442\u0443',
      driverDesc: '\u0415\u0441\u0442\u044c \u043c\u0430\u0448\u0438\u043d\u0430, \u0432\u0435\u0434\u0443 \u0443\u0447\u0451\u0442',
      companyDesc: '\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u044e \u043f\u0430\u0440\u043a\u043e\u043c \u043c\u0430\u0448\u0438\u043d',
      jobSeekerDesc: '\u041d\u0443\u0436\u043d\u0430 \u0440\u0430\u0431\u043e\u0442\u0430 \u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u043c',
    },
    fuel: {
      addFuel: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u0430\u0432\u043a\u0443',
      liters: '\u041b\u0438\u0442\u0440\u044b',
      price: '\u0426\u0435\u043d\u0430',
      station: '\u0410\u0417\u0421',
      total: '\u0418\u0442\u043e\u0433\u043e',
      thisMonth: '\u0417\u0430 \u043c\u0435\u0441\u044f\u0446',
    },
    trips: {
      addTrip: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0440\u0435\u0439\u0441',
      from: '\u041e\u0442\u043a\u0443\u0434\u0430',
      to: '\u041a\u0443\u0434\u0430',
      distance: '\u0420\u0430\u0441\u0441\u0442\u043e\u044f\u043d\u0438\u0435',
      income: '\u0414\u043e\u0445\u043e\u0434',
    },
    shifts: {
      startShift: '\u041d\u0430\u0447\u0430\u0442\u044c \u0441\u043c\u0435\u043d\u0443',
      endShift: '\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c \u0441\u043c\u0435\u043d\u0443',
      odometer: '\u041e\u0434\u043e\u043c\u0435\u0442\u0440',
      duration: '\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
    },
    paywall: {
      trialEnded: '\u0412\u0430\u0448 \u043f\u0440\u043e\u0431\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434 \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u043b\u0441\u044f',
      dataSaved: '\u0412\u0430\u0448\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b \u0438 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b',
      monthly: '\u043c\u0435\u0441',
      yearly: '\u0433\u043e\u0434',
      discount: '\u0441\u043a\u0438\u0434\u043a\u0430',
      continue: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0437\u0430',
    },
    vehicle: {
      addVehicle: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043c\u0430\u0448\u0438\u043d\u0443',
      brand: '\u041c\u0430\u0440\u043a\u0430',
      model: '\u041c\u043e\u0434\u0435\u043b\u044c',
      mileage: '\u041f\u0440\u043e\u0431\u0435\u0433, \u043a\u043c',
      plate: '\u0413\u043e\u0441\u043d\u043e\u043c\u0435\u0440',
      consumption: '\u0420\u0430\u0441\u0445\u043e\u0434, \u043b/100\u043a\u043c',
    },
    offline: {
      noConnection: '\u041d\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f. \u0414\u0430\u043d\u043d\u044b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e.',
      synced: '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e.',
    },
    locked: {
      title: '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043f\u043e\u0441\u043b\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043c\u0430\u0448\u0438\u043d\u044b',
      addVehiclePrompt: '\u0423\u0441\u0442\u0440\u043e\u0438\u043b\u0438\u0441\u044c \u043d\u0430 \u0440\u0430\u0431\u043e\u0442\u0443? \u2192 \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043c\u0430\u0448\u0438\u043d\u0443',
    },
    welcome: {
      title: '\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c!',
      trialInfo: '\u0423 \u0432\u0430\u0441 7 \u0434\u043d\u0435\u0439 Pro-\u0434\u043e\u0441\u0442\u0443\u043f\u0430',
    },
    jobSeekerStubs: {
      jobs: '\u0412\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u2014 \u0441\u043a\u043e\u0440\u043e',
      news: '\u041d\u043e\u0432\u043e\u0441\u0442\u0438 \u2014 \u0441\u043a\u043e\u0440\u043e',
      marketplace: '\u041c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441 \u2014 \u0441\u043a\u043e\u0440\u043e',
      comingSoon: '\u0421\u043a\u043e\u0440\u043e',
    },
    logout: {
      button: '\u0412\u044b\u0439\u0442\u0438',
      loading: '\u0412\u044b\u0445\u043e\u0434...',
    },
  },
  en: {
    tabs: {
      overview: 'Overview',
      fuel: 'Fuel',
      byt: 'Living',
      trips: 'Trips',
      service: 'Service',
      jobs: 'Jobs',
      news: 'News',
      marketplace: 'Marketplace',
    },
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
      night: 'Good night',
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      add: 'Add',
      edit: 'Edit',
      back: 'Back',
      next: 'Next',
      loading: 'Loading...',
      noData: 'No data',
      saving: 'Saving...',
      error: 'Error',
      profile: 'Profile',
      language: 'Language',
    },
    auth: {
      phone: 'Phone',
      code: 'SMS code',
      enter: 'Sign in',
      getCode: 'Get code',
      createPin: 'Create PIN',
      repeatPin: 'Repeat PIN',
      wrongPin: 'Wrong PIN',
    },
    roles: {
      driver: 'Driver',
      company: 'Company',
      jobSeeker: 'Looking for work',
      driverDesc: 'I have a truck, tracking expenses',
      companyDesc: 'Managing a fleet',
      jobSeekerDesc: 'Looking for a driving job',
    },
    fuel: {
      addFuel: 'Add refueling',
      liters: 'Liters',
      price: 'Price',
      station: 'Gas station',
      total: 'Total',
      thisMonth: 'This month',
    },
    trips: {
      addTrip: 'Add trip',
      from: 'From',
      to: 'To',
      distance: 'Distance',
      income: 'Income',
    },
    shifts: {
      startShift: 'Start shift',
      endShift: 'End shift',
      odometer: 'Odometer',
      duration: 'Duration',
    },
    paywall: {
      trialEnded: 'Your trial period has ended',
      dataSaved: 'Your data is saved and will be available after payment',
      monthly: 'mo',
      yearly: 'yr',
      discount: 'discount',
      continue: 'Continue for',
    },
    vehicle: {
      addVehicle: 'Add vehicle',
      brand: 'Brand',
      model: 'Model',
      mileage: 'Mileage, km',
      plate: 'Plate number',
      consumption: 'Consumption, l/100km',
    },
    offline: {
      noConnection: 'No connection. Data is saved locally.',
      synced: 'Connection restored.',
    },
    locked: {
      title: 'Available after vehicle registration',
      addVehiclePrompt: 'Got a job? \u2192 Add vehicle',
    },
    welcome: {
      title: 'Welcome!',
      trialInfo: 'You have 7 days of Pro access',
    },
    jobSeekerStubs: {
      jobs: 'Jobs \u2014 coming soon',
      news: 'News \u2014 coming soon',
      marketplace: 'Marketplace \u2014 coming soon',
      comingSoon: 'Coming soon',
    },
    logout: {
      button: 'Sign out',
      loading: 'Signing out...',
    },
  },
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
}

function detectLanguage() {
  const saved = localStorage.getItem('truckerbook_lang')
  if (saved && translations[saved]) return saved
  const nav = navigator.language || navigator.userLanguage || 'en'
  return nav.startsWith('ru') ? 'ru' : 'en'
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectLanguage)

  const setLang = useCallback((newLang) => {
    if (translations[newLang]) {
      setLangState(newLang)
      localStorage.setItem('truckerbook_lang', newLang)
    }
  }, [])

  const t = useCallback((key) => {
    const value = getNestedValue(translations[lang], key)
    if (value !== undefined) return value
    const fallback = getNestedValue(translations.en, key)
    if (fallback !== undefined) return fallback
    return key
  }, [lang])

  const value = useMemo(() => ({ t, lang, setLang }), [t, lang, setLang])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

export { translations }
export default translations
