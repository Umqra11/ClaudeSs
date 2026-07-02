import { useCallback, useEffect, useState } from 'react'
import { db, type UserProfile } from '../services/db'

export type AuthStatus = 'loading' | 'welcome' | 'ready'

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<UserProfile | null>(null)

  // Açılışta kalıcı oturumu çöz (Firebase Auth veya localStorage).
  useEffect(() => {
    let cancelled = false
    db.resolveSession()
      .then((profile) => {
        if (cancelled) return
        setUser(profile)
        setStatus(profile ? 'ready' : 'welcome')
      })
      .catch(() => {
        if (!cancelled) setStatus('welcome')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const register = useCallback(async (name: string) => {
    const profile = await db.register(name)
    setUser(profile)
    setStatus('ready')
  }, [])

  return { status, user, register }
}
