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
// Kalıcılık: her KOŞAN PARÇA (segment) bittiği anda (duraklat/durdur)
// gün bazında `days`'e işlenir (settleSegment). Haftalık toplam AYRI bir
// alandan izlenmez; `days`'ten TÜRETİLİR (weekTotalFromDays) — monotonik,
// bayat "kör overwrite"a ve yanlış sıfırlamaya karşı yapısal olarak
// güvenli. Firestore'daki weekTotalSec yalnızca days-türevi bir aynadır
// (eski istemciler okusun diye yazılır; otoriter değildir).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, type UserProfile } from '../services/db'
import { getDayId, getWeekId, splitIntervalByDay } from '../lib/week'
import { formatClock } from '../lib/format'
import { getStats, recordSessionDays, weekTotalFromDays } from '../lib/stats'
import {
  clearStudyNotification,
  ensureStudyPermission,
  showStudyNotification,
} from '../lib/notify'

export type TimerStatus = 'idle' | 'running' | 'paused'

interface TimerState {
  status: TimerStatus
  startedAt: number | null // koşan parçanın başlangıcı (epoch ms)
  accumulatedSec: number // önceki parçalarda biriken süre — YALNIZCA
  // büyük saatin kümülatif GÖRÜNÜMÜ içindir; gün/hafta kalıcılığı
  // settleSegment ile parça bittiği anda (pause/stop) ayrıca yapılıyor.
  sessionStartMs: number | null // seansın ilk başlama anı
}

interface PersistedTimer extends TimerState {
  uid: string
}

const TIMER_KEY = 'kpss.timer'

const IDLE: TimerState = {
  status: 'idle',
  startedAt: null,
  accumulatedSec: 0,
  sessionStartMs: null,
}

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

export function useTimer(user: UserProfile) {
  const [state, setState] = useState<TimerState>(() => loadInitialState(user))
  const [, setTick] = useState(0)

  const stateRef = useRef(state)
  stateRef.current = state

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

  // Session alanları + weekId + weekTotalSec (days'ten TÜREVİ) yazar.
  // Artık bayat weekRef değil, days-türevi yazılır: hiçbir zaman gerçek
  // days toplamının altına düşmez ve yeni haftada gün yoksa doğal 0 olur.
  const syncBackend = useCallback(
    (s: TimerState, extra?: { lastSeenAt?: number | null }) => {
      db.updateUser(user.uid, {
        isStudying: s.status === 'running',
        sessionStartedAt: s.startedAt,
        sessionAccumulatedSec: Math.round(s.accumulatedSec),
        weekId: getWeekId(),
        weekTotalSec: weekTotalFromDays(getStats(user).days),
        ...extra,
      }).catch(() => {
        /* çevrimdışı vb. — localStorage zaten güncel */
      })
    },
    [user],
  )

  // Bir [startMs, endMs] koşan SEGMENTİNİ gün bazında doğru bölüp kalıcı
  // istatistiklere işler (DB'ye YAZMAZ — çağıran yazar). pause() ve stop()
  // bunu ORTAK kullanır ki bir segment TAM OLARAK BİR KEZ ayarlansın:
  // pause segmenti kapatırsa (startedAt=null) stop artık ona dokunmaz —
  // duplicate yapısal olarak imkansız. Haftalık toplam days'ten türediği
  // için burada hafta mantığı gerekmez.
  const settleSegment = useCallback(
    (startMs: number, endMs: number) => {
      const perDay: Record<string, number> = {}
      for (const { dayId, sec } of splitIntervalByDay(startMs, endMs)) {
        perDay[dayId] = (perDay[dayId] ?? 0) + sec
      }
      return recordSessionDays(user, perDay) // { uid, days, allTimeSec }
    },
    [user],
  )

  // Running iken 60 sn'de bir heartbeat
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => syncBackend(stateRef.current), 60_000)
    return () => clearInterval(id)
  }, [state.status, syncBackend])

  const start = useCallback(() => {
    if (stateRef.current.status !== 'idle') return
    const now = Date.now()
    const s: TimerState = {
      status: 'running',
      startedAt: now,
      accumulatedSec: 0,
      sessionStartMs: now,
    }
    setState(s)
    // "Son görülme" yalnızca DURDURMA/DURAKLATMA saatini göstermeli: yeni
    // seans başlarken varsa bayat değeri temizle. Aynı yazımda gider (ayrı
    // çağrı yerel modda yarışırdı).
    syncBackend(s, { lastSeenAt: null })
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
      // Büyük saatin kümülatif GÖRÜNÜMÜ için — kalıcı gün verisi aşağıda
      // settleSegment ile AYRI ve DOĞRU şekilde işleniyor.
      accumulatedSec: prev.accumulatedSec + (now - prev.startedAt) / 1000,
    }
    setState(s)

    // Az önce biten segmenti [prev.startedAt, now] gün bazında AYARLA ve
    // kalıcı yaz. Durdur ile ÇAKIŞMAZ: bu segment burada kapatıldığı
    // (startedAt=null) için stop() bir daha ayarlamaz. Tek yazım (yerel-mod
    // yarışına karşı). weekTotalSec days'ten türetilir.
    const settled = settleSegment(prev.startedAt, now)
    db.updateUser(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      // Yalnızca GÖRÜNTÜ / çapraz-cihaz devralma amaçlı.
      sessionAccumulatedSec: Math.round(s.accumulatedSec),
      weekId: getWeekId(),
      weekTotalSec: weekTotalFromDays(settled.days),
      days: settled.days,
      allTimeSec: Math.round(settled.allTimeSec),
      // "Son görülme" = son etkinlik anı (duraklatma saati).
      lastSeenAt: now,
    }).catch(() => {
      /* çevrimdışı vb. — localStorage zaten güncel */
    })
    void clearStudyNotification()
  }, [settleSegment, user.uid])

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
    syncBackend(s)
    void showStudyNotification(s.sessionStartMs ?? now)
  }, [syncBackend])

  const stop = useCallback(() => {
    const prev = stateRef.current
    if (prev.status === 'idle') return
    const now = Date.now()

    // 'paused' ise HÂLÂ KOŞAN bir segment yok — o zaten pause()'da
    // ayarlandı (kalıcı yazıldı); burada TEKRAR ayarlarsak duplicate
    // olurdu. Yalnızca 'running' iken (koşan bir segment varsa) ayarlanır.
    const settled =
      prev.status === 'running' && prev.startedAt
        ? settleSegment(prev.startedAt, now)
        : null

    setState(IDLE)
    db.updateUser(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      sessionAccumulatedSec: 0,
      weekId: getWeekId(),
      weekTotalSec: weekTotalFromDays(
        settled ? settled.days : getStats(user).days,
      ),
      ...(settled
        ? { days: settled.days, allTimeSec: Math.round(settled.allTimeSec) }
        : {}),
      // "Son görülme" = son çalışma girdisi (kronometrenin durdurulduğu an).
      lastSeenAt: now,
    }).catch(() => {
      /* çevrimdışı vb. — localStorage zaten güncel */
    })
    void clearStudyNotification()
  }, [settleSegment, user.uid])

  // Görünen değerler — her render'da zaman damgasından hesaplanır
  const now = Date.now()
  const runningLegSec =
    state.status === 'running' && state.startedAt
      ? (now - state.startedAt) / 1000
      : 0
  // Büyük saat: çoklu duraklatma boyunca KÜMÜLATİF görünüm — değişmedi.
  const elapsedSec = Math.floor(state.accumulatedSec + runningLegSec)

  // Haftalık/günlük taban days'ten TÜRETİLİR (monotonik, düşmez). days
  // yalnızca settle'da değişir → useMemo ile her tick'te yeniden
  // hesaplanmaz; koşan bacak ayrıca eklenir.
  const days = getStats(user).days
  const weekBaseSec = useMemo(() => weekTotalFromDays(days), [days])
  const weekWithActiveSec = weekBaseSec + Math.floor(runningLegSec)

  const todayBaseSec = Math.floor(days[getDayId()] ?? 0)
  const todayWithActiveSec = todayBaseSec + Math.floor(runningLegSec)

  return {
    status: state.status,
    elapsedSec,
    weekTotalSec: weekBaseSec,
    weekWithActiveSec,
    todayTotalSec: todayBaseSec,
    todayWithActiveSec,
    start,
    pause,
    resume,
    stop,
  }
}
