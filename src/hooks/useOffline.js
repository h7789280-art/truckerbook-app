// Offline queue hook
import { useState } from 'react'

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  return { isOnline }
}
