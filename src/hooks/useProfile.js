import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useProfile(userId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false

    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!cancelled) {
          if (!error && data) setProfile(data)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [userId])

  return { profile, loading }
}
