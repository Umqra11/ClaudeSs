import { useCallback, useEffect, useState } from 'react'
import { db, type UserProfile } from '../services/db'

export type AuthStatus = 'loading' | 'welcome' | 'ready'

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<UserProfile | null>(null)

  // Açılışta kalıcı oturumu çöz (Firebase Auth veya localStorage).
  // Geçici bir hata (ağ, chunk yüklemesi) kayıtlı kullanıcıyı "yokmuş"
  // gibi göstermesin diye ilk hata sonrası 1,5 sn bekleyip BİR kez daha
  // denenir; ancak ikisi de başarısız olursa Welcome'a düşülür.
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const apply = (profile: UserProfile | null) => {
      if (cancelled) return
      setUser(profile)
      setStatus(profile ? 'ready' : 'welcome')
    }

    db.resolveSession()
      .then(apply)
      .catch(() => {
        if (cancelled) return
        retryTimer = setTimeout(() => {
          db.resolveSession()
            .then(apply)
            .catch(() => {
              if (!cancelled) setStatus('welcome')
            })
        }, 1500)
      })

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const register = useCallback(async (name: string) => {
    const profile = await db.register(name)
    setUser(profile)
    setStatus('ready')
  }, [])

  return { status, user, register }
}
