// FirebaseBackend — yalnızca config doluyken dinamik import ile yüklenir
// (bkz. db.ts). Böylece yerel modda firebase chunk'ı ağa hiç inmez.

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
import {
  emptyProfile,
  generateRoomCode,
  ROOM_NOT_FOUND,
  type Backend,
  type Room,
  type Unsubscribe,
  type UserPatch,
  type UserProfile,
} from './shared'

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

export function createFirebaseBackend(): Backend {
  return new FirebaseBackend()
}
