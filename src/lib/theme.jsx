import { createContext, useContext, useState, useEffect } from 'react'

const THEMES = {
  dark: {
    bg: '#0a0e1a',
    card: '#111827',
    card2: '#1a2235',
    border: '#1e2a3f',
    text: '#e2e8f0',
    dim: '#64748b',
    navBg: '#111827',
  },
  light: {
    bg: '#f5f5f0',
    card: '#ffffff',
    card2: '#f0ede8',
    border: '#e0dcd5',
    text: '#1a1a1a',
    dim: '#8a8070',
    navBg: '#ffffff',
  },
  red_night: {
    bg: '#000000',
    card: '#0a0000',
    card2: '#120000',
    border: '#1a0000',
    text: '#cc0000',
    dim: '#660000',
    navBg: '#0a0000',
  },
}

function getAutoThemeKey() {
  const h = new Date().getHours()
  return (h >= 6 && h < 20) ? 'light' : 'dark'
}

function resolveTheme(mode) {
  if (mode === 'auto') return THEMES[getAutoThemeKey()]
  return THEMES[mode] || THEMES.dark
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('tb_theme') || 'dark' } catch { return 'dark' }
  })
  const [, setTick] = useState(0)

  const theme = resolveTheme(mode)

  useEffect(() => {
    try { localStorage.setItem('tb_theme', mode) } catch {}
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--bg', theme.bg)
    root.style.setProperty('--card', theme.card)
    root.style.setProperty('--card2', theme.card2)
    root.style.setProperty('--border', theme.border)
    root.style.setProperty('--text', theme.text)
    root.style.setProperty('--dim', theme.dim)
    root.style.setProperty('--nav-bg', theme.navBg)
    document.body.style.background = theme.bg
    document.body.style.color = theme.text
  }, [theme])

  useEffect(() => {
    if (mode !== 'auto') return
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
