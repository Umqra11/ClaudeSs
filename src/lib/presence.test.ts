import { describe, expect, it } from 'vitest'
import { isLiveStudying } from './presence'
import { emptyProfile } from '../services/shared'

describe('isLiveStudying — seansa güvenir, heartbeat tazeliğine değil', () => {
  it('isStudying + sessionStartedAt → CANLI (heartbeat bayat olsa bile)', () => {
    const m = {
      ...emptyProfile('u1', 'Test'),
      isStudying: true,
      sessionStartedAt: Date.now() - 60_000,
      lastHeartbeatAt: Date.now() - 3 * 3600_000, // 3 saat bayat
    }
    expect(isLiveStudying(m)).toBe(true)
  })

  it('heartbeat HİÇ yokken bile CANLI (arka planda çalışan)', () => {
    const m = {
      ...emptyProfile('u1', 'Test'),
      isStudying: true,
      sessionStartedAt: Date.now() - 5000,
      lastHeartbeatAt: null,
    }
    expect(isLiveStudying(m)).toBe(true)
  })

  it('isStudying=false → canlı değil (açık Durdur/Duraklat)', () => {
    const m = {
      ...emptyProfile('u1', 'Test'),
      isStudying: false,
      sessionStartedAt: Date.now(),
    }
    expect(isLiveStudying(m)).toBe(false)
  })

  it('sessionStartedAt yok → canlı değil', () => {
    const m = { ...emptyProfile('u1', 'Test'), isStudying: true, sessionStartedAt: null }
    expect(isLiveStudying(m)).toBe(false)
  })
})
