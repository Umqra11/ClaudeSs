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
import {
  getStats,
  mergeStats,
  recordSessionDays,
  weekTotalFromDays,
} from '../lib/stats'
import { installSettleFlush, persistSettle } from '../lib/settleQueue'
import {
  IDLE,
  inheritTimerState,
  type PersistedTimer,
  type TimerState,
  type TimerStatus,
} from '../lib/timerState'
import {
  clearStudyNotification,
  ensureStudyPermission,
  showStudyNotification,
} from '../lib/notify'

export type { TimerStatus }

const TIMER_KEY = 'kpss.timer'

/** Açılışta aktif seansı devral: önce localStorage, yoksa backend profili. */
function readInherited(user: UserProfile): TimerState {
  let persisted: PersistedTimer | null = null
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    if (raw) persisted = JSON.parse(raw) as PersistedTimer
  } catch {
    /* bozuk kayıt — yok say */
  }
  return inheritTimerState(persisted, user)
}

export function useTimer(user: UserProfile) {
  // Devralma bir kez hesaplanır (readInherited yan etkisizdir; strict-mode
  // çift-çağrısında güvenli). Koşan seans olduğu gibi devam eder.
  const [state, setState] = useState<TimerState>(() => readInherited(user))
  const [, setTick] = useState(0)

  const stateRef = useRef(state)
  stateRef.current = state

  // localStorage'a durumu yaz.
  const persistTimer = useCallback(
    (s: TimerState) => {
      localStorage.setItem(TIMER_KEY, JSON.stringify({ uid: user.uid, ...s }))
    },
    [user.uid],
  )

  // Her durum değişikliğini localStorage'a yaz
  useEffect(() => {
    persistTimer(state)
  }, [state, persistTimer])

  // Çevrimdışı/kapanışta düşmüş settle yazımlarını online/görünür/açılışta
  // yeniden dene (idempotent — settleId ile çift saymaz).
  useEffect(() => {
    installSettleFlush()
  }, [])

  // Canlı Firestore user'ı (useAuth aboneliği) geldikçe getStats cache'ini
  // MONOTONİK birleştir — self görünümü Firestore ile yakınsasın (kendi
  // cihazında yüksek / başkalarında düşük görünme kapanır). Süre asla düşmez.
  useEffect(() => {
    mergeStats(user)
    setTick((t) => t + 1)
  }, [user])

  // Görüntü tazeleme (yalnızca ekran için; süre hesabı zaman damgasından)
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
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
        // Presence damgası: Firebase bunu SUNUCU saatiyle yazar. Scoreboard,
        // heartbeat'i taze olmayan üyeyi "çalışıyor" saymaz (ghost oturum yok).
        lastHeartbeatAt: Date.now(),
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
      let segSec = 0
      for (const { dayId, sec } of splitIntervalByDay(startMs, endMs)) {
        perDay[dayId] = (perDay[dayId] ?? 0) + sec
        segSec += sec
      }
      const stats = recordSessionDays(user, perDay) // { uid, days, allTimeSec }
      // perDay/segSec: backend'e ARTIMLI yazım için (daysIncrement) —
      // tam-map yazım bayat sekmelerin birbirinin günlerini ezmesine yol
      // açıyordu; increment ile her sekmenin katkısı kayıpsız birleşir.
      return { ...stats, perDay, segSec: Math.round(segSec) }
    },
    [user],
  )

  // CHECKPOINT: koşarken periyodik olarak (birkaç dakikada bir) o ana kadarki
  // segmenti `days`'e ARTIMLI yaz ve koşan bacağın başlangıcını (startedAt +
  // backend sessionStartedAt) o ana ilerlet. Böylece kullanıcı DURAKLAT/DURDUR
  // demeden de süre database'e birikir; kapatınca/cihaz değiştirince en fazla
  // son checkpoint'ten beriki kısım risk altında olur ve başkalarının ekranında
  // toplam düşmez. Çift sayım YOK: bacak ilerlediği için hem yerel hesap hem de
  // başkalarının canlı `running` payı yalnız "son checkpoint'ten beri"dir; days
  // ise checkpoint'e kadarını içerir (settleId ile de idempotenttir). Kronometre
  // görünümü kesintisiz kalır (elapsed = accumulated + (now - startedAt) aynıdır).
  const checkpoint = useCallback(() => {
    const prev = stateRef.current
    if (prev.status !== 'running' || !prev.startedAt) return
    const now = Date.now()
    const settled = settleSegment(prev.startedAt, now)
    const s: TimerState = {
      ...prev,
      startedAt: now, // bacağı ilerlet — görünüm için accumulated'e katıldı
      accumulatedSec: prev.accumulatedSec + (now - prev.startedAt) / 1000,
    }
    setState(s) // durum→localStorage effect'i yeni startedAt'i yazar
    void persistSettle(user.uid, {
      isStudying: true,
      sessionStartedAt: now, // başkaları: running = now - sessionStartedAt (çakışmaz)
      sessionAccumulatedSec: Math.round(s.accumulatedSec),
      weekId: getWeekId(),
      weekTotalSec: weekTotalFromDays(settled.days),
      daysIncrement: settled.perDay,
      allTimeIncrementSec: settled.segSec,
      settleId: crypto.randomUUID(),
      lastHeartbeatAt: Date.now(),
    })
  }, [settleSegment, user.uid])

  // Aralıklı effect'ler yalnız state.status'a bağlı olmalı: aksi halde canlı
  // `user` aboneliği her yazım yankısında (60sn heartbeat dahil) syncBackend/
  // checkpoint kimliğini değiştirip interval'ı SIFIRLIYOR — 150sn'lik checkpoint
  // hiç tetiklenemiyordu. Güncel fonksiyonlar ref üzerinden okunur; interval
  // yalnız idle↔running geçişinde yeniden kurulur.
  const syncBackendRef = useRef(syncBackend)
  syncBackendRef.current = syncBackend
  const persistTimerRef = useRef(persistTimer)
  persistTimerRef.current = persistTimer
  const checkpointRef = useRef(checkpoint)
  checkpointRef.current = checkpoint

  // Koşarken 2,5 dakikada bir checkpoint (kayıp penceresini birkaç dakikaya
  // indirir; Firestore'u saniyelik yazımlarla yormaz).
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => checkpointRef.current(), 150_000)
    return () => clearInterval(id)
  }, [state.status])

  // Running iken 60 sn'de bir heartbeat (presence tazeler + localStorage)
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => {
      syncBackendRef.current(stateRef.current)
      persistTimerRef.current(stateRef.current)
    }, 60_000)
    return () => clearInterval(id)
  }, [state.status])

  // Uygulamaya geri dönünce: presence heartbeat'ini tazele (başkalarında
  // en güncel süre/aktiflik hemen yansısın) ve bildirimi yenile (arka planda
  // SW uyumuş olabilir).
  useEffect(() => {
    if (state.status !== 'running') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const s = stateRef.current
      if (s.status === 'running') {
        syncBackend(s)
        persistTimer(s)
        void showStudyNotification(s.sessionStartMs ?? s.startedAt ?? Date.now())
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [state.status, syncBackend, persistTimer])

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
    // (startedAt=null) için stop() bir daha ayarlamaz. weekTotalSec days'ten
    // türetilir. persistSettle: çevrimdışı/kapanışta düşerse yeniden dener/
    // kuyruklar (settleId ile idempotent) → başkalarında "eksik süre" kalmaz.
    const settled = settleSegment(prev.startedAt, now)
    void persistSettle(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      // Yalnızca GÖRÜNTÜ / çapraz-cihaz devralma amaçlı.
      sessionAccumulatedSec: Math.round(s.accumulatedSec),
      weekId: getWeekId(),
      weekTotalSec: weekTotalFromDays(settled.days),
      // ARTIMLI: yalnız bu segmentin payı eklenir (tam-map değil) —
      // başka sekmenin/istemcinin günleri asla ezilmez.
      daysIncrement: settled.perDay,
      allTimeIncrementSec: settled.segSec,
      settleId: crypto.randomUUID(),
      // "Son görülme" = son etkinlik anı (duraklatma saati).
      lastSeenAt: now,
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
    // persistSettle: dayanıklı (çevrimdışı/kapanışta yeniden dener/kuyruklar);
    // settled varsa settleId ile idempotent artımlı yazım.
    void persistSettle(user.uid, {
      isStudying: false,
      sessionStartedAt: null,
      sessionAccumulatedSec: 0,
      weekId: getWeekId(),
      weekTotalSec: weekTotalFromDays(
        settled ? settled.days : getStats(user).days,
      ),
      ...(settled
        ? {
            // ARTIMLI: yalnız bu segmentin payı (bkz. pause'daki not).
            daysIncrement: settled.perDay,
            allTimeIncrementSec: settled.segSec,
            settleId: crypto.randomUUID(),
          }
        : {}),
      // "Son görülme" = son çalışma girdisi (kronometrenin durdurulduğu an).
      lastSeenAt: now,
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

  // Koşan bacağın BUGÜNE/BU HAFTAYA düşen payı: gece yarısını veya Salı
  // 00:00'ı kesen seansta tüm bacak değil, yalnız sınır sonrası pay
  // eklenir (aksi halde "Bugün/Bu hafta" şişer ve milestone erken tetiklenir).
  const todayId = getDayId()
  const currentWeekId = getWeekId()
  let runningTodaySec = 0
  let runningWeekSec = 0
  if (state.status === 'running' && state.startedAt) {
    for (const { dayId, sec } of splitIntervalByDay(state.startedAt, now)) {
      if (dayId === todayId) runningTodaySec += sec
      if (getWeekId(new Date(`${dayId}T12:00:00+03:00`)) === currentWeekId) {
        runningWeekSec += sec
      }
    }
  }

  // Haftalık/günlük taban days'ten TÜRETİLİR (monotonik, düşmez). days
  // yalnızca settle'da değişir; weekId bağımlılığı, uygulama açıkken
  // Salı 00:00 geçilirse gösterimin yeni haftada sıfırlanmasını sağlar.
  const days = getStats(user).days
  const weekBaseSec = useMemo(
    () => weekTotalFromDays(days, currentWeekId),
    [days, currentWeekId],
  )
  const weekWithActiveSec = weekBaseSec + Math.floor(runningWeekSec)

  const todayBaseSec = Math.floor(days[todayId] ?? 0)
  const todayWithActiveSec = todayBaseSec + Math.floor(runningTodaySec)

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
