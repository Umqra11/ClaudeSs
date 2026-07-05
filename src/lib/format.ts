// Süre biçimleyicileri

import { getDayId } from './week'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const clockFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dayMonthFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'short',
})

/** Saat:dakika (Istanbul), örn. "14:32" — tepki zaman damgaları için. */
export function formatTimeOfDay(ms: number): string {
  return clockFmt.format(new Date(ms))
}

/**
 * "Son görülme" = son çalışma girdisinin (kronometrenin durdurulduğu anın)
 * SAATİ. WhatsApp tarzı, daima saat gösterir: "bugün 14:32", "dün 20:15",
 * "3 Tem 09:10". `lastSeenAt` yoksa (hiç çalışma durdurulmamış/eski hesap)
 * null döner — UI hiçbir şey göstermez.
 */
export function formatLastSeen(
  lastSeenAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (lastSeenAt == null) return null
  const time = formatTimeOfDay(lastSeenAt)
  const todayId = getDayId(new Date(now))
  const seenDayId = getDayId(new Date(lastSeenAt))
  if (seenDayId === todayId) return `bugün ${time}`
  const yesterdayId = getDayId(new Date(now - 86_400_000))
  if (seenDayId === yesterdayId) return `dün ${time}`
  return `${dayMonthFmt.format(new Date(lastSeenAt))} ${time}`
}

/** Kronometre göstergesi: "01:23:45" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** Haftalık toplam: "1s 23dk", saat yoksa "23dk", çok kısaysa "0dk" */
export function formatWeekTotal(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`
}
