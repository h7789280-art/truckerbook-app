const LS_KEY = 'truckerbook_push_permission'
const SHOWN_KEY = 'truckerbook_notif_shown'

function getShownSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function markShown(id) {
  const set = getShownSet()
  set.add(id)
  try {
    const arr = [...set]
    if (arr.length > 100) arr.splice(0, arr.length - 50)
    localStorage.setItem(SHOWN_KEY, JSON.stringify(arr))
  } catch {}
}

function wasShown(id) {
  return getShownSet().has(id)
}

export function isPermissionGranted() {
  try {
    return localStorage.getItem(LS_KEY) === 'granted'
  } catch {
    return false
  }
}

export async function requestPermission() {
  if (!('Notification' in window)) return false
  try {
    const result = await Notification.requestPermission()
    const granted = result === 'granted'
    localStorage.setItem(LS_KEY, granted ? 'granted' : 'denied')
    return granted
  } catch {
    return false
  }
}

export function revokePermission() {
  try {
    localStorage.setItem(LS_KEY, 'denied')
  } catch {}
}

async function send(title, body, tag) {
  if (!isPermissionGranted()) return
  if (Notification.permission !== 'granted') return
  const opts = { body, icon: '/icons/icon-192.png', tag }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && reg.showNotification) {
        await reg.showNotification(title, opts)
        return
      }
    }
  } catch {}

  try {
    new Notification(title, opts)
  } catch {}
}

export function sendNotification(title, body, tag) {
  send(title, body, tag || 'truckerbook')
}

export function scheduleHOSWarning(minutesLeft, t) {
  const tag = 'hos-' + minutesLeft
  if (wasShown(tag)) return
  markShown(tag)
  const title = t ? t('notifications.hosWarningTitle') : 'HOS'
  const body = t
    ? t('notifications.hosWarning').replace('{minutes}', String(minutesLeft))
    : `${minutesLeft} min left until HOS limit`
  send(title, body, tag)
}

export function scheduleMaintenanceReminder(vehicleName, serviceType, t) {
  const tag = 'maint-' + (vehicleName || '') + '-' + (serviceType || '')
  const today = new Date().toISOString().slice(0, 10)
  const dailyTag = tag + '-' + today
  if (wasShown(dailyTag)) return
  markShown(dailyTag)
  const title = t ? t('notifications.maintenanceTitle') : '\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435'
  const body = t
    ? t('notifications.maintenance').replace('{vehicle}', vehicleName || '').replace('{type}', serviceType || '')
    : `Maintenance reminder: ${serviceType || 'service'} for ${vehicleName || 'vehicle'}`
  send(title, body, dailyTag)
}

export function scheduleTrialExpiry(daysLeft, t) {
  const today = new Date().toISOString().slice(0, 10)
  const tag = 'trial-' + today
  if (wasShown(tag)) return
  markShown(tag)
  const title = t ? t('notifications.trialExpiryTitle') : 'TruckerBook Pro'
  const body = t
    ? t('notifications.trialExpiry').replace('{days}', String(daysLeft))
    : `Pro access: ${daysLeft} days left`
  send(title, body, tag)
}
