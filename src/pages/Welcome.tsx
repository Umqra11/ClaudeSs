import { useState, type FormEvent } from 'react'

const MAX_NAME_LENGTH = 24

interface WelcomeProps {
  onSubmit: (name: string) => Promise<void>
}

export default function Welcome({ onSubmit }: WelcomeProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page welcome-page">
      <div className="welcome-hero">
        <div className="welcome-icon" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="12" cy="13" r="7.5" />
            <path d="M12 13V9" />
            <path d="M10 3.5h4" />
          </svg>
        </div>
        <h1>KPSS Takip</h1>
        <p>Adını yaz, çalışmaya başla. Süren bu cihazda hatırlanır.</p>
      </div>

      <form className="welcome-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="text-input"
          placeholder="Adın"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={!trimmed || busy}
        >
          {busy ? 'Başlıyor…' : 'Başla'}
        </button>
      </form>
    </main>
  )
}
