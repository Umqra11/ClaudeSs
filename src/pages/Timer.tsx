import { isLocalMode, type UserProfile } from '../services/db'

interface TimerProps {
  user: UserProfile
}

// Kronometre işlevi Faz 3'te bağlanacak; şimdilik görsel tasarım.
export default function Timer({ user }: TimerProps) {
  return (
    <main className="page timer-page">
      <header>
        <h1 className="page-title">Merhaba, {user.name}</h1>
        {isLocalMode && (
          <p className="mode-notice">
            Yerel mod — Firebase bağlanınca odalar aktif olur
          </p>
        )}
      </header>

      <div className="timer-display">
        <div className="timer-digits">00:00:00</div>
        <div className="timer-state">Hazır</div>
      </div>

      <div className="timer-controls">
        <button type="button" className="btn btn-primary">
          Başlat
        </button>
        <button type="button" className="btn btn-secondary">
          Duraklat
        </button>
        <button type="button" className="btn btn-danger">
          Durdur
        </button>
      </div>

      <div className="week-total">
        Bu hafta: <strong>0dk</strong>
      </div>
    </main>
  )
}
