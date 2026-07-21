import { describe, expect, it } from 'vitest'
import { inheritTimerState, type PersistedTimer } from './timerState'
import { emptyProfile } from '../services/shared'

describe('inheritTimerState — koşan seans asla otomatik sıfırlanmaz', () => {
  const user = emptyProfile('u1', 'Test')

  it('ÇOK ESKİ bir koşan seans yine RUNNING devam eder (sıfırlanmaz)', () => {
    const threeHoursAgo = Date.now() - 3 * 3600_000
    const persisted: PersistedTimer = {
      uid: 'u1',
      status: 'running',
      startedAt: threeHoursAgo,
      accumulatedSec: 0,
      sessionStartMs: threeHoursAgo,
    }
    const s = inheritTimerState(persisted, user)
    expect(s.status).toBe('running')
    expect(s.startedAt).toBe(threeHoursAgo) // gerçek başlangıç korunur
    expect(s.sessionStartMs).toBe(threeHoursAgo)
  })

  it('günlerce eski seans bile RUNNING kalır', () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000
    const persisted: PersistedTimer = {
      uid: 'u1',
      status: 'running',
      startedAt: twoDaysAgo,
      accumulatedSec: 500,
      sessionStartMs: twoDaysAgo,
    }
    const s = inheritTimerState(persisted, user)
    expect(s.status).toBe('running')
    expect(s.accumulatedSec).toBe(500)
  })

  it('paused seans paused devralınır', () => {
    const persisted: PersistedTimer = {
      uid: 'u1',
      status: 'paused',
      startedAt: null,
      accumulatedSec: 1200,
      sessionStartMs: Date.now() - 5000,
    }
    const s = inheritTimerState(persisted, user)
    expect(s.status).toBe('paused')
    expect(s.accumulatedSec).toBe(1200)
  })

  it('idle kalıcı kayıt → IDLE', () => {
    const persisted: PersistedTimer = {
      uid: 'u1',
      status: 'idle',
      startedAt: null,
      accumulatedSec: 0,
      sessionStartMs: null,
    }
    expect(inheritTimerState(persisted, user).status).toBe('idle')
  })

  it('başka kullanıcının kaydı yok sayılır → backend profiline düşer', () => {
    const persisted: PersistedTimer = {
      uid: 'BASKA',
      status: 'running',
      startedAt: Date.now(),
      accumulatedSec: 0,
      sessionStartMs: Date.now(),
    }
    // user idle profili → IDLE
    expect(inheritTimerState(persisted, user).status).toBe('idle')
  })

  it('localStorage yok + backend RUNNING profili → RUNNING (çapraz cihaz devralma)', () => {
    const startedAt = Date.now() - 60_000
    const studying = {
      ...emptyProfile('u1', 'Test'),
      isStudying: true,
      sessionStartedAt: startedAt,
      sessionAccumulatedSec: 42,
    }
    const s = inheritTimerState(null, studying)
    expect(s.status).toBe('running')
    expect(s.startedAt).toBe(startedAt)
    expect(s.accumulatedSec).toBe(42)
  })

  it('localStorage yok + backend accumulated>0 → paused', () => {
    const u = { ...emptyProfile('u1', 'Test'), sessionAccumulatedSec: 300 }
    expect(inheritTimerState(null, u).status).toBe('paused')
  })

  it('hiçbir şey yok → IDLE', () => {
    expect(inheritTimerState(null, user).status).toBe('idle')
  })
})
