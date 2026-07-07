import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { formatClock, formatLastSeen, formatTimeOfDay } from '../lib/format'
import { getWeekId, previousWeekId } from '../lib/week'
import { weekTotalFromDays } from '../lib/stats'
import { db, REACTION_MAX_LEN, type UserProfile } from '../services/db'

/** Bir üyenin verilen haftadaki toplam süresi — üyenin `days` (günlük
 *  geçmiş) verisinden TÜRETİLİR. days monotonik olduğundan bu değer düşmez;
 *  bayat `weekTotalSec` alanına ya da `prevWeek*` snapshot'ına bağımlı
 *  değildir (o alanların çapraz-cihaz bozulması artık zararsız). */
function completedWeekTotal(m: UserProfile, weekId: string): number {
  return weekTotalFromDays(m.days, weekId)
}

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
  const [champBanner, setChampBanner] = useState(false)
  const [liveLeaderDismissed, setLiveLeaderDismissed] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Aynı hafta için ödülün iki kez yazılmasını engelleyen guard
  const awardedWeekRef = useRef<string | null>(null)

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

  // Bu oturumda afişi kapattığımız hafta (tekrar açılmasın)
  const dismissedWeekRef = useRef<string | null>(null)

  // Haftalık şampiyon tespiti: tamamlanmış haftanın birincisi kendi
  // şampiyonluk sayacını artırır (self-award — herkes yalnızca kendi
  // dokümanına yazabilir). Beraberlikte tüm en yüksekler şampiyon sayılır.
  useEffect(() => {
    if (members.length === 0) return
    const judge = previousWeekId(getWeekId())
    const self = members.find((m) => m.uid === user.uid)
    if (!self) return

    const myTotal = completedWeekTotal(self, judge)
    const maxTotal = Math.max(
      0,
      ...members.map((m) => completedWeekTotal(m, judge)),
    )
    const isChampion = maxTotal > 0 && myTotal === maxTotal
    if (!isChampion) return

    // Ödülü hafta başına yalnızca bir kez yaz
    if (self.lastChampionWeekId !== judge && awardedWeekRef.current !== judge) {
      awardedWeekRef.current = judge
      void db
        .updateUser(user.uid, {
          championshipCount: (self.championshipCount ?? 0) + 1,
          lastChampionWeekId: judge,
        })
        .catch(() => {})
    }
    // Bu oturumda kapatılmadıysa karşılama afişini göster
    if (dismissedWeekRef.current !== judge) setChampBanner(true)
  }, [members, user.uid])

  function dismissChampBanner() {
    dismissedWeekRef.current = previousWeekId(getWeekId())
    setChampBanner(false)
  }

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
      // Haftalık taban üyenin `days`'inden TÜRETİLİR (monotonik, düşmez;
      // bayat weekTotalSec alanına bağımsız). Salı sıfırlaması otomatik:
      // yeni haftada henüz gün yoktur.
      const base = weekTotalFromDays(m.days, currentWeekId)
      const running =
        m.isStudying && m.sessionStartedAt
          ? (now - m.sessionStartedAt) / 1000
          : 0
      return {
        ...m,
        // NOT sessionAccumulatedSec: weekTotalSec artık her duraklatmada
        // (settleSegment ile) güncel tutuluyor; ayrıca eklemek çift sayım
        // olurdu. sessionAccumulatedSec yalnızca çapraz-cihaz devralma için
        // senkronize edilmeye devam eder, burada kullanılmaz.
        liveSec: Math.max(0, Math.floor(base + running)),
        // Bu üyeye gelen aktif tepkilerin son 2'si
        bubbles: activeReactions.filter((r) => r.toUid === m.uid).slice(-2),
        // Çalışmıyorsa (duraklatılmış veya durdurulmuş) WhatsApp tarzı "son
        // görülme" — duraklatma/durdurma saatini gösterir; kendi satırında
        // gösterilmez.
        lastSeenText:
          m.uid !== user.uid && !m.isStudying ? formatLastSeen(m.lastSeenAt, now) : null,
      }
    })
    .sort((a, b) => b.liveSec - a.liveSec)

  // Anlık lider: bu haftaki canlı sıralamada 1. sıradaki (süresi > 0 olan)
  const leader = rows.length > 0 && rows[0].liveSec > 0 ? rows[0] : null
  const isLiveLeader = leader?.uid === user.uid

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

      {champBanner ? (
        <div className="champ-banner" role="status">
          <span className="champ-banner-text">
            🏆 Bravo! Bu haftanın şampiyonu sensin!
          </span>
          <button
            type="button"
            className="champ-banner-close"
            onClick={dismissChampBanner}
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
      ) : (
        isLiveLeader &&
        !liveLeaderDismissed && (
          <div className="champ-banner champ-banner-live" role="status">
            <span className="champ-banner-text">
              🔥 Şu an bu haftanın lidersin! Zirveyi koru 👑
            </span>
            <button
              type="button"
              className="champ-banner-close"
              onClick={() => setLiveLeaderDismissed(true)}
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
        )
      )}

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
                  {i === 0 && m.liveSec > 0 && (
                    <span
                      className="board-crown"
                      title="Bu haftanın lideri"
                      aria-label="lider"
                    >
                      👑{' '}
                    </span>
                  )}
                  {m.name}
                  {m.uid === user.uid && (
                    <span className="board-you"> (sen)</span>
                  )}
                  {m.championshipCount > 0 && (
                    <span
                      className="board-champ"
                      title={`${m.championshipCount} kez haftanın şampiyonu`}
                    >
                      🏆 {m.championshipCount}
                    </span>
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
