// ============================================================
// Veri katmanı soyutlaması
//
// Tek arayüz (Backend), iki uygulama:
//   - FirebaseBackend: Anonymous Auth + Firestore users/{uid}
//   - LocalBackend:    Firebase yapılandırılmamışken localStorage
//                      tabanlı tek kullanıcılık "yerel mod"
//
// Sonraki fazlar (kronometre, odalar) bu arayüzün üstüne kurulur.
// ============================================================

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { firebaseAuth, firebaseDb } from '../firebase'
import { isFirebaseConfigured } from '../firebase-config'

export interface UserProfile {
  uid: string
  name: string
  weekId: string // Faz 3'te getWeekId() ile doldurulacak
  weekTotalSec: number
  isStudying: boolean
  sessionStartedAt: number | null // epoch ms
  sessionAccumulatedSec: number
  roomIds: string[]
}

export type UserPatch = Partial<Omit<UserProfile, 'uid'>>

export interface Backend {
  readonly kind: 'firebase' | 'local'
  /** Kalıcı oturumu çözer; kayıtlı kullanıcı yoksa null (Welcome gösterilir). */
  resolveSession(): Promise<UserProfile | null>
  /** İsimle ilk kaydı yapar ve profili döndürür. */
  register(name: string): Promise<UserProfile>
  /** Kullanıcı belgesini kısmi günceller. */
  updateUser(uid: string, patch: UserPatch): Promise<void>
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

// ---------- Firebase ----------

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
    return {
      uid,
      name: d.name,
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
}

// ---------- Yerel mod ----------

const LOCAL_KEY = 'kpss.user'

function localUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

class LocalBackend implements Backend {
  readonly kind = 'local' as const

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
  }
}

// ---------- Aktif backend ----------

export const db: Backend = isFirebaseConfigured()
  ? new FirebaseBackend()
  : new LocalBackend()

export const isLocalMode = db.kind === 'local'
