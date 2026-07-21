import { describe, expect, it } from 'vitest'
import { getWeekId, previousWeekId, splitIntervalByDay } from './week'
import { recordSessionDays, weekTotalFromDays } from './stats'
import { emptyProfile } from '../services/shared'

// Kullanıcı senaryosu: Salı 00:00 sınırını KESEN bir seans, sıfırlanmada
// saat kaybetmemeli. Mimari: haftalık toplam `days`'ten TÜRETİLİR ve seans
// gün sınırlarında bölünür → Pazartesi payı önceki haftaya, Salı payı yeni
// haftaya doğru yazılır; toplam korunur.

describe('Salı 00:00 sınırını kesen seans — saat kaybı YOK', () => {
  // 2026-06-30 bir Salı. Seans: Pazartesi 23:00 → Salı 01:00 (Istanbul), 2 saat.
  const startMs = new Date('2026-06-29T23:00:00+03:00').getTime()
  const endMs = new Date('2026-06-30T01:00:00+03:00').getTime()

  it('seans gün sınırında ikiye bölünür (Pzt 1s + Salı 1s)', () => {
    const parts = splitIntervalByDay(startMs, endMs)
    const map = Object.fromEntries(parts.map((p) => [p.dayId, p.sec]))
    expect(map['2026-06-29']).toBe(3600) // Pazartesi payı
    expect(map['2026-06-30']).toBe(3600) // Salı payı
    // Toplam korunur — hiçbir saniye kaybolmaz
    const total = parts.reduce((a, p) => a + p.sec, 0)
    expect(total).toBe(7200)
  })

  it('haftalık toplam doğru haftaya yazılır (kayıp değil, doğru atıf)', () => {
    const user = emptyProfile('boundary', 'Test')
    const perDay: Record<string, number> = {}
    for (const { dayId, sec } of splitIntervalByDay(startMs, endMs)) {
      perDay[dayId] = (perDay[dayId] ?? 0) + sec
    }
    const stats = recordSessionDays(user, perDay)

    const thisWeek = getWeekId(new Date('2026-06-30T12:00:00+03:00')) // 2026-06-30
    const lastWeek = previousWeekId(thisWeek) // 2026-06-23

    // Salı payı YENİ haftada, Pazartesi payı ÖNCEKİ haftada — ikisi de duruyor
    expect(weekTotalFromDays(stats.days, thisWeek)).toBe(3600)
    expect(weekTotalFromDays(stats.days, lastWeek)).toBe(3600)
    // Tüm zamanlar: iki saat de korunur
    expect(stats.allTimeSec).toBe(7200)
  })

  it('sıfırlanma = doğru düşme değil kayıp: yeni hafta yalnız Salı payını gösterir', () => {
    // Önceki haftanın 20 saati + sınırı kesen seansın Salı payı
    const user = {
      ...emptyProfile('reset', 'Test'),
      days: { '2026-06-28': 20 * 3600 }, // önceki hafta (Pazar)
      allTimeSec: 20 * 3600, // days ile birlikte birikmişti
    }
    const stats = recordSessionDays(user, { '2026-06-30': 3600 }) // yeni hafta (Salı)
    const thisWeek = '2026-06-30'
    // Yeni haftada 20 saat "kaybolmaz" — önceki haftaya aittir, days'te durur.
    expect(weekTotalFromDays(stats.days, thisWeek)).toBe(3600)
    expect(weekTotalFromDays(stats.days, previousWeekId(thisWeek))).toBe(20 * 3600)
    // Toplam hiçbir zaman düşmez
    expect(stats.allTimeSec).toBeGreaterThanOrEqual(20 * 3600)
  })
})
