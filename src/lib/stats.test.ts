import { describe, expect, it } from 'vitest'
import { getStats, mergeStats, recordSessionDays, weekTotalFromDays } from './stats'
import { emptyProfile } from '../services/shared'

describe('weekTotalFromDays — Salı→Salı penceresi', () => {
  const days = {
    '2026-06-30': 3600, // Salı — bu hafta
    '2026-07-05': 1800, // Pazar — bu hafta
    '2026-06-29': 7200, // Pazartesi — ÖNCEKİ hafta
    '2026-07-07': 999, // Salı — GELECEK hafta
  }

  it('yalnızca verilen haftanın günlerini toplar', () => {
    expect(weekTotalFromDays(days, '2026-06-30')).toBe(5400)
    expect(weekTotalFromDays(days, '2026-06-23')).toBe(7200)
    expect(weekTotalFromDays(days, '2026-07-07')).toBe(999)
  })

  it('boş/eksik days için 0 döner', () => {
    expect(weekTotalFromDays({}, '2026-06-30')).toBe(0)
    expect(weekTotalFromDays(undefined, '2026-06-30')).toBe(0)
  })

  it('monotonik kaynak: bayat weekTotalSec alanından bağımsızdır', () => {
    // days 5 saat diyorsa sonuç 5 saattir — başka alan onu düşüremez.
    expect(weekTotalFromDays({ '2026-06-30': 5 * 3600 }, '2026-06-30')).toBe(
      5 * 3600,
    )
  })
})

describe('recordSessionDays — segment birikimi (getStats cache üzerinden)', () => {
  it('art arda segmentler EKLENİR, üzerine yazılmaz', () => {
    const user = emptyProfile('test-accumulate', 'Test')
    recordSessionDays(user, { '2026-07-06': 100 })
    recordSessionDays(user, { '2026-07-06': 50, '2026-07-07': 25 })
    const s = getStats(user)
    expect(s.days['2026-07-06']).toBe(150)
    expect(s.days['2026-07-07']).toBe(25)
    expect(s.allTimeSec).toBe(175)
  })

  it('sıfır/negatif paylar yok sayılır', () => {
    const user = emptyProfile('test-zero', 'Test')
    recordSessionDays(user, { '2026-07-06': 0 })
    expect(getStats(user).allTimeSec).toBe(0)
  })

  it('login snapshot mevcut günlerin üzerine ekler', () => {
    const user = { ...emptyProfile('test-seed', 'Test'), days: { '2026-07-01': 500 }, allTimeSec: 500 }
    recordSessionDays(user, { '2026-07-01': 100 })
    const s = getStats(user)
    expect(s.days['2026-07-01']).toBe(600)
    expect(s.allTimeSec).toBe(600)
  })
})

describe('mergeStats — canlı Firestore ile monotonik birleştirme', () => {
  it('self cache DÜŞMEZ: daha düşük gelen Firestore değeri yok sayılır', () => {
    const user = {
      ...emptyProfile('merge-lower', 'Test'),
      days: { '2026-07-06': 100 },
      allTimeSec: 100,
    }
    getStats(user) // cache tohumla
    recordSessionDays(user, { '2026-07-06': 50 }) // yerel: 150 (Firestore'a henüz yazılmadı)
    // Bayat/eksik Firestore snapshot'ı (yazım düşmüş): daha DÜŞÜK
    const fresh = { ...user, days: { '2026-07-06': 120 }, allTimeSec: 120 }
    mergeStats(fresh)
    const s = getStats(fresh)
    expect(s.days['2026-07-06']).toBe(150) // self düşmedi
    expect(s.allTimeSec).toBe(150)
  })

  it('daha yüksek/yeni gün: yukarı alınır (başka cihaz katkısı)', () => {
    const user = {
      ...emptyProfile('merge-higher', 'Test'),
      days: { '2026-07-06': 100 },
      allTimeSec: 100,
    }
    getStats(user)
    // Başka cihaz aynı günü artırmış + yeni bir gün eklemiş
    const fresh = {
      ...user,
      days: { '2026-07-06': 200, '2026-07-08': 30 },
      allTimeSec: 230,
    }
    mergeStats(fresh)
    const s = getStats(fresh)
    expect(s.days['2026-07-06']).toBe(200) // yukarı alındı
    expect(s.days['2026-07-08']).toBe(30) // yeni gün eklendi
    expect(s.allTimeSec).toBe(230)
  })
})
