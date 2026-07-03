// ============================================================
// Veri katmanı soyutlaması
//
// Tek arayüz (Backend), iki uygulama:
//   - FirebaseBackend: Anonymous Auth + Firestore users/{uid},
//     rooms/{roomId} ve onSnapshot canlı dinleyicileri
//   - LocalBackend:    Firebase yapılandırılmamışken localStorage
//     tabanlı tek kullanıcılık "yerel mod" (oda kurulabilir,
//     kullanıcı tek üye olur; UI Firebase olmadan test edilir)
// ============================================================

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { firebaseAuth, firebaseDb } from '../firebase'
import { isFirebaseConfigured } from '../firebase-config'

export interface UserProfile {
  uid: string
  name: string
  weekId: string
  weekTotalSec: number
  isStudying: boolean
  sessionStartedAt: number | null // epoch ms
  sessionAccumulatedSec: number
  roomIds: string[]
}

export interface Room {
  id: string
  name: string
  code: string
  ownerUid: string
  memberUids: string[]
  createdAt: number // epoch ms
}

export type UserPatch = Partial<Omit<UserProfile, 'uid'>>
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
  /** Kullanıcının üyesi olduğu odalar. */
  listRooms(uid: string): Promise<Room[]>
  /** Oda belgesini canlı dinler. */
  subscribeRoom(roomId: string, cb: (room: Room | null) => void): Unsubscribe
  /** Üye kullanıcı belgelerini canlı dinler (scoreboard). */
  subscribeMembers(
    memberUids: string[],
    cb: (members: UserProfile[]) => void,
  ): Unsubscribe
}

// Karışmayan karakterler: I, O, 0, 1 yok
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

function generateRoomCode(): string {
  const values = new Uint32Array(CODE_LENGTH)
  crypto.getRandomValues(values)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[values[i] % CODE_ALPHABET.length]
  }
  return out
}

function emptyProfile(uid: string, name: string): UserProfile {
  return {
    uid,
    name,
    weekId: '',
    weekTotalSec: 0,
    isStudying: false,
    sessionStartedAt: null,
    sessionAccumulatedSec: 0,
    roomIds: [],
  }
}

const ROOM_NOT_FOUND = 'Bu kodla bir oda bulunamadı'

// ---------- Firebase ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserDoc(uid: string, d: any): UserProfile {
  return {
    uid,
    name: d.name ?? '',
    weekId: d.weekId ?? '',
    weekTotalSec: d.weekTotalSec ?? 0,
    isStudying: d.isStudying ?? false,
    sessionStartedAt:
      d.sessionStartedAt instanceof Timestamp
        ? d.sessionStartedAt.toMillis()
        : null,
    sessionAccumulatedSec: d.sessionAccumulatedSec ?? 0,
    roomIds: d.roomIds ?? [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRoomDoc(id: string, d: any): Room {
  return {
    id,
    name: d.name ?? '',
    code: d.code ?? '',
    ownerUid: d.ownerUid ?? '',
    memberUids: d.memberUids ?? [],
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
  }
}

class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const
  private auth = firebaseAuth!
  private db = firebaseDb!

  /** Kalıcı (IndexedDB) anonim oturum varsa uid'ini bekleyip döndürür. */
  private currentUid(): Promise<string | null> {
    if (this.auth.currentUser) return Promise.resolve(this.auth.currentUser.uid)
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(this.auth, (user) => {
        unsub()
        resolve(user?.uid ?? null)
      })
    })
  }

  async resolveSession(): Promise<UserProfile | null> {
    const uid = await this.currentUid()
    if (!uid) return null
    const snap = await getDoc(doc(this.db, 'users', uid))
    if (!snap.exists()) return null
    const d = snap.data()
    if (!d.name) return null
    return mapUserDoc(uid, d)
  }

  async register(name: string): Promise<UserProfile> {
    const uid =
      (await this.currentUid()) ??
      (await signInAnonymously(this.auth)).user.uid
    await setDoc(doc(this.db, 'users', uid), {
      name,
      weekId: '',
      weekTotalSec: 0,
      isStudying: false,
      sessionStartedAt: null,
      sessionAccumulatedSec: 0,
      roomIds: [],
      updatedAt: serverTimestamp(),
    })
    return emptyProfile(uid, name)
  }

  async updateUser(uid: string, patch: UserPatch): Promise<void> {
    const data: Record<string, unknown> = {
      ...patch,
      updatedAt: serverTimestamp(),
    }
    if ('sessionStartedAt' in patch) {
      data.sessionStartedAt =
        patch.sessionStartedAt == null
          ? null
          : Timestamp.fromMillis(patch.sessionStartedAt)
    }
    await updateDoc(doc(this.db, 'users', uid), data)
  }

  async createRoom(uid: string, name: string): Promise<Room> {
    const roomRef = doc(collection(this.db, 'rooms'))
    const code = generateRoomCode()
    await setDoc(roomRef, {
      name,
      code,
      ownerUid: uid,
      memberUids: [uid],
      createdAt: serverTimestamp(),
    })
    await updateDoc(doc(this.db, 'users', uid), {
      roomIds: arrayUnion(roomRef.id),
      updatedAt: serverTimestamp(),
    })
    return {
      id: roomRef.id,
      name,
      code,
      ownerUid: uid,
      memberUids: [uid],
      createdAt: Date.now(),
    }
  }

  async joinRoom(uid: string, code: string): Promise<Room> {
    const q = query(
      collection(this.db, 'rooms'),
      where('code', '==', code.toUpperCase()),
    )
    const snaps = await getDocs(q)
    if (snaps.empty) throw new Error(ROOM_NOT_FOUND)
    const snap = snaps.docs[0]
    await updateDoc(snap.ref, { memberUids: arrayUnion(uid) })
    await updateDoc(doc(this.db, 'users', uid), {
      roomIds: arrayUnion(snap.id),
      updatedAt: serverTimestamp(),
    })
    const room = mapRoomDoc(snap.id, snap.data())
    if (!room.memberUids.includes(uid)) room.memberUids.push(uid)
    return room
  }

  async listRooms(uid: string): Promise<Room[]> {
    const q = query(
      collection(this.db, 'rooms'),
      where('memberUids', 'array-contains', uid),
    )
    const snaps = await getDocs(q)
    return snaps.docs
      .map((s) => mapRoomDoc(s.id, s.data()))
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  subscribeRoom(roomId: string, cb: (room: Room | null) => void): Unsubscribe {
    return onSnapshot(doc(this.db, 'rooms', roomId), (snap) => {
      cb(snap.exists() ? mapRoomDoc(snap.id, snap.data()) : null)
    })
  }

  subscribeMembers(
    memberUids: string[],
    cb: (members: UserProfile[]) => void,
  ): Unsubscribe {
    const found = new Map<string, UserProfile>()
    const emit = () => {
      cb(memberUids.filter((u) => found.has(u)).map((u) => found.get(u)!))
    }
    const unsubs = memberUids.map((uid) =>
      onSnapshot(doc(this.db, 'users', uid), (snap) => {
        if (snap.exists()) found.set(uid, mapUserDoc(uid, snap.data()))
        else found.delete(uid)
        emit()
      }),
    )
    return () => unsubs.forEach((unsub) => unsub())
  }
}

// ---------- Yerel mod ----------

const LOCAL_KEY = 'kpss.user'
const LOCAL_ROOMS_KEY = 'kpss.rooms'

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

  async createRoom(uid: string, name: string): Promise<Room> {
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
    const room = this.readRooms().find((r) => r.code === code.toUpperCase())
    // Yerel modda yalnızca bu cihazda kurulan odalar bulunabilir.
    if (!room) throw new Error(ROOM_NOT_FOUND)
    if (!room.memberUids.includes(uid)) {
      room.memberUids.push(uid)
      this.writeRooms(this.readRooms().map((r) => (r.id === room.id ? room : r)))
    }
    return room
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
}

// ---------- Aktif backend ----------

export const db: Backend = isFirebaseConfigured()
  ? new FirebaseBackend()
  : new LocalBackend()

export const isLocalMode = db.kind === 'local'
