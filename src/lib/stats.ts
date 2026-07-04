// ============================================================
// Günlük geçmiş + tüm zamanlar toplamı — oturum içi önbellek.
//
// `user` prop'u girişte çekilen anlık görüntüdür; kronometre
// durdukça değişen days/allTimeSec değerleri sekmeler arasında
// (Timer ↔ Profil) taze kalsın diye modül seviyesinde tutulur.
// Kalıcılık backend'dedir (updateUser patch'i); bu yalnızca
// aynı oturumdaki görünüm tutarlılığı içindir.
// ============================================================

import type { UserProfile } from '../services/db'

interface Stats {
  uid: string
  days: Record<string, number>
  allTimeSec: number
}

let cache: Stats | null = null

/** Kullanıcının güncel istatistikleri (önbellek öncelikli). */
export function getStats(user: UserProfile): Stats {
  if (cache && cache.uid === user.uid) return cache
  cache = {
    uid: user.uid,
    days: { ...(user.days ?? {}) },
    allTimeSec: user.allTimeSec ?? 0,
  }
  return cache
}

/** Biten seansı güne ve tüm zamanlar toplamına işler. */
export function recordSession(
  user: UserProfile,
  dayId: string,
  sec: number,
): Stats {
  const s = getStats(user)
  if (sec > 0) {
    s.days = { ...s.days, [dayId]: (s.days[dayId] ?? 0) + sec }
    s.allTimeSec += sec
  }
  return s
}

/**
 * Aktif (koşan ya da duraklatılmış) seansın henüz güne İŞLENMEMİŞ
 * süresi (saniye). useTimer'ın localStorage kaydını ('kpss.timer',
 * aynı biçim) okur; kayıt yoksa/başka kullanıcınınsa 0.
 * Profil sayfası toplamları canlı akıtmak için kullanır.
 */
export function getActiveSessionSec(uid: string): number {
  try {
    const raw = localStorage.getItem('kpss.timer')
    if (!raw) return 0
    const t = JSON.parse(raw) as {
      uid?: string
      status?: string
      startedAt?: number | null
      accumulatedSec?: number
    }
    if (t.uid !== uid) return 0
    if (t.status !== 'running' && t.status !== 'paused') return 0
    const running =
      t.status === 'running' && t.startedAt
        ? (Date.now() - t.startedAt) / 1000
        : 0
    return Math.max(0, Math.floor((t.accumulatedSec ?? 0) + running))
  } catch {
    return 0
  }
}

/** Aktif seans koşuyor mu? (Profil tick'i yalnızca o zaman gerekir.) */
export function isSessionRunning(uid: string): boolean {
  try {
    const raw = localStorage.getItem('kpss.timer')
    if (!raw) return false
    const t = JSON.parse(raw) as { uid?: string; status?: string }
    return t.uid === uid && t.status === 'running'
  } catch {
    return false
  }
}
