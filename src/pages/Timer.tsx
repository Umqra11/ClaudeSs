import { useRef, useState } from 'react'
import { isLocalMode, type UserProfile } from '../services/db'
import { useTimer } from '../hooks/useTimer'
import { useMilestone } from '../hooks/useMilestone'
import {
  earnedMilestones,
  nextMilestone,
  type Milestone,
} from '../lib/milestones'
import { formatClock, formatWeekTotal } from '../lib/format'

interface TimerProps {
  user: UserProfile
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Hazır',
  running: 'Çalışıyorsun',
  paused: 'Duraklatıldı',
}

interface StopSummary {
  sessionSec: number
  weekSec: number
  todaySec: number
  earned: Milestone[]
  newly: Milestone[]
  next: Milestone | null
}

export default function Timer({ user }: TimerProps) {
  const {
    status,
    elapsedSec,
    weekTotalSec,
    weekWithActiveSec,
    todayWithActiveSec,
    start,
    pause,
    resume,
    stop,
  } = useTimer(user)
  const milestone = useMilestone(user.uid, weekWithActiveSec)
  const [summary, setSummary] = useState<StopSummary | null>(null)

  // Seans BAŞINDAKİ haftalık taban: "yeni rozet" hesabı bunun üstünden
  // yapılır. (Duraklatmalar segmentleri anında kalıcılaştırdığı için
  // durdurma anındaki weekTotalSec seans-SONRASI değerdir — ona göre
  // kıyaslanırsa duraklatılıp durdurulan seansta yeni rozet hiç çıkmazdı.)
  const sessionWeekBaseRef = useRef<number | null>(null)

  function handleStart() {
    sessionWeekBaseRef.current = weekTotalSec
    start()
  }

  // Durdur: önce bu seansta/haftada kazanılan rozetleri hesapla, sonra
  // durdur ve kalıcı bir özet pop-up'ı göster (canlı toast kaçırılsa bile
  // kazanımlar burada görünür).
  function handleStop() {
    // Seans başı tabanı (reload sonrası ref boşsa mevcut tabana düşülür)
    const before = sessionWeekBaseRef.current ?? weekTotalSec
    const finalWeek = weekWithActiveSec // seans dahil, bu haftaki nihai toplam
    const finalToday = todayWithActiveSec // seans dahil, bugünkü nihai toplam
    const earned = earnedMilestones(finalWeek)
    const newly = earned.filter((m) => m.sec > before) // bu seansta yeni aşılanlar
    stop()
    sessionWeekBaseRef.current = null
    setSummary({
      sessionSec: elapsedSec,
      weekSec: finalWeek,
      todaySec: finalToday,
      earned,
      newly,
      next: nextMilestone(finalWeek),
    })
  }

  return (
    <main className="page timer-page">
      {milestone && (
        <div className="milestone-toast" role="status" aria-live="polite">
          <span className="milestone-emoji" aria-hidden="true">🏆</span>
          <span className="milestone-text">
            <strong className="milestone-name">Başardın: {milestone.name}</strong>
            <span className="milestone-msg">{milestone.message}</span>
          </span>
        </div>
      )}

      <header>
        <h1 className="page-title">Merhaba, {user.name}</h1>
        {isLocalMode && (
          <p className="mode-notice">
            Yerel mod — Firebase bağlanınca odalar aktif olur
          </p>
        )}
      </header>

      <div className="timer-display">
        <div className="timer-digits">{formatClock(elapsedSec)}</div>
        <div className="timer-state">
          {status === 'running' && <span className="pulse-dot" aria-hidden="true" />}
          {STATE_LABELS[status]}
        </div>
      </div>

      <div className="timer-controls">
        {status === 'idle' && (
          <button type="button" className="btn btn-primary btn-wide" onClick={handleStart}>
            Başlat
          </button>
        )}
        {status === 'running' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={pause}>
              Duraklat
            </button>
            <button type="button" className="btn btn-danger" onClick={handleStop}>
              Durdur
            </button>
          </>
        )}
        {status === 'paused' && (
          <>
            <button type="button" className="btn btn-primary" onClick={resume}>
              Devam
            </button>
            <button type="button" className="btn btn-danger" onClick={handleStop}>
              Durdur
            </button>
          </>
        )}
      </div>

      <footer className="timer-footer">
        <div className="week-total">
          Bugün: <strong>{formatWeekTotal(todayWithActiveSec)}</strong>
          <span aria-hidden="true"> · </span>
          Bu hafta: <strong>{formatWeekTotal(weekWithActiveSec)}</strong>
        </div>
        <p className="reset-note">Salı 00:00'da sıfırlanır</p>
      </footer>

      {summary && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Seans özeti"
          onClick={() => setSummary(null)}
        >
          <div className="summary-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="summary-title">Seansı bitirdin 👏</h2>
            <p className="summary-sub">
              Bu seans <strong>{formatWeekTotal(summary.sessionSec)}</strong>
              <span aria-hidden="true"> · </span>
              Bugün toplam <strong>{formatWeekTotal(summary.todaySec)}</strong>
              <span aria-hidden="true"> · </span>
              Bu hafta toplam <strong>{formatWeekTotal(summary.weekSec)}</strong>
            </p>

            {summary.newly.length > 0 && (
              <div className="summary-new">
                <p className="summary-new-title">
                  🎉 Yeni rozet{summary.newly.length > 1 ? 'ler' : ''}!
                </p>
                {summary.newly.map((m) => (
                  <div key={m.sec} className="summary-badge">
                    <span className="summary-badge-emoji" aria-hidden="true">
                      🏆
                    </span>
                    <span className="summary-badge-text">
                      <strong className="summary-badge-name">{m.name}</strong>
                      <span className="summary-badge-msg">{m.message}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {summary.earned.length > 0 ? (
              <div className="summary-collection">
                <p className="summary-collection-title">Bu haftaki rozetlerin</p>
                <div className="summary-chips">
                  {summary.earned.map((m) => (
                    <span
                      key={m.sec}
                      className={`summary-chip${
                        summary.newly.includes(m) ? ' summary-chip-new' : ''
                      }`}
                    >
                      🏆 {m.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="summary-empty">
                Bu hafta henüz rozet yok — ama her dakika sayılıyor!
              </p>
            )}

            {summary.next && (
              <p className="summary-next">
                Sonraki rozet <strong>{summary.next.name}</strong> için{' '}
                <strong>
                  {formatWeekTotal(Math.max(0, summary.next.sec - summary.weekSec))}
                </strong>{' '}
                kaldı.
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary btn-wide"
              onClick={() => setSummary(null)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
