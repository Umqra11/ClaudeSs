// Oda kurma/katılma işlevleri sonraki fazlarda bağlanacak.
export default function Rooms() {
  return (
    <main className="page rooms-page">
      <h1 className="page-title">Odalar</h1>

      <div className="empty-state">
        <div className="empty-state-icon">
          <svg
            width="28"
            height="28"
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
        </div>
        <h2>Henüz bir odan yok</h2>
        <p>Bir oda kur, kodu arkadaşlarınla paylaş ve birlikte çalışın.</p>
      </div>

      <div className="rooms-actions">
        <button type="button" className="btn btn-primary btn-wide">
          Oda Kur
        </button>
        <button type="button" className="btn btn-secondary btn-wide">
          Odaya Katıl
        </button>
      </div>
    </main>
  )
}
