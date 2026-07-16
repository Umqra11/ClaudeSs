// FirebaseBackend — yalnızca config doluyken dinamik import ile yüklenir
// (bkz. db.ts). Böylece yerel modda firebase chunk'ı ağa hiç inmez.

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
    days: d.days ?? {},
    allTimeSec: d.allTimeSec ?? 0,
    lastSeenAt: d.lastSeenAt instanceof Timestamp ? d.lastSeenAt.toMillis() : null,
    championshipCount: d.championshipCount ?? 0,
    lastChampionWeekId: d.lastChampionWeekId ?? null,
    prevWeekId: d.prevWeekId ?? null,
    prevWeekTotalSec: d.prevWeekTotalSec ?? 0,
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
      days: {},
      allTimeSec: 0,
      lastSeenAt: null, // henüz çalışma girdisi yok
      championshipCount: 0,
      lastChampionWeekId: null,
      prevWeekId: null,
      prevWeekTotalSec: 0,
      updatedAt: serverTimestamp(),
    })
    return emptyProfile(uid, name)
  }

  async updateUser(uid: string, patch: UserPatch): Promise<void> {
    const { daysIncrement, allTimeIncrementSec, ...rest } = patch
    const data: Record<string, unknown> = {
      ...rest,
      updatedAt: serverTimestamp(),
    }
    if ('sessionStartedAt' in rest) {
      data.sessionStartedAt =
        rest.sessionStartedAt == null
          ? null
          : Timestamp.fromMillis(rest.sessionStartedAt)
    }
    if ('lastSeenAt' in rest) {
      data.lastSeenAt =
        rest.lastSeenAt == null ? null : Timestamp.fromMillis(rest.lastSeenAt)
    }
    // Artımlı yazımlar: dot-path + increment ile ALAN BAZINDA eklenir —
    // bayat bir istemci kopyası diğer sekmenin/istemcinin günlerini ezemez.
    if (daysIncrement) {
      for (const [dayId, sec] of Object.entries(daysIncrement)) {
        const rounded = Math.round(sec)
        if (rounded > 0) data[`days.${dayId}`] = increment(rounded)
      }
    }
    if (allTimeIncrementSec && allTimeIncrementSec > 0) {
      data.allTimeSec = increment(Math.round(allTimeIncrementSec))
    }
    await updateDoc(doc(this.db, 'users', uid), data)
  }

  /** Tek oda kuralı: kullanıcı zaten bir odadaysa hata. */
  private async assertNotInRoom(uid: string): Promise<void> {
    if ((await this.listRooms(uid)).length > 0) {
      throw new Error(ALREADY_IN_ROOM)
    }
  }

  async createRoom(uid: string, name: string): Promise<Room> {
    await this.assertNotInRoom(uid)
    const roomRef = doc(collection(this.db, 'rooms'))
    const code = generateRoomCode()
    await setDoc(roomRef, {
      name,
      code,
      ownerUid: uid,
      memberUids: [uid],
      createdAt: serverTimestamp(),
    })
    // roomIds bilgilendirme amaçlı (listeleme memberUids sorgusuyla);
    // kullanıcıyı bekletmemek için arka planda yazılır.
    void updateDoc(doc(this.db, 'users', uid), {
      roomIds: arrayUnion(roomRef.id),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
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
    // Tek oda kontrolü ile kod sorgusu paralel — bir tur ağ beklemesi azalır
    const q = query(
      collection(this.db, 'rooms'),
      where('code', '==', code.toUpperCase()),
    )
    const [, snaps] = await Promise.all([this.assertNotInRoom(uid), getDocs(q)])
    if (snaps.empty) throw new Error(ROOM_NOT_FOUND)
    const snap = snaps.docs[0]
    await updateDoc(snap.ref, { memberUids: arrayUnion(uid) })
    void updateDoc(doc(this.db, 'users', uid), {
      roomIds: arrayUnion(snap.id),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
    const room = mapRoomDoc(snap.id, snap.data())
    if (!room.memberUids.includes(uid)) room.memberUids.push(uid)
    return room
  }

  async leaveRoom(uid: string, roomId: string): Promise<void> {
    const roomRef = doc(this.db, 'rooms', roomId)
    // Son üye ayrılıyorsa odayı tümden sil — boş/yetim odalar ve
    // kullanılmış kodlar Firestore'da sonsuza dek birikmesin.
    const snap = await getDoc(roomRef)
    const members: string[] = snap.exists() ? (snap.data().memberUids ?? []) : []
    if (members.length === 1 && members[0] === uid) {
      await deleteDoc(roomRef)
    } else {
      // Kritik yazım: oda belgesinden kendini çıkar (hata görünür kalmalı).
      await updateDoc(roomRef, { memberUids: arrayRemove(uid) })
    }
    // roomIds temizliği arka planda — kullanıcı bekletilmez.
    void updateDoc(doc(this.db, 'users', uid), {
      roomIds: arrayRemove(roomId),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
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

  async sendReaction(
    roomId: string,
    fromUid: string,
    fromName: string,
    toUid: string,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim().slice(0, REACTION_MAX_LEN)
    if (!trimmed) return
    await addDoc(collection(this.db, 'reactions'), {
      roomId,
      fromUid,
      fromName,
      toUid,
      text: trimmed,
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + REACTION_TTL_MS),
    })
  }

  // Bu oturumda silmeyi denediğimiz süresi-dolmuş tepkiler (tekrar tekrar
  // denememek için). Silme "fırsatçı temizlik"tir: kurallar süresi dolmuş
  // belgeyi herkese sildirtir; Console'da TTL politikası kurmak GEREKMEZ.
  private cleanedReactionIds = new Set<string>()

  subscribeReactions(
    roomId: string,
    cb: (reactions: Reaction[]) => void,
  ): Unsubscribe {
    // Yalnızca roomId eşitliği: otomatik tek-alan index yeterlidir,
    // composite index / konsol adımı GEREKTİRMEZ. Süresi geçenler görünüm
    // katmanında süzülür; kalıcılığı da aşağıdaki fırsatçı silme temizler.
    const q = query(
      collection(this.db, 'reactions'),
      where('roomId', '==', roomId),
    )
    return onSnapshot(q, (snaps) => {
      const now = Date.now()
      let cleanupBudget = 20 // tek snapshot'ta en fazla 20 silme (patlama olmasın)
      const list: Reaction[] = snaps.docs.map((s) => {
        const d = s.data()
        const expireAtMs =
          d.expireAt instanceof Timestamp ? d.expireAt.toMillis() : 0
        // Süresi dolmuş belgeyi arka planda sil (en-iyi-çaba; kural henüz
        // yayınlanmadıysa veya yarışta başkası sildiyse sessizce geçilir).
        if (
          expireAtMs <= now &&
          cleanupBudget > 0 &&
          !this.cleanedReactionIds.has(s.id)
        ) {
          cleanupBudget--
          this.cleanedReactionIds.add(s.id)
          void deleteDoc(s.ref).catch(() => {})
        }
        return {
          id: s.id,
          roomId: d.roomId ?? '',
          fromUid: d.fromUid ?? '',
          fromName: d.fromName ?? '',
          toUid: d.toUid ?? '',
          text: d.text ?? '',
          createdAt:
            d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
          expireAt: expireAtMs,
        }
      })
      cb(list.sort((a, b) => a.createdAt - b.createdAt))
    })
  }
}

export function createFirebaseBackend(): Backend {
  return new FirebaseBackend()
}
