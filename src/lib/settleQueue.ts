// ============================================================
// Dayanıklı settle (duraklat/durdur) yazımı.
//
// Sorun: pause/stop'un `daysIncrement` yazımı çevrimdışı/uygulama-kapanışında
// düşerse, kişinin süresi başkalarında EKSİK görünür (kendi cihazında getStats
// cache'inde yüksek kalır ama Firestore'a hiç ulaşmaz).
//
// Çözüm: settle yazımlarını buradan geçir — sınırlı yeniden-deneme, hâlâ
// başarısızsa localStorage kuyruğuna koy; `online` / sekme yeniden görünür /
// açılış tetikleyicilerinde kuyruğu boşalt. Her settle benzersiz bir
// `settleId` taşır; backend aynı settleId'yi BİR KEZ uygular (bkz.
// firebaseBackend/db.updateUser) → tekrar-oynatma çift saymaz.
// ============================================================

import { db, type UserPatch } from '../services/db'

const PENDING_KEY = 'kpss.pendingSettles'
const RETRY_DELAYS = [2000, 4000, 8000] // ms — geri çekilmeli

interface PendingSettle {
  uid: string
  patch: UserPatch // settleId içerir
}

function readPending(): PendingSettle[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingSettle[]) : []
  } catch {
    return []
  }
}

function writePending(list: PendingSettle[]): void {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    /* kota vb. — yut */
  }
}

function enqueue(item: PendingSettle): void {
  const list = readPending()
  // Aynı settleId zaten kuyruktaysa tekrar ekleme
  if (item.patch.settleId && list.some((p) => p.patch.settleId === item.patch.settleId)) {
    return
  }
  list.push(item)
  writePending(list)
}

function dequeue(settleId: string | undefined): void {
  if (!settleId) return
  writePending(readPending().filter((p) => p.patch.settleId !== settleId))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Settle yazımını dayanıklı biçimde uygular: sınırlı yeniden-deneme; tümü
 * başarısızsa kuyruğa koyar (sonraki tetikte flush edilir). settleId sayesinde
 * tekrarlar çift saymaz. Çağrı bloke etmez (pause/stop UI zaten güncellendi).
 */
export async function persistSettle(uid: string, patch: UserPatch): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await db.updateUser(uid, patch)
      dequeue(patch.settleId) // daha önce kuyruğa girmiş olabilir
      return
    } catch {
      if (attempt >= RETRY_DELAYS.length) {
        enqueue({ uid, patch })
        return
      }
      await sleep(RETRY_DELAYS[attempt])
    }
  }
}

let flushing = false

/** Bekleyen tüm settle'ları yeniden dener (idempotent — güvenli). */
export async function flushPendingSettles(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const item of readPending()) {
      try {
        await db.updateUser(item.uid, item.patch)
        dequeue(item.patch.settleId)
      } catch {
        // Hâlâ başarısız — kuyrukta kalsın, bir sonraki tetikte tekrar denenir.
      }
    }
  } finally {
    flushing = false
  }
}

let installed = false

/** online / sekme-görünür / açılış tetikleyicilerini bir kez kurar. */
export function installSettleFlush(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const onFlush = () => void flushPendingSettles()
  window.addEventListener('online', onFlush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFlush()
  })
  onFlush() // açılışta bir kez
}
