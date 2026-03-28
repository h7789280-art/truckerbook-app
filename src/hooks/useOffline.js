import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPendingItems,
  updateSyncItem,
  clearSyncedItems,
} from '../lib/offlineDb'

const MAX_RETRIES = 3

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState(null) // null | 'syncing' | 'done' | 'error'
  const [syncedCount, setSyncedCount] = useState(0)
  const syncingRef = useRef(false)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const processSyncQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncStatus('syncing')

    try {
      const pending = await getPendingItems()
      if (pending.length === 0) {
        syncingRef.current = false
        setSyncStatus(null)
        return
      }

      let successCount = 0

      for (const item of pending) {
        try {
          if (item.action === 'insert') {
            const { error } = await supabase
              .from(item.table)
              .insert(item.data)
            if (error) throw error
          } else if (item.action === 'update') {
            const { id: rowId, ...rest } = item.data
            const { error } = await supabase
              .from(item.table)
              .update(rest)
              .eq('id', rowId)
            if (error) throw error
          } else if (item.action === 'delete') {
            const { error } = await supabase
              .from(item.table)
              .delete()
              .eq('id', item.data.id)
            if (error) throw error
          }
          await updateSyncItem(item.id, { status: 'synced' })
          successCount++
        } catch (err) {
          console.error('Sync error for item', item.id, err)
          const newRetries = (item.retries || 0) + 1
          await updateSyncItem(item.id, {
            retries: newRetries,
            status: newRetries >= MAX_RETRIES ? 'error' : 'pending',
          })
        }
      }

      await clearSyncedItems()
      setSyncedCount(successCount)
      setSyncStatus(successCount > 0 ? 'done' : null)
    } catch (err) {
      console.error('Sync queue processing error:', err)
      setSyncStatus('error')
    } finally {
      syncingRef.current = false
    }
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      processSyncQueue()
    }
  }, [isOnline, processSyncQueue])

  // Clear 'done' status after 3 seconds
  useEffect(() => {
    if (syncStatus === 'done') {
      const timer = setTimeout(() => setSyncStatus(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [syncStatus])

  return { isOnline, syncStatus, syncedCount, processSyncQueue }
}
