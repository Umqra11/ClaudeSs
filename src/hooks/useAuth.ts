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

  // Kendi profiline CANLI abonelik: şampiyonluk sayısı gibi başka
  // bileşenlerin (Scoreboard) yazdığı alanlar reload beklemeden tazelenir.
  // Not: useTimer'ın seans/istatistik kaynağı kendi yerel cache'idir
  // (getStats + kpss.timer); bu abonelik yalnızca GÖRÜNÜM tazeler,
  // kronometre durumunu etkilemez.
  const uid = user?.uid ?? null
  useEffect(() => {
    if (!uid) return
    return db.subscribeMembers([uid], (members) => {
      const fresh = members[0]
      if (fresh && fresh.uid === uid) setUser(fresh)
    })
  }, [uid])

  const register = useCallback(async (name: string) => {
    const profile = await db.register(name)
    setUser(profile)
    setStatus('ready')
  }, [])

  return { status, user, register }
}
