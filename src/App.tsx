import { useState } from 'react'
import TabBar, { type Page } from './components/TabBar'
import Timer from './pages/Timer'
import Rooms from './pages/Rooms'
import Scoreboard from './pages/Scoreboard'
import Welcome from './pages/Welcome'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const [page, setPage] = useState<Page>('timer')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomsKey, setRoomsKey] = useState(0)
  const { status, user, register } = useAuth()

  if (status === 'loading') return null

  if (status === 'welcome' || !user) {
    return <Welcome onSubmit={register} />
  }

  function changePage(next: Page) {
    setPage(next)
    // Sekmeye dokununca oda detayından/alt görünümlerden listeye dönülür
    if (next === 'rooms') {
      setRoomId(null)
      setRoomsKey((k) => k + 1)
    }
  }

  let content
  if (page === 'timer') {
    content = <Timer user={user} />
  } else if (roomId) {
    content = (
      <Scoreboard user={user} roomId={roomId} onBack={() => setRoomId(null)} />
    )
  } else {
    content = <Rooms key={roomsKey} user={user} onOpenRoom={setRoomId} />
  }

  return (
    <div className="app">
      {content}
      <TabBar active={page} onChange={changePage} />
    </div>
  )
}
