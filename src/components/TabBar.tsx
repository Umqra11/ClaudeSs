export type Page = 'timer' | 'rooms'

interface TabBarProps {
  active: Page
  onChange: (page: Page) => void
  /** Oda detayı (scoreboard) açıkken ikinci sekme "Liderlik" olur. */
  inRoom?: boolean
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13V9" />
      <path d="M10 3.5h4" />
    </svg>
  )
}

function RoomsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="3.5" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M17.5 14.7c1.8.5 3 1.9 3 3.8" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1a3 3 0 0 0 3 3" />
      <path d="M17 6h2.5v1a3 3 0 0 1-3 3" />
      <path d="M9.5 13.5 9 17h6l-.5-3.5" />
      <path d="M8 20h8" />
      <path d="M10 17v3M14 17v3" />
    </svg>
  )
}

export default function TabBar({ active, onChange, inRoom = false }: TabBarProps) {
  return (
    <nav className="tabbar" aria-label="Ana gezinme">
      <div className="tabbar-inner">
        <button
          type="button"
          className="tab"
          aria-current={active === 'timer' ? 'page' : undefined}
          onClick={() => onChange('timer')}
        >
          <TimerIcon />
          Kronometre
        </button>
        <button
          type="button"
          className="tab"
          aria-current={active === 'rooms' ? 'page' : undefined}
          onClick={() => onChange('rooms')}
        >
          {inRoom ? <TrophyIcon /> : <RoomsIcon />}
          {inRoom ? 'Liderlik' : 'Odalar'}
        </button>
      </div>
    </nav>
  )
}
