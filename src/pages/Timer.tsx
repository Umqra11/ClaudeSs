import { isLocalMode, type UserProfile } from '../services/db'
import { useTimer } from '../hooks/useTimer'
import { useMilestone } from '../hooks/useMilestone'
import { formatClock, formatWeekTotal } from '../lib/format'

interface TimerProps {
  user: UserProfile
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Hazır',
  running: 'Çalışıyorsun',
  paused: 'Duraklatıldı',
}

export default function Timer({ user }: TimerProps) {
  const { status, elapsedSec, weekWithActiveSec, start, pause, resume, stop } =
    useTimer(user)
  const milestone = useMilestone(user.uid, weekWithActiveSec)

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
          <button type="button" className="btn btn-primary btn-wide" onClick={start}>
            Başlat
          </button>
        )}
        {status === 'running' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={pause}>
              Duraklat
            </button>
            <button type="button" className="btn btn-danger" onClick={stop}>
              Durdur
            </button>
          </>
        )}
        {status === 'paused' && (
          <>
            <button type="button" className="btn btn-primary" onClick={resume}>
              Devam
            </button>
            <button type="button" className="btn btn-danger" onClick={stop}>
              Durdur
            </button>
          </>
        )}
      </div>

      <footer className="timer-footer">
        <div className="week-total">
          Bu hafta: <strong>{formatWeekTotal(weekWithActiveSec)}</strong>
        </div>
        <p className="reset-note">Salı 00:00'da sıfırlanır</p>
      </footer>
    </main>
  )
}
