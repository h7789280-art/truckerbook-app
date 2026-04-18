const KEY = 'truckerbook_nav_highlight'

export function setNavHighlight(payload) {
  try {
    if (!payload) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {}
}

// Returns the pending highlight intent and removes it from storage so it fires only once.
// If `sources` is provided, only matches when payload.source is in the list.
export function consumeNavHighlight(sources) {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data) return null
    if (sources) {
      const list = Array.isArray(sources) ? sources : [sources]
      if (!list.includes(data.source)) return null
    }
    sessionStorage.removeItem(KEY)
    return data
  } catch {
    return null
  }
}

// Given a YYYY-MM-DD date, return the first/last day of that month in the same format.
// Returns null if the input is invalid. Widens single-day highlight into a month so lists
// filtered by timestamps (not just YYYY-MM-DD strings) still include the target.
export function monthRangeForDate(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null
  const firstDay = `${m[1]}-${m[2]}-01`
  const last = new Date(y, mo, 0).getDate()
  const lastDay = `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`
  return { from: firstDay, to: lastDay }
}

// Apply the highlight flash to a DOM element by id. Scrolls into view and adds a temporary class.
export function flashHighlightElement(id, { duration = 2000 } = {}) {
  if (!id) return
  // Wait for render
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.querySelector('[data-highlight-id="' + id + '"]')
      if (!el) return
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {}
      el.classList.add('archive-nav-flash')
      setTimeout(() => {
        el.classList.remove('archive-nav-flash')
      }, duration)
    }, 120)
  })
}
