// ============================================================
// Veri katmanı soyutlaması
//
// Tek arayüz (Backend), iki uygulama:
//   - FirebaseBackend (firebaseBackend.ts): Anonymous Auth +
//     Firestore; YALNIZCA config doluysa DİNAMİK import ile
//     yüklenir — yerel modda firebase chunk'ı ağa hiç inmez.
//   - LocalBackend (bu dosya): Firebase yapılandırılmamışken
//     localStorage tabanlı tek kullanıcılık "yerel mod".
// ============================================================

import { isFirebaseConfigured } from '../firebase-config'
import {
  ALREADY_IN_ROOM,
  emptyProfile,
  generateRoomCode,
  ROOM_NOT_FOUND,
  REACTION_MAX_LEN,
  REACTION_TTL_MS,
  type Backend,
  type Reaction,
  type Room,
  type Unsubscribe,
  type UserPatch,
  type UserProfile,
} from './shared'

export type {
  Backend,
  Reaction,
  Room,
  Unsubscribe,
  UserPatch,
  UserProfile,
} from './shared'
export { ALREADY_IN_ROOM, REACTION_MAX_LEN, REACTION_TTL_MS } from './shared'

// ---------- Yerel mod ----------

const LOCAL_KEY = 'kpss.user'
const LOCAL_ROOMS_KEY = 'kpss.rooms'
const LOCAL_REACTIONS_KEY = 'kpss.reactions'

function localUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

class LocalBackend implements Backend {
  readonly kind = 'local' as const

  // Aynı sekmedeki canlı dinleyiciler (localStorage 'storage' olayı
  // kendi sekmesinde tetiklenmediği için elle yayınlanır).
  private memberListeners = new Set<() => void>()
  private roomListeners = new Set<() => void>()
  private reactionListeners = new Set<() => void>()

  private readRooms(): Room[] {
    try {
      const raw = localStorage.getItem(LOCAL_ROOMS_KEY)
      return raw ? (JSON.parse(raw) as Room[]) : []
    } catch {
      return []
    }
  }

  private writeRooms(rooms: Room[]): void {
    localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms))
    this.roomListeners.forEach((emit) => emit())
  }

  async resolveSession(): Promise<UserProfile | null> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<UserProfile>
      if (!parsed.uid || !parsed.name) return null
      return { ...emptyProfile(parsed.uid, parsed.name), ...parsed } as UserProfile
    } catch {
      return null
    }
  }

  async register(name: string): Promise<UserProfile> {
    const profile = emptyProfile(localUid(), name)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(profile))
    return profile
  }

  async updateUser(uid: string, patch: UserPatch): Promise<void> {
    const current = await this.resolveSession()
    if (!current || current.uid !== uid) return
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...current, ...patch }))
    this.memberListeners.forEach((emit) => emit())
  }

  /** Tek oda kuralı: kullanıcı zaten bir odadaysa hata. */
  private async assertNotInRoom(uid: string): Promise<void> {
    if ((await this.listRooms(uid)).length > 0) {
      throw new Error(ALREADY_IN_ROOM)
    }
  }

  async createRoom(uid: string, name: string): Promise<Room> {
    await this.assertNotInRoom(uid)
    const room: Room = {
      id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      code: generateRoomCode(),
      ownerUid: uid,
      memberUids: [uid],
      createdAt: Date.now(),
    }
    this.writeRooms([...this.readRooms(), room])
    const user = await this.resolveSession()
    if (user && !user.roomIds.includes(room.id)) {
      await this.updateUser(uid, { roomIds: [...user.roomIds, room.id] })
    }
    return room
  }

  async joinRoom(uid: string, code: string): Promise<Room> {
    await this.assertNotInRoom(uid)
    const room = this.readRooms().find((r) => r.code === code.toUpperCase())
    // Yerel modda yalnızca bu cihazda kurulan odalar bulunabilir.
    if (!room) throw new Error(ROOM_NOT_FOUND)
    if (!room.memberUids.includes(uid)) {
      room.memberUids.push(uid)
      this.writeRooms(this.readRooms().map((r) => (r.id === room.id ? room : r)))
    }
    return room
  }

  async leaveRoom(uid: string, roomId: string): Promise<void> {
    const rooms = this.readRooms()
    const room = rooms.find((r) => r.id === roomId)
    if (room) {
      room.memberUids = room.memberUids.filter((u) => u !== uid)
      // Üye kalmadıysa odayı tümden temizle (yerel modda cihaza özel).
      const next = room.memberUids.length
        ? rooms.map((r) => (r.id === roomId ? room : r))
        : rooms.filter((r) => r.id !== roomId)
      this.writeRooms(next)
    }
    const user = await this.resolveSession()
    if (user && user.uid === uid && user.roomIds.includes(roomId)) {
      await this.updateUser(uid, {
        roomIds: user.roomIds.filter((id) => id !== roomId),
      })
    }
  }

  async listRooms(uid: string): Promise<Room[]> {
    return this.readRooms().filter((r) => r.memberUids.includes(uid))
  }

  subscribeRoom(roomId: string, cb: (room: Room | null) => void): Unsubscribe {
    const emit = () => {
      cb(this.readRooms().find((r) => r.id === roomId) ?? null)
    }
    emit()
    this.roomListeners.add(emit)
    return () => this.roomListeners.delete(emit)
  }

  subscribeMembers(
    memberUids: string[],
    cb: (members: UserProfile[]) => void,
  ): Unsubscribe {
    const emit = () => {
      void this.resolveSession().then((user) => {
        cb(user && memberUids.includes(user.uid) ? [user] : [])
      })
    }
    emit()
    this.memberListeners.add(emit)
    return () => this.memberListeners.delete(emit)
  }

  private readReactions(): Reaction[] {
    try {
      const raw = localStorage.getItem(LOCAL_REACTIONS_KEY)
      const list = raw ? (JSON.parse(raw) as Reaction[]) : []
      // Süresi geçenler okurken ayıklanır
      return list.filter((r) => r.expireAt > Date.now())
    } catch {
      return []
    }
  }

  async sendReaction(
    roomId: string,
    fromUid: string,
    fromName: string,
    toUid: string,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim().slice(0, REACTION_MAX_LEN)
    if (!trimmed) return
    const now = Date.now()
    const reaction: Reaction = {
      id: `re-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      fromUid,
      fromName,
      toUid,
      text: trimmed,
      createdAt: now,
      expireAt: now + REACTION_TTL_MS,
    }
    localStorage.setItem(
      LOCAL_REACTIONS_KEY,
      JSON.stringify([...this.readReactions(), reaction]),
    )
    this.reactionListeners.forEach((emit) => emit())
  }

  subscribeReactions(
    roomId: string,
    cb: (reactions: Reaction[]) => void,
  ): Unsubscribe {
    const emit = () => cb(this.readReactions().filter((r) => r.roomId === roomId))
    emit()
    this.reactionListeners.add(emit)
    return () => this.reactionListeners.delete(emit)
  }
}

// ---------- Aktif backend (facade) ----------

export const isLocalMode = !isFirebaseConfigured()

const localBackend = new LocalBackend()
let firebasePromise: Promise<Backend> | null = null

function getBackend(): Promise<Backend> {
  if (isLocalMode) return Promise.resolve(localBackend)
  firebasePromise ??= import('./firebaseBackend').then((m) =>
    m.createFirebaseBackend(),
  )
  return firebasePromise
}

/**
 * Dış dünyaya tek nesne: metodlar gerçek backend'i (gerekirse dinamik
 * yükleyip) çağırır. subscribe* çağrıları senkron bir unsubscribe
 * döndürür; backend hazır olmadan iptal edilirse dinleyici hiç kurulmaz.
 */
export const db: Backend = {
  kind: isLocalMode ? 'local' : 'firebase',
  resolveSession: () => getBackend().then((b) => b.resolveSession()),
  register: (name) => getBackend().then((b) => b.register(name)),
  updateUser: (uid, patch) => getBackend().then((b) => b.updateUser(uid, patch)),
  createRoom: (uid, name) => getBackend().then((b) => b.createRoom(uid, name)),
  joinRoom: (uid, code) => getBackend().then((b) => b.joinRoom(uid, code)),
  leaveRoom: (uid, roomId) => getBackend().then((b) => b.leaveRoom(uid, roomId)),
  listRooms: (uid) => getBackend().then((b) => b.listRooms(uid)),
  subscribeRoom(roomId, cb) {
    let unsub: Unsubscribe | null = null
    let cancelled = false
    void getBackend().then((b) => {
      if (!cancelled) unsub = b.subscribeRoom(roomId, cb)
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  },
  subscribeMembers(memberUids, cb) {
    let unsub: Unsubscribe | null = null
    let cancelled = false
    void getBackend().then((b) => {
      if (!cancelled) unsub = b.subscribeMembers(memberUids, cb)
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  },
  sendReaction: (roomId, fromUid, fromName, toUid, text) =>
    getBackend().then((b) => b.sendReaction(roomId, fromUid, fromName, toUid, text)),
  subscribeReactions(roomId, cb) {
    let unsub: Unsubscribe | null = null
    let cancelled = false
    void getBackend().then((b) => {
      if (!cancelled) unsub = b.subscribeReactions(roomId, cb)
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  },
}
