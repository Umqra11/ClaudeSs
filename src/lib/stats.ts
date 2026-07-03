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
