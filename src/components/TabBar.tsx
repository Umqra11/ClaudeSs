export type Page = 'timer' | 'rooms'

interface TabBarProps {
  active: Page
  onChange: (page: Page) => void
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

export default function TabBar({ active, onChange }: TabBarProps) {
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
          <RoomsIcon />
          Odalar
        </button>
      </div>
    </nav>
  )
}
