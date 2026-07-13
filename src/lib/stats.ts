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
import { getWeekId, splitIntervalByDay } from './week'

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

/**
 * Verilen haftaya (Salı 00:00 → ertesi Salı 00:00) düşen günlerin toplamı.
 * `days` (günlük geçmiş) yalnızca artan (monotonik) bir kaynaktır; haftalık
 * toplamı buradan TÜRETMEK, ayrı/bayat/kör-yazılan bir weekTotalSec alanına
 * güvenmekten yapısal olarak daha güvenlidir — hiçbir şekilde düşmez ve
 * hafta devrinde otomatik sıfırlanır (yeni haftada henüz gün yoktur).
 * Her gün tam olarak tek bir haftaya aittir (haftalar gün-hizalı).
 */
export function weekTotalFromDays(
  days: Record<string, number> | undefined,
  weekId: string = getWeekId(),
): number {
  let sum = 0
  for (const [dayId, sec] of Object.entries(days ?? {})) {
    // Öğle (12:00 +03:00) — TZ-güvenli; günün hangi haftaya düştüğünü verir.
    if (getWeekId(new Date(`${dayId}T12:00:00+03:00`)) === weekId) sum += sec
  }
  return Math.floor(sum)
}

/** useTimer'ın sakladığı seans durumu (kpss.timer ile aynı biçim). */
export interface SessionLike {
  status?: string
  startedAt?: number | null // koşan parçanın başlangıcı
}

/**
 * Aktif (yalnızca HÂLÂ KOŞAN) seansın gün-bazlı canlı dağılımı.
 * localStorage 'kpss.timer' kaydını okur; yoksa/başkasınınsa boş.
 *
 * Duraklatılmış bir seansın süresi buraya DAHİL EDİLMEZ: useTimer'ın
 * pause()'u, duraklatılan parçayı ANINDA kalıcı `days`'e işliyor (bkz.
 * settleSegment) — burada da sayılırsa çift sayım olurdu.
 */
export function activeSessionByDay(
  uid: string,
  now: number = Date.now(),
): Record<string, number> {
  try {
    const raw = localStorage.getItem('kpss.timer')
    if (!raw) return {}
    const t = JSON.parse(raw) as SessionLike & { uid?: string }
    if (t.uid !== uid) return {}
    if (t.status !== 'running' || !t.startedAt) return {}
    const perDay: Record<string, number> = {}
    for (const { dayId, sec } of splitIntervalByDay(t.startedAt, now)) {
      perDay[dayId] = (perDay[dayId] ?? 0) + sec
    }
    return perDay
  } catch {
    return {}
  }
}

/** Biten seansın gün-bazlı dağılımını kalıcı istatistiklere işler. */
export function recordSessionDays(
  user: UserProfile,
  perDay: Record<string, number>,
): Stats {
  const s = getStats(user)
  const days = { ...s.days }
  let total = 0
  for (const [dayId, sec] of Object.entries(perDay)) {
    const rounded = Math.round(sec)
    if (rounded <= 0) continue
    days[dayId] = (days[dayId] ?? 0) + rounded
    total += rounded
  }
  if (total > 0) {
    s.days = days
    s.allTimeSec += total
  }
  return s
}

/**
 * Aktif (koşan ya da duraklatılmış) seansın henüz güne İŞLENMEMİŞ
 * toplam süresi (saniye) — gün-bazlı dağılımın toplamı.
 */
export function getActiveSessionSec(uid: string): number {
  const perDay = activeSessionByDay(uid)
  let total = 0
  for (const sec of Object.values(perDay)) total += sec
  return Math.max(0, Math.floor(total))
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
