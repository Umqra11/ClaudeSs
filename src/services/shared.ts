// Veri katmanının ortak tipleri ve yardımcıları.
// Firebase'e BAĞIMLI DEĞİLDİR — yerel modda firebase chunk'ı hiç yüklenmez.

export interface UserProfile {
  uid: string
  name: string
  weekId: string
  weekTotalSec: number
  isStudying: boolean
  sessionStartedAt: number | null // epoch ms
  sessionAccumulatedSec: number
  roomIds: string[]
  /** Günlük geçmiş: { '2026-07-03': saniye } (Istanbul günü). */
  days: Record<string, number>
  /** Tüm zamanlar toplam çalışma süresi (saniye). */
  allTimeSec: number
  /** Son çalışma girdisi: kronometrenin en son duraklatıldığı/durdurulduğu
   *  an (epoch ms). Liderlik tablosunda "Son görülme" olarak gösterilir.
   *  Aktif seans yokken en güncel etkinlik anını taşır; hiç çalışma
   *  girdisi yoksa / eski hesaplarda null. */
  lastSeenAt: number | null
  /** Toplam haftalık şampiyonluk sayısı (kaç kez haftanın birincisi oldu). */
  championshipCount: number
  /** En son şampiyonluk ödülü verilen hafta (weekId). Aynı hafta için
   *  ikinci kez ödül verilmesini önler. */
  lastChampionWeekId: string | null
  /** Bir önceki haftanın anahtarı — hafta devrinde weekTotalSec sıfırlanmadan
   *  önce alınan anlık kopya. Şampiyon tespiti bunu okur. */
  prevWeekId: string | null
  /** prevWeekId haftasının toplam çalışma süresi (saniye) — snapshot. */
  prevWeekTotalSec: number
}

export interface Room {
  id: string
  name: string
  code: string
  ownerUid: string
  memberUids: string[]
  createdAt: number // epoch ms
}

export type UserPatch = Partial<Omit<UserProfile, 'uid'>> & {
  /** Gün bazında ARTIMLI ekleme: { '2026-07-07': saniye }. Tam-map `days`
   *  yazımı yerine kullanılır — backend mevcut değerin ÜZERİNE ekler
   *  (Firestore'da dot-path + increment, yerel modda toplama). Böylece
   *  bayat bir sekme/istemci diğerinin günlerini ezemez. */
  daysIncrement?: Record<string, number>
  /** allTimeSec'e artımlı ekleme (saniye) — aynı gerekçe. */
  allTimeIncrementSec?: number
}
export type Unsubscribe = () => void

export interface Backend {
  readonly kind: 'firebase' | 'local'
  /** Kalıcı oturumu çözer; kayıtlı kullanıcı yoksa null (Welcome gösterilir). */
  resolveSession(): Promise<UserProfile | null>
  /** İsimle ilk kaydı yapar ve profili döndürür. */
  register(name: string): Promise<UserProfile>
  /** Kullanıcı belgesini kısmi günceller. */
  updateUser(uid: string, patch: UserPatch): Promise<void>
  /** Oda kurar: 6 haneli paylaşım kodu üretilir, kullanıcı tek üye olur. */
  createRoom(uid: string, name: string): Promise<Room>
  /** Kodla odaya katılır; oda yoksa Türkçe hata fırlatır. */
  joinRoom(uid: string, code: string): Promise<Room>
  /** Odadan ayrılır: kendini memberUids'ten ve roomIds'ten çıkarır. */
  leaveRoom(uid: string, roomId: string): Promise<void>
  /** Kullanıcının üyesi olduğu odalar. */
  listRooms(uid: string): Promise<Room[]>
  /** Oda belgesini canlı dinler. */
  subscribeRoom(roomId: string, cb: (room: Room | null) => void): Unsubscribe
  /** Üye kullanıcı belgelerini canlı dinler (scoreboard). */
  subscribeMembers(
    memberUids: string[],
    cb: (members: UserProfile[]) => void,
  ): Unsubscribe
  /** Bir üyeye tepki/mesaj bırakır (≤50 karakter, 6 saat yaşar). */
  sendReaction(
    roomId: string,
    fromUid: string,
    fromName: string,
    toUid: string,
    text: string,
  ): Promise<void>
  /** Odadaki tepkileri canlı dinler (süresi geçenler dahil olabilir;
   *  görünüm katmanı expireAt süzgecini uygular). */
  subscribeReactions(
    roomId: string,
    cb: (reactions: Reaction[]) => void,
  ): Unsubscribe
}

export const ROOM_NOT_FOUND = 'Bu kodla bir oda bulunamadı'
export const ALREADY_IN_ROOM = 'Zaten bir odadasın — önce mevcut odandan ayrıl'

/** Tepki mesajlarının yaşam süresi: 6 saat. */
export const REACTION_TTL_MS = 6 * 3_600_000
export const REACTION_MAX_LEN = 50

export interface Reaction {
  id: string
  roomId: string
  fromUid: string
  fromName: string
  toUid: string
  text: string
  createdAt: number // epoch ms
  expireAt: number // epoch ms
}

// Karışmayan karakterler: I, O, 0, 1 yok
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generateRoomCode(): string {
  const values = new Uint32Array(CODE_LENGTH)
  crypto.getRandomValues(values)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[values[i] % CODE_ALPHABET.length]
  }
  return out
}

export function emptyProfile(uid: string, name: string): UserProfile {
  return {
    uid,
    name,
    weekId: '',
    weekTotalSec: 0,
    isStudying: false,
    sessionStartedAt: null,
    sessionAccumulatedSec: 0,
    roomIds: [],
    days: {},
    allTimeSec: 0,
    lastSeenAt: null,
    championshipCount: 0,
    lastChampionWeekId: null,
    prevWeekId: null,
    prevWeekTotalSec: 0,
  }
}
