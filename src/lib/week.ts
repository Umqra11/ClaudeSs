// ============================================================
// Hafta anahtarı (weekId) hesabı — Salı 00:00, Europe/Istanbul
//
// Sunucuda zamanlanmış görev yok: haftalık toplam weekId ile
// saklanır; yeni haftada anahtar değişince toplam 0'dan başlar.
// Tüm hesaplar Intl.DateTimeFormat ile Istanbul duvar saatine
// çevrilerek yapılır — cihazın saat diliminden bağımsızdır.
// ============================================================

const ISTANBUL = 'Europe/Istanbul'
const DAY_MS = 86_400_000

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: ISTANBUL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  weekday: 'short',
})

interface WallClock {
  y: number
  m: number
  d: number
  hh: number
  mm: number
  ss: number
  weekday: number
}

/** Verilen anın Istanbul duvar saatini döndürür. */
function istanbulWall(date: Date): WallClock {
  const parts = dtf.formatToParts(date)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '0'
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    hh: Number(get('hour')) % 24, // bazı ortamlar geceyarısını "24" verir
    mm: Number(get('minute')),
    ss: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  }
}

/**
 * Istanbul duvar saatine göre verilen takvim gününün 00:00 anının
 * UTC epoch ms karşılığı. (TR 2016'dan beri sabit UTC+3; yine de
 * ofset Intl üzerinden hesaplanır, sabite güvenilmez.)
 */
function istanbulMidnightUtc(y: number, m: number, d: number): number {
  let ts = Date.UTC(y, m - 1, d)
  for (let i = 0; i < 2; i++) {
    const w = istanbulWall(new Date(ts))
    const wallAsUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss)
    const offset = wallAsUtc - ts
    ts = Date.UTC(y, m - 1, d) - offset
  }
  return ts
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Hafta anahtarı: verilen ana göre Istanbul saatiyle en son
 * Salı 00:00'ın tarihi, "2026-06-30" biçiminde.
 */
export function getWeekId(date: Date = new Date()): string {
  const w = istanbulWall(date)
  const daysBack = (w.weekday - 2 + 7) % 7 // Salı = 2
  const t = Date.UTC(w.y, w.m - 1, w.d) - daysBack * DAY_MS
  const day = new Date(t)
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
}

/** weekId'nin başlangıç anı (o Salı 00:00 Istanbul) — UTC epoch ms. */
export function weekStartMs(weekId: string): number {
  const [y, m, d] = weekId.split('-').map(Number)
  return istanbulMidnightUtc(y, m, d)
}

/** Bir sonraki sıfırlanma anı (gelecek Salı 00:00 Istanbul) — UTC epoch ms. */
export function nextResetAt(date: Date = new Date()): number {
  const start = weekStartMs(getWeekId(date))
  const w = istanbulWall(new Date(start))
  const t = Date.UTC(w.y, w.m - 1, w.d) + 7 * DAY_MS
  const day = new Date(t)
  return istanbulMidnightUtc(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
  )
}
