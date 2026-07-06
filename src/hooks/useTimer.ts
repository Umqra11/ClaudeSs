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
import { getDayId, getWeekId, splitIntervalByDay, splitIntervalByWeek } from '../lib/week'
import { formatClock } from '../lib/format'
import { getStats, recordSessionDays } from '../lib/stats'
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
  // büyük saatin kümülatif GÖRÜNÜMÜ içindir; gün/hafta kalıcılığı artık
  // settleSegment ile parça bittiği anda (pause/stop) ayrıca yapılıyor.
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
    (
      s: TimerState,
      w: WeekTotal,
      // Ek alanlar (ör. lastSeenAt) — AYNI yazımda gitmeli. Yerel modda
      // updateUser oku-değiştir-yaz olduğu için ikinci ayrı bir çağrı,
      // bayat veriyle sessionAccumulatedSec'i sıfırlayıp yarışırdı.
      extra?: { lastSeenAt?: number | null },
    ) => {
      db.updateUser(user.uid, {
        isStudying: s.status === 'running',
        sessionStartedAt: s.startedAt,
        sessionAccumulatedSec: Math.round(s.accumulatedSec),
        weekId: w.weekId,
        weekTotalSec: Math.round(w.totalSec),
        ...extra,
      }).catch(() => {
        /* çevrimdışı vb. — localStorage zaten güncel */
      })
    },
    [user.uid],
  )

  // Bir [startMs, endMs] koşan SEGMENTİNİ gün VE hafta bazında doğru
  // şekilde kalıcı istatistiklere işler (DB'ye YAZMAZ — çağıran yazar).
  // pause() ve stop() bunu ORTAK kullanır ki bir segment TAM OLARAK BİR
  // KEZ ayarlansın: pause segmenti kapatırsa (startedAt=null) stop artık
  // ona dokunmaz — duplicate yapısal olarak imkansız.
  const settleSegment = useCallback(
    (startMs: number, endMs: number) => {
      const perDay: Record<string, number> = {}
      for (const { dayId, sec } of splitIntervalByDay(startMs, endMs)) {
        perDay[dayId] = (perDay[dayId] ?? 0) + sec
      }
      const dayStats = recordSessionDays(user, perDay)

      const segments = splitIntervalByWeek(startMs, endMs)
      let w = weekRef.current

      // Hafta sınırı aşıldığında eski haftanın birikmiş süresini
      // weekRef'ten (yeni hafta totalSec=0 olabilir) değil, user
      // profilinden al. Aksi halde prevWeekTotalSec eksik yazılır
      // ve haftalık süre kaybolur (Salı 00:00 sıfırlamasıyla tetiklenir).
      if (
        segments.length > 0 &&
        w.weekId !== segments[0].weekId
      ) {
        // Segment eski haftada başlıyor ama weekRef yeni haftada
        const oldWeekId = segments[0].weekId
        let oldWeekBalance = 0
        if (user.weekId === oldWeekId) {
          oldWeekBalance = user.weekTotalSec
        } else if (user.prevWeekId === oldWeekId) {
          oldWeekBalance = user.prevWeekTotalSec
        }
        w = { weekId: oldWeekId, totalSec: oldWeekBalance }
      }

      const rollover: { prevWeekId?: string; prevWeekTotalSec?: number } = {}
      for (const { weekId, sec } of segments) {
        if (w.weekId !== weekId) {
          // Segment hafta sınırını kestiyse: eski hafta doluysa şampiyon
          // tespiti için snapshot'la, yeni haftadan sıfırla devam et.
          if (w.weekId && w.totalSec > 0) {
            rollover.prevWeekId = w.weekId
            rollover.prevWeekTotalSec = Math.round(w.totalSec)
          }
          w = { weekId, totalSec: 0 }
        }
        w = { weekId: w.weekId, totalSec: w.totalSec + sec }
      }

      return {
        days: dayStats.days,
        allTimeSec: dayStats.allTimeSec,
        week: w,
        rollover,
      }
    },
    [user],
  )

  // Açılışta hafta devri olduysa backend'i hizala
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (user.weekId !== weekRef.current.weekId) {
      syncBackend(stateRef.current, weekRef.current)
      // Hafta devri: weekTotalSec syncBackend ile 0'a çekilmeden önce geçen
      // haftayı snapshot'la — haftalık şampiyon tespiti bunu okur.
      if (user.weekId && user.weekTotalSec > 0) {
        void db
          .updateUser(user.uid, {
            prevWeekId: user.weekId,
            prevWeekTotalSec: user.weekTotalSec,
          })
          .catch(() => { })
      }
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
      sessionStartMs: now,
    }
    setState(s)
    // "Son görülme" yalnızca DURDURMA saatini göstermeli: yeni seans
    // başlarken varsa bayat (önceki sürümden kalma) değeri temizle. Seans
    // sürerken zaten gizli; Durdur'da gerçek durdurma saati yazılır. Aynı
    // yazımda gider (ayrı çağrı yerel modda yarışırdı).
    syncBackend(s, weekRef.current, { lastSeenAt: null })
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
      // Büyük saatin kümülatif GÖRÜNÜMÜ için — kalıcı gün/hafta verisi
      // aşağıda settleSegment ile AYRI ve DOĞRU şekilde işleniyor.
      accumulatedSec: prev.accumulatedSec + (now - prev.startedAt) / 1000,
    }
    setState(s)

    // Az önce biten segmenti [prev.startedAt, now] gün+hafta bazında
    // AYARLA ve kalıcı yaz. Durdur ile ÇAKIŞMAZ: bu segment burada
    // kapatıldığı (startedAt=null) için stop() bir daha ayarlamaz.
    const settled = settleSegment(prev.startedAt, now)
    setWeek(settled.week)
    db.updateUser(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      // Yalnızca GÖRÜNTÜ / çapraz-cihaz devralma amaçlı — liderlik
      // hesabı artık bunu eklemiyor (weekTotalSec zaten güncel).
      sessionAccumulatedSec: Math.round(s.accumulatedSec),
      weekId: settled.week.weekId,
      weekTotalSec: Math.round(settled.week.totalSec),
      days: settled.days,
      allTimeSec: Math.round(settled.allTimeSec),
      // "Son görülme" = son etkinlik anı (duraklatma saati).
      lastSeenAt: now,
      ...settled.rollover,
    }).catch(() => {
      /* çevrimdışı vb. — localStorage zaten güncel */
    })
    void clearStudyNotification()
  }, [settleSegment, setWeek, user.uid])

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

    // 'paused' ise HÂLÂ KOŞAN bir segment yok — o zaten pause()'da
    // ayarlandı (kalıcı yazıldı); burada TEKRAR ayarlarsak duplicate
    // olurdu. Yalnızca 'running' iken (koşan bir segment varsa) ayarlanır.
    const settled =
      prev.status === 'running' && prev.startedAt
        ? settleSegment(prev.startedAt, now)
        : null
    const w = settled ? settled.week : weekRef.current

    setWeek(w)
    setState(IDLE)
    db.updateUser(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      sessionAccumulatedSec: 0,
      weekId: w.weekId,
      weekTotalSec: Math.round(w.totalSec),
      ...(settled
        ? {
          days: settled.days,
          allTimeSec: Math.round(settled.allTimeSec),
          ...settled.rollover,
        }
        : {}),
      // "Son görülme" = son çalışma girdisi (kronometrenin durdurulduğu an).
      lastSeenAt: now,
    }).catch(() => {
      /* çevrimdışı vb. — localStorage zaten güncel */
    })
    void clearStudyNotification()
  }, [settleSegment, setWeek, user.uid])

  // Görünen değerler — her render'da zaman damgasından hesaplanır
  const now = Date.now()
  const runningLegSec =
    state.status === 'running' && state.startedAt
      ? (now - state.startedAt) / 1000
      : 0
  // Büyük saat: çoklu duraklatma boyunca KÜMÜLATİF görünüm — davranış
  // değişmedi.
  const elapsedSec = Math.floor(state.accumulatedSec + runningLegSec)

  const weekBaseSec = week.weekId === getWeekId() ? week.totalSec : 0
  // NOT elapsedSec: week her duraklatmada (settleSegment ile) güncel
  // tutulduğundan önceki bacaklar zaten içinde — yalnızca HENÜZ
  // ayarlanmamış koşan bacak eklenir, aksi halde çift sayılır.
  const weekWithActiveSec = Math.floor(weekBaseSec) + Math.floor(runningLegSec)

  const todayId = getDayId()
  const todayBaseSec = getStats(user).days[todayId] ?? 0
  const todayWithActiveSec = Math.floor(todayBaseSec) + Math.floor(runningLegSec)

  return {
    status: state.status,
    elapsedSec,
    weekTotalSec: Math.floor(weekBaseSec),
    weekWithActiveSec,
    todayTotalSec: Math.floor(todayBaseSec),
    todayWithActiveSec,
    start,
    pause,
    resume,
    stop,
  }
}
