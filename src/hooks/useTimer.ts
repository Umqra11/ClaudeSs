// ============================================================
// Kronometre durum makinesi (idle / running / paused)
//
// Zaman damgası yöntemi: "tik tik" sayılmaz. startedAt (epoch ms)
// + accumulatedSec saklanır; görünen süre daima
//   accumulatedSec + (now - startedAt)
// formülüyle hesaplanır. setInterval yalnızca GÖRÜNTÜYÜ tazeler.
// Sekme arka plana geçse, tarayıcı kapansa, telefon yeniden
// başlasa bile süre doğru işler.
//
// Kalıcılık: her durum değişikliği localStorage'a; başlat /
// duraklat / devam / durdur anlarında + running iken 60 sn'de bir
// heartbeat olarak db.updateUser ile backend'e yazılır.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type UserProfile } from '../services/db'
import { getWeekId, weekStartMs } from '../lib/week'
import { formatClock } from '../lib/format'
import { computeSessionDays, recordSessionDays } from '../lib/stats'
import {
  clearStudyNotification,
  ensureStudyPermission,
  showStudyNotification,
} from '../lib/notify'

export type TimerStatus = 'idle' | 'running' | 'paused'

interface TimerState {
  status: TimerStatus
  startedAt: number | null // koşan parçanın başlangıcı (epoch ms)
  accumulatedSec: number // önceki parçalarda biriken süre
  lastAccumAt: number | null // son birikimin (duraklatmanın) anı
  sessionStartMs: number | null // seansın ilk başlama anı
}

interface PersistedTimer extends TimerState {
  uid: string
}

interface WeekTotal {
  weekId: string
  totalSec: number
}

const TIMER_KEY = 'kpss.timer'

const IDLE: TimerState = {
  status: 'idle',
  startedAt: null,
  accumulatedSec: 0,
  lastAccumAt: null,
  sessionStartMs: null,
}

// Sekme değişiminde (Timer bileşeni sökülüp yeniden kurulduğunda)
// haftalık toplamın bayat profil verisine dönmemesi için oturum içi önbellek.
let weekCache: (WeekTotal & { uid: string }) | null = null

/** Açılışta aktif seansı devral: önce localStorage, yoksa backend profili. */
function loadInitialState(user: UserProfile): TimerState {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    if (raw) {
      const p = JSON.parse(raw) as PersistedTimer
      if (p.uid === user.uid) {
        if (p.status === 'running' || p.status === 'paused') {
          return {
            status: p.status,
            startedAt: p.startedAt ?? null,
            accumulatedSec: p.accumulatedSec ?? 0,
            lastAccumAt: p.lastAccumAt ?? null,
            sessionStartMs: p.sessionStartMs ?? p.startedAt ?? null,
          }
        }
        return IDLE
      }
    }
  } catch {
    /* bozuk kayıt — yok say */
  }
  // localStorage boş (örn. yeni cihaz): backend profilinden devral
  if (user.isStudying && user.sessionStartedAt) {
    return {
      status: 'running',
      startedAt: user.sessionStartedAt,
      accumulatedSec: user.sessionAccumulatedSec,
      lastAccumAt: null,
      sessionStartMs: user.sessionStartedAt,
    }
  }
  if (user.sessionAccumulatedSec > 0) {
    return {
      status: 'paused',
      startedAt: null,
      accumulatedSec: user.sessionAccumulatedSec,
      lastAccumAt: null,
      sessionStartMs: null,
    }
  }
  return IDLE
}

function loadInitialWeek(user: UserProfile): WeekTotal {
  const weekId = getWeekId()
  if (weekCache && weekCache.uid === user.uid && weekCache.weekId === weekId) {
    return { weekId, totalSec: weekCache.totalSec }
  }
  // weekId eskiyse haftalık toplam 0'dan başlar (Salı 00:00 otomatik sıfırlama)
  return { weekId, totalSec: user.weekId === weekId ? user.weekTotalSec : 0 }
}

export function useTimer(user: UserProfile) {
  const [state, setState] = useState<TimerState>(() => loadInitialState(user))
  const [week, setWeekState] = useState<WeekTotal>(() => loadInitialWeek(user))
  const [, setTick] = useState(0)

  const stateRef = useRef(state)
  stateRef.current = state
  const weekRef = useRef(week)
  weekRef.current = week

  const setWeek = useCallback(
    (w: WeekTotal) => {
      weekCache = { uid: user.uid, ...w }
      setWeekState(w)
    },
    [user.uid],
  )

  // Her durum değişikliğini localStorage'a yaz
  useEffect(() => {
    localStorage.setItem(TIMER_KEY, JSON.stringify({ uid: user.uid, ...state }))
  }, [state, user.uid])

  // Görüntü tazeleme (yalnızca ekran için; süre hesabı zaman damgasından)
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [state.status])

  // Uygulamaya geri dönünce bildirimi tazele (arka planda SW uyumuş olabilir)
  useEffect(() => {
    if (state.status !== 'running') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const s = stateRef.current
      if (s.status === 'running') {
        void showStudyNotification(s.sessionStartMs ?? s.startedAt ?? Date.now())
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [state.status])

  // Sekme/PWA başlığında canlı süre (izin gerektirmez)
  useEffect(() => {
    const base = 'KPSS Takip'
    if (state.status !== 'running') {
      document.title = base
      return
    }
    const update = () => {
      const s = stateRef.current
      const sec = Math.floor(
        s.accumulatedSec +
          (s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0),
      )
      document.title = `${formatClock(sec)} · KPSS`
    }
    update()
    const id = setInterval(update, 1000)
    return () => {
      clearInterval(id)
      document.title = base
    }
  }, [state.status])

  const syncBackend = useCallback(
    (s: TimerState, w: WeekTotal) => {
      db.updateUser(user.uid, {
        isStudying: s.status === 'running',
        sessionStartedAt: s.startedAt,
        sessionAccumulatedSec: Math.round(s.accumulatedSec),
        weekId: w.weekId,
        weekTotalSec: Math.round(w.totalSec),
      }).catch(() => {
        /* çevrimdışı vb. — localStorage zaten güncel */
      })
    },
    [user.uid],
  )

  // Açılışta hafta devri olduysa backend'i hizala
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (user.weekId !== weekRef.current.weekId) {
      syncBackend(stateRef.current, weekRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Running iken 60 sn'de bir heartbeat
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(
      () => syncBackend(stateRef.current, weekRef.current),
      60_000,
    )
    return () => clearInterval(id)
  }, [state.status, syncBackend])

  const start = useCallback(() => {
    if (stateRef.current.status !== 'idle') return
    const now = Date.now()
    const s: TimerState = {
      status: 'running',
      startedAt: now,
      accumulatedSec: 0,
      lastAccumAt: null,
      sessionStartMs: now,
    }
    setState(s)
    syncBackend(s, weekRef.current)
    // Kullanıcı hareketi: izin iste, sonra bildirimi göster
    void ensureStudyPermission().then((ok) => {
      if (ok) void showStudyNotification(now)
    })
  }, [syncBackend])

  const pause = useCallback(() => {
    const prev = stateRef.current
    if (prev.status !== 'running' || !prev.startedAt) return
    const now = Date.now()
    const s: TimerState = {
      ...prev,
      status: 'paused',
      startedAt: null,
      accumulatedSec: prev.accumulatedSec + (now - prev.startedAt) / 1000,
      lastAccumAt: now,
    }
    setState(s)
    syncBackend(s, weekRef.current)
    void clearStudyNotification()
  }, [syncBackend])

  const resume = useCallback(() => {
    const prev = stateRef.current
    if (prev.status !== 'paused') return
    const now = Date.now()
    const s: TimerState = {
      ...prev,
      status: 'running',
      startedAt: now,
      sessionStartMs: prev.sessionStartMs ?? now,
    }
    setState(s)
    syncBackend(s, weekRef.current)
    void showStudyNotification(s.sessionStartMs ?? now)
  }, [syncBackend])

  const stop = useCallback(() => {
    const prev = stateRef.current
    if (prev.status === 'idle') return
    const now = Date.now()
    const weekIdNow = getWeekId(new Date(now))
    const boundary = weekStartMs(weekIdNow)

    // Koşan parça: Salı 00:00 sınırını kestiyse yalnızca sınırdan
    // sonrası bu haftaya sayılır (öncesi eski haftada kaldı, düşer).
    const runningCurrentSec =
      prev.status === 'running' && prev.startedAt
        ? Math.max(0, (now - Math.max(prev.startedAt, boundary)) / 1000)
        : 0

    // Birikmiş parça: son birikim (veya seans başlangıcı) sınırdan
    // sonraysa bu haftaya, değilse eski haftaya aittir.
    const accumBelongsToCurrentWeek =
      (prev.lastAccumAt != null && prev.lastAccumAt >= boundary) ||
      (prev.lastAccumAt == null &&
        prev.sessionStartMs != null &&
        prev.sessionStartMs >= boundary)
    const accumCurrentSec = accumBelongsToCurrentWeek ? prev.accumulatedSec : 0

    const base = weekRef.current.weekId === weekIdNow ? weekRef.current.totalSec : 0
    const w: WeekTotal = {
      weekId: weekIdNow,
      totalSec: base + runningCurrentSec + accumCurrentSec,
    }

    // Günlük geçmiş + tüm zamanlar: seans Istanbul gün sınırlarında
    // otomatik bölünür — gece yarısını kesen seansta 00:00 öncesi önceki
    // güne, sonrası yeni güne yazılır (kullanıcı bir şey yapmaz).
    const stats = recordSessionDays(user, computeSessionDays(prev, now))

    setWeek(w)
    setState(IDLE)
    db.updateUser(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      sessionAccumulatedSec: 0,
      weekId: w.weekId,
      weekTotalSec: Math.round(w.totalSec),
      days: stats.days,
      allTimeSec: Math.round(stats.allTimeSec),
      // "Son görülme" = son çalışma girdisi (kronometrenin durdurulduğu an).
      lastSeenAt: now,
    }).catch(() => {
      /* çevrimdışı vb. — localStorage zaten güncel */
    })
    void clearStudyNotification()
  }, [setWeek, user])

  // Görünen değerler — her render'da zaman damgasından hesaplanır
  const now = Date.now()
  const elapsedSec = Math.floor(
    state.accumulatedSec +
      (state.status === 'running' && state.startedAt
        ? (now - state.startedAt) / 1000
        : 0),
  )
  const weekBaseSec = week.weekId === getWeekId() ? week.totalSec : 0
  const weekWithActiveSec = Math.floor(weekBaseSec) + elapsedSec

  return {
    status: state.status,
    elapsedSec,
    weekTotalSec: Math.floor(weekBaseSec),
    weekWithActiveSec,
    start,
    pause,
    resume,
    stop,
  }
}
