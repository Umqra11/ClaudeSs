import { describe, expect, it } from 'vitest'
import {
  dayStartMs,
  getDayId,
  getWeekId,
  nextResetAt,
  previousWeekId,
  splitIntervalByDay,
  weekStartMs,
} from './week'

// Istanbul (UTC+3) duvar saatiyle bir an üret.
const ist = (iso: string) => new Date(`${iso}+03:00`).getTime()

describe('getWeekId — Salı 00:00 sınırı', () => {
  it('Salı günü kendi haftasını başlatır', () => {
    expect(getWeekId(new Date(ist('2026-06-30T00:00:00')))).toBe('2026-06-30')
    expect(getWeekId(new Date(ist('2026-06-30T23:59:59')))).toBe('2026-06-30')
  })

  it('Pazartesi önceki haftaya aittir', () => {
    expect(getWeekId(new Date(ist('2026-06-29T23:59:59')))).toBe('2026-06-23')
  })

  it('hafta içi günler aynı haftada kalır', () => {
    expect(getWeekId(new Date(ist('2026-07-05T12:00:00')))).toBe('2026-06-30')
  })
})

describe('previousWeekId / weekStartMs / nextResetAt', () => {
  it('bir Salı geriye gider', () => {
    expect(previousWeekId('2026-06-30')).toBe('2026-06-23')
  })

  it('hafta başları tam 7 gün arayla', () => {
    const diff = weekStartMs('2026-06-30') - weekStartMs('2026-06-23')
    expect(diff).toBe(7 * 86_400_000)
  })

  it('nextResetAt gelecek Salı 00:00 verir', () => {
    const at = nextResetAt(new Date(ist('2026-07-05T12:00:00')))
    expect(getDayId(new Date(at))).toBe('2026-07-07')
    expect(at).toBe(dayStartMs('2026-07-07'))
  })
})

describe('splitIntervalByDay — gün sınırı bölme', () => {
  it('gece yarısını kesen aralığı iki güne böler', () => {
    const parts = splitIntervalByDay(
      ist('2026-07-06T23:00:00'),
      ist('2026-07-07T01:00:00'),
    )
    expect(parts).toEqual([
      { dayId: '2026-07-06', sec: 3600 },
      { dayId: '2026-07-07', sec: 3600 },
    ])
  })

  it('tek gün içindeki aralık bölünmez', () => {
    const parts = splitIntervalByDay(
      ist('2026-07-06T10:00:00'),
      ist('2026-07-06T12:30:00'),
    )
    expect(parts).toEqual([{ dayId: '2026-07-06', sec: 9000 }])
  })

  it('ters/boş aralık boş liste döner', () => {
    const t = ist('2026-07-06T10:00:00')
    expect(splitIntervalByDay(t, t)).toEqual([])
    expect(splitIntervalByDay(t + 1000, t)).toEqual([])
  })

  it('çok günlü segment zinciri doğru dağılır (duraklat/durdur senaryosu)', () => {
    // G1 20:00-22:00, G2 08:00-10:00, G3 08:00-09:00 — üç ayrı segment
    const merge: Record<string, number> = {}
    const segs: Array<[number, number]> = [
      [ist('2026-07-06T20:00:00'), ist('2026-07-06T22:00:00')],
      [ist('2026-07-07T08:00:00'), ist('2026-07-07T10:00:00')],
      [ist('2026-07-08T08:00:00'), ist('2026-07-08T09:00:00')],
    ]
    for (const [s, e] of segs) {
      for (const { dayId, sec } of splitIntervalByDay(s, e)) {
        merge[dayId] = (merge[dayId] ?? 0) + sec
      }
    }
    expect(merge).toEqual({
      '2026-07-06': 7200,
      '2026-07-07': 7200,
      '2026-07-08': 3600,
    })
  })
})
