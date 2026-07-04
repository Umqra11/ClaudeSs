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
import { getDayId, splitIntervalByDay } from './week'

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

/** useTimer'ın sakladığı seans durumu (kpss.timer ile aynı biçim). */
export interface SessionLike {
  status?: string
  startedAt?: number | null // koşan parçanın başlangıcı
  accumulatedSec?: number // duraklamalarda biriken süre
  lastAccumAt?: number | null // son birikimin anı
  sessionStartMs?: number | null // seansın ilk başlama anı
}

/**
 * Bir seansın süresini Istanbul günlerine dağıtır (gece 00:00'da
 * otomatik bölme): koşan parça (startedAt→now) gün sınırlarında TAM
 * bölünür; duraklamalarda biriken süre, son birikim anının (yoksa seans
 * başlangıcının) gününe yazılır. → { '2026-07-03': sn, ... }
 */
export function computeSessionDays(
  s: SessionLike,
  now: number,
): Record<string, number> {
  const perDay: Record<string, number> = {}
  const add = (dayId: string, sec: number) => {
    if (sec > 0) perDay[dayId] = (perDay[dayId] ?? 0) + sec
  }

  if (s.status === 'running' && s.startedAt) {
    for (const part of splitIntervalByDay(s.startedAt, now)) {
      add(part.dayId, part.sec)
    }
  }

  const accum = s.accumulatedSec ?? 0
  if (accum > 0) {
    const anchor = s.lastAccumAt ?? s.sessionStartMs ?? now
    add(getDayId(new Date(anchor)), accum)
  }
  return perDay
}

/**
 * Aktif (koşan/duraklatılmış) seansın gün-bazlı canlı dağılımı.
 * localStorage 'kpss.timer' kaydını okur; yoksa/başkasınınsa boş.
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
    if (t.status !== 'running' && t.status !== 'paused') return {}
    return computeSessionDays(t, now)
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
