// ============================================================
// Kronometre durumu — saf (React/tarayıcı bağımsız) tipler + devralma kararı.
// Test edilebilir olması için useTimer hook'undan ayrıldı.
// ============================================================

import type { UserProfile } from '../services/shared'

export type TimerStatus = 'idle' | 'running' | 'paused'

export interface TimerState {
  status: TimerStatus
  startedAt: number | null // koşan parçanın başlangıcı (epoch ms)
  accumulatedSec: number // büyük saatin kümülatif GÖRÜNÜMÜ için
  sessionStartMs: number | null // seansın ilk başlama anı
}

export interface PersistedTimer extends TimerState {
  uid: string
}

export const IDLE: TimerState = {
  status: 'idle',
  startedAt: null,
  accumulatedSec: 0,
  sessionStartMs: null,
}

/** SAF devralma kararı. Koşan bir seans NE KADAR eski olursa olsun koşmaya
 *  devam eder — süre yalnızca kullanıcı Duraklat/Durdur deyince biter. Zaman
 *  tabanlı "kapatılmış olabilir" otomatik sıfırlaması YOKTUR (arka planda /
 *  başka uygulamada saatlerce çalışılabilir). */
export function inheritTimerState(
  persisted: PersistedTimer | null,
  user: UserProfile,
): TimerState {
  if (persisted && persisted.uid === user.uid) {
    if (persisted.status === 'running' || persisted.status === 'paused') {
      return {
        status: persisted.status,
        startedAt: persisted.startedAt ?? null,
        accumulatedSec: persisted.accumulatedSec ?? 0,
        sessionStartMs: persisted.sessionStartMs ?? persisted.startedAt ?? null,
      }
    }
    return IDLE
  }
  // localStorage boş / başka kullanıcı: backend profilinden devral
  if (user.isStudying && user.sessionStartedAt) {
    return {
      status: 'running',
      startedAt: user.sessionStartedAt,
      accumulatedSec: user.sessionAccumulatedSec,
      sessionStartMs: user.sessionStartedAt,
    }
  }
  if (user.sessionAccumulatedSec > 0) {
    return {
      status: 'paused',
      startedAt: null,
      accumulatedSec: user.sessionAccumulatedSec,
      sessionStartMs: null,
    }
  }
  return IDLE
}
