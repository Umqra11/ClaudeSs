import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { formatClock } from '../lib/format'
import { getWeekId } from '../lib/week'
import { db, type UserProfile } from '../services/db'

interface ScoreboardProps {
  user: UserProfile
  roomId: string
  onBack: () => void
}

export default function Scoreboard({ user, roomId, onBack }: ScoreboardProps) {
  const { room, members } = useRoom(roomId)
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [, setTick] = useState(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    try {
      await db.leaveRoom(user.uid, roomId)
      onBack()
    } catch {
      setLeaving(false)
      setConfirmLeave(false)
    }
  }

  // Canlı akış: çalışan üyelerin süresi istemcide her saniye
  // yerel olarak hesaplanır — Firestore'a saniyelik yazım yok.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

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

  const now = Date.now()
  const currentWeekId = getWeekId()
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
      }
    })
    .sort((a, b) => b.liveSec - a.liveSec)

  return (
    <main className="page board-page">
      <header className="board-header">
        <button
          type="button"
          className="back-btn"
          onClick={onBack}
          aria-label="Geri"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
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
          <div
            key={m.uid}
            className={`board-row${m.uid === user.uid ? ' board-row-me' : ''}`}
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
            </span>
            <span className="board-time">{formatClock(m.liveSec)}</span>
          </div>
        ))}
      </div>

      <p className="reset-note board-note">Salı 00:00'da sıfırlanır</p>

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
