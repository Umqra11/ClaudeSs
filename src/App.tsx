import { useState } from 'react'
import TabBar, { type Page } from './components/TabBar'
import Timer from './pages/Timer'
import Rooms from './pages/Rooms'
import Scoreboard from './pages/Scoreboard'
import Profile from './pages/Profile'
import Welcome from './pages/Welcome'
import { useAuth } from './hooks/useAuth'
import { useRooms } from './hooks/useRoom'
import type { UserProfile } from './services/db'

export default function App() {
  const { status, user, register } = useAuth()

  if (status === 'loading') return null

  if (status === 'welcome' || !user) {
    return <Welcome onSubmit={register} />
  }

  return <Main user={user} />
}

function Main({ user }: { user: UserProfile }) {
  const [page, setPage] = useState<Page>('timer')
  // Tek oda modeli: kullanıcının (varsa tek) odası. Odalar sekmesi
  // odası olana doğrudan liderlik tablosunu açar.
  const { rooms, refresh } = useRooms(user.uid)
  const room = rooms?.[0] ?? null

  let content
  if (page === 'timer') {
    content = <Timer user={user} />
  } else if (page === 'profile') {
    content = <Profile user={user} />
  } else if (rooms === null) {
    content = null // oda bilgisi yükleniyor — kısa an
  } else if (room) {
    content = <Scoreboard user={user} roomId={room.id} onLeft={refresh} />
  } else {
    content = <Rooms user={user} onChanged={refresh} />
  }

  return (
    <div className="app">
      {content}
      <TabBar active={page} onChange={setPage} inRoom={room != null} />
    </div>
  )
}
