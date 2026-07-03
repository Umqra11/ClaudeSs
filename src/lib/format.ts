// Süre biçimleyicileri

function pad(n: number): string {
  return String(n).padStart(2, '0')
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
