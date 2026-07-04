import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { formatClock, formatLastSeen, formatTimeOfDay } from '../lib/format'
import { getWeekId } from '../lib/week'
import { db, REACTION_MAX_LEN, type UserProfile } from '../services/db'

interface ScoreboardProps {
  user: UserProfile
  roomId: string
  /** Odadan ayrılınca çağrılır (App oda listesini tazeler). */
  onLeft: () => void
}

// Hazır tepkiler: dokununca doğrudan gönderilir
const QUICK_REACTIONS = [
  'Harikasın! 👏',
  'Devam! 🔥',
  'Mola ver 😅',
  'Yetişiyorum! 🏃',
]
const QUICK_EMOJIS = ['👏', '🔥', '💪', '🎯', '⭐', '☕']

export default function Scoreboard({ user, roomId, onLeft }: ScoreboardProps) {
  const { room, members, reactions } = useRoom(roomId)
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [reactTarget, setReactTarget] = useState<string | null>(null)
  const [reactText, setReactText] = useState('')
  const [, setTick] = useState(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Canlı akış: çalışan üyelerin süresi istemcide her saniye
  // yerel olarak hesaplanır — Firestore'a saniyelik yazım yok.
  // Aynı tik, süresi dolan tepkileri de görünümden düşürür.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Onay bekleyen "Ayrıl" ~3 sn dokunulmazsa eski haline döner
  useEffect(() => {
    if (!confirmLeave) return
    confirmTimer.current = setTimeout(() => setConfirmLeave(false), 3000)
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [confirmLeave])

  async function handleLeave() {
    if (leaving) return
    if (!confirmLeave) {
      setConfirmLeave(true)
      return
    }
    setLeaving(true)
    setLeaveError('')
    try {
      await db.leaveRoom(user.uid, roomId)
      onLeft()
    } catch {
      setLeaving(false)
      setConfirmLeave(false)
      setLeaveError(
        'Ayrılamadın — bağlantını kontrol edip tekrar dene. Sorun sürerse ' +
          'güvenlik kuralları (firestore.rules) güncel olmayabilir.',
      )
    }
  }

  async function copyCode() {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* izin yok */
    }
  }

  function toggleReactPanel(memberUid: string) {
    if (memberUid === user.uid) return // kendine tepki yok
    setReactText('')
    setReactTarget((prev) => (prev === memberUid ? null : memberUid))
  }

  function sendReaction(toUid: string, text: string) {
    const trimmed = text.trim().slice(0, REACTION_MAX_LEN)
    if (!trimmed) return
    // Panel anında kapanır; gönderim arka planda. Onay, balonun canlı
    // dinleyiciyle görünmesidir (çevrimdışıysa balon çıkmaz, tekrar denenir).
    setReactTarget(null)
    setReactText('')
    void db.sendReaction(roomId, user.uid, user.name, toUid, trimmed).catch(() => {})
  }

  const now = Date.now()
  const currentWeekId = getWeekId()
  const activeReactions = reactions.filter((r) => r.expireAt > now)

  const rows = members
    .map((m) => {
      // weekId güncel hafta değilse toplam 0 sayılır (Salı sıfırlaması)
      const base = m.weekId === currentWeekId ? m.weekTotalSec : 0
      const running =
        m.isStudying && m.sessionStartedAt
          ? (now - m.sessionStartedAt) / 1000
          : 0
      return {
        ...m,
        liveSec: Math.max(0, Math.floor(base + m.sessionAccumulatedSec + running)),
        // Bu üyeye gelen aktif tepkilerin son 2'si
        bubbles: activeReactions.filter((r) => r.toUid === m.uid).slice(-2),
        // Çalışmıyorsa WhatsApp tarzı "son görülme" (kendi satırında gösterilmez)
        lastSeenText:
          m.uid !== user.uid && !m.isStudying ? formatLastSeen(m.lastSeenAt, now) : null,
      }
    })
    .sort((a, b) => b.liveSec - a.liveSec)

  return (
    <main className="page board-page">
      <header className="board-header">
        <div className="board-title">
          <h1 className="page-title">{room ? room.name : 'Oda'}</h1>
          {room && (
            <button type="button" className="code-chip" onClick={copyCode}>
              {copied ? 'Kopyalandı!' : `Kod: ${room.code}`}
            </button>
          )}
        </div>
      </header>

      <div className="board-list">
        {rows.length === 0 && <p className="board-empty">Üyeler yükleniyor…</p>}
        {rows.map((m, i) => (
          <div key={m.uid} className="board-item">
            <div
              className={`board-row${m.uid === user.uid ? ' board-row-me' : ''}${
                m.uid !== user.uid ? ' board-row-tappable' : ''
              }`}
              role={m.uid !== user.uid ? 'button' : undefined}
              tabIndex={m.uid !== user.uid ? 0 : undefined}
              onClick={() => toggleReactPanel(m.uid)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleReactPanel(m.uid)
              }}
            >
              <span className={`board-rank${i < 3 ? ' board-rank-top' : ''}`}>
                {i + 1}
              </span>
              <span className="board-member">
                <span className="board-name">
                  {m.name}
                  {m.uid === user.uid && (
                    <span className="board-you"> (sen)</span>
                  )}
                </span>
                {m.isStudying && (
                  <span className="board-studying">
                    <span className="pulse-dot" aria-hidden="true" />
                    çalışıyor
                  </span>
                )}
                {m.lastSeenText && (
                  <span className="board-last-seen">
                    Son görülme: {m.lastSeenText}
                  </span>
                )}
              </span>
              <span className="board-time">{formatClock(m.liveSec)}</span>
            </div>

            {m.bubbles.length > 0 && (
              <div className="reaction-bubbles">
                {m.bubbles.map((r) => (
                  <span key={r.id} className="reaction-bubble">
                    <strong>{r.fromName}:</strong> {r.text}
                    <span className="reaction-time">
                      {' '}
                      · {formatTimeOfDay(r.createdAt)}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {reactTarget === m.uid && (
              <div className="reaction-panel">
                <form
                  className="reaction-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendReaction(m.uid, reactText)
                  }}
                >
                  <input
                    type="text"
                    className="text-input reaction-input"
                    placeholder={`${m.name} için bir mesaj…`}
                    value={reactText}
                    maxLength={REACTION_MAX_LEN}
                    autoFocus
                    onChange={(e) => setReactText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary reaction-send"
                    disabled={!reactText.trim()}
                  >
                    Gönder
                  </button>
                </form>
                <div className="reaction-chips">
                  {QUICK_REACTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="reaction-chip"
                      onClick={() => sendReaction(m.uid, q)}
                    >
                      {q}
                    </button>
                  ))}
                  {QUICK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="reaction-chip reaction-chip-emoji"
                      onClick={() => sendReaction(m.uid, e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="reaction-hint">
                  Mesajlar 6 saat sonra kaybolur · en fazla {REACTION_MAX_LEN}{' '}
                  karakter
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="reset-note board-note">Salı 00:00'da sıfırlanır</p>

      {leaveError && <p className="form-error">{leaveError}</p>}
      <button
        type="button"
        className={`btn btn-wide board-leave${
          confirmLeave ? ' btn-danger' : ' btn-secondary'
        }`}
        onClick={handleLeave}
        disabled={leaving}
      >
        {leaving
          ? 'Ayrılıyor…'
          : confirmLeave
            ? 'Emin misin? Ayrıl'
            : 'Odadan Ayrıl'}
      </button>
    </main>
  )
}
