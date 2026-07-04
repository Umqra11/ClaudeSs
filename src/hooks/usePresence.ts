// ============================================================
// "Son görülme" (WhatsApp benzeri) — presence katmanı.
//
// useTimer'ın start/pause/resume/stop yazımlarından BAĞIMSIZDIR:
// bu yalnızca "uygulama en son ne zaman kullanıldı"yı izler, kronometre
// durumundan bağımsız olarak tüm kullanıcılar için çalışır.
//
// Güncelleme anları: mount, sekme görünür/gizli geçişleri (uygulamaya
// dönüş/ayrılış — WhatsApp'ın "son görülme"si tam olarak budur) ve
// görünürken periyodik (uzun süre açık kalan sekme için).
// ============================================================

import { useEffect } from 'react'
import { db } from '../services/db'

const HEARTBEAT_MS = 120_000

export function usePresence(uid: string): void {
  useEffect(() => {
    const touch = () => {
      void db.updateUser(uid, { lastSeenAt: Date.now() }).catch(() => {})
    }

    touch()

    const onVisibility = () => touch()
    document.addEventListener('visibilitychange', onVisibility)

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') touch()
    }, HEARTBEAT_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [uid])
}
