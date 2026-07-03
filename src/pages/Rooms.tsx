import { useState, type FormEvent } from 'react'
import { db, type Room, type UserProfile } from '../services/db'

// Tek oda modeli: bu ekran yalnızca ODASI OLMAYAN kullanıcıya görünür.
// Oda kurulunca/katılınca onChanged() çağrılır; App oda listesini
// tazeleyip doğrudan liderlik tablosunu (Scoreboard) gösterir.

type View = 'list' | 'create' | 'created' | 'join'

interface RoomsProps {
  user: UserProfile
  onChanged: () => void
}

function PeopleIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="3.5" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M17.5 14.7c1.8.5 3 1.9 3 3.8" />
    </svg>
  )
}

export default function Rooms({ user, onChanged }: RoomsProps) {
  const [view, setView] = useState<View>('list')
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null)
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const name = roomName.trim().slice(0, 40)
    if (!name || busy) return
    setBusy(true)
    setError('')
    try {
      const room = await db.createRoom(user.uid, name)
      setCreatedRoom(room)
      setRoomName('')
      setView('created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oda kurulamadı, tekrar dene')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      await db.joinRoom(user.uid, code)
      setJoinCode('')
      onChanged() // App taze listeyi çekip Scoreboard'u açar
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir şeyler ters gitti')
    } finally {
      setBusy(false)
    }
  }

  async function shareCode(room: Room) {
    const text = `KPSS Takip odama katıl! Oda: ${room.name} — Kod: ${room.code}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(room.code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* kullanıcı iptal etti veya izin yok */
    }
  }

  function backToList() {
    setView('list')
    setError('')
    setCopied(false)
  }

  // ---- Oda Kur ----
  if (view === 'create') {
    return (
      <main className="page rooms-page">
        <h1 className="page-title">Oda Kur</h1>
        <form className="welcome-form room-form" onSubmit={handleCreate}>
          <input
            type="text"
            className="text-input"
            placeholder="Oda adı (örn. Hedef 90+)"
            value={roomName}
            maxLength={40}
            autoFocus
            onChange={(e) => setRoomName(e.target.value)}
          />
          {error && <p className="form-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-wide"
            disabled={!roomName.trim() || busy}
          >
            {busy ? 'Kuruluyor…' : 'Oluştur'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={backToList}
          >
            Vazgeç
          </button>
        </form>
      </main>
    )
  }

  // ---- Oda kuruldu: kod ekranı ----
  if (view === 'created' && createdRoom) {
    return (
      <main className="page rooms-page">
        <h1 className="page-title">{createdRoom.name}</h1>
        <div className="empty-state">
          <p>Arkadaşların bu kodla katılabilir:</p>
          <div className="code-display">{createdRoom.code}</div>
          <p className="reset-note">
            {copied ? 'Kopyalandı!' : 'Kodu paylaş, birlikte çalışın.'}
          </p>
        </div>
        <div className="rooms-actions">
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => shareCode(createdRoom)}
          >
            Kodu Kopyala
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={onChanged}
          >
            Odaya Git
          </button>
        </div>
      </main>
    )
  }

  // ---- Odaya Katıl ----
  if (view === 'join') {
    return (
      <main className="page rooms-page">
        <h1 className="page-title">Odaya Katıl</h1>
        <form className="welcome-form room-form" onSubmit={handleJoin}>
          <input
            type="text"
            className="text-input code-input"
            placeholder="6 haneli kod"
            value={joinCode}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          {error && <p className="form-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-wide"
            disabled={joinCode.trim().length !== 6 || busy}
          >
            {busy ? 'Katılıyor…' : 'Katıl'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={backToList}
          >
            Vazgeç
          </button>
        </form>
      </main>
    )
  }

  // ---- Boş durum: henüz odası yok ----
  return (
    <main className="page rooms-page">
      <h1 className="page-title">Odalar</h1>

      <div className="empty-state">
        <div className="empty-state-icon">
          <PeopleIcon />
        </div>
        <h2>Henüz bir odan yok</h2>
        <p>
          Bir oda kur ya da koduyla arkadaşının odasına katıl. Aynı anda tek
          odada olabilirsin.
        </p>
      </div>

      <div className="rooms-actions">
        <button
          type="button"
          className="btn btn-primary btn-wide"
          onClick={() => setView('create')}
        >
          Oda Kur
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-wide"
          onClick={() => setView('join')}
        >
          Odaya Katıl
        </button>
      </div>
    </main>
  )
}
