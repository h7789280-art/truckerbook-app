// Profile hook
import { useState } from 'react'

export function useProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  return { profile, loading }
}
