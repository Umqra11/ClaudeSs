import { useState } from 'react'
import TabBar, { type Page } from './components/TabBar'
import Timer from './pages/Timer'
import Rooms from './pages/Rooms'
import Welcome from './pages/Welcome'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const [page, setPage] = useState<Page>('timer')
  const { status, user, register } = useAuth()

  if (status === 'loading') return null

  if (status === 'welcome' || !user) {
    return <Welcome onSubmit={register} />
  }

  return (
    <div className="app">
      {page === 'timer' ? <Timer user={user} /> : <Rooms />}
      <TabBar active={page} onChange={setPage} />
    </div>
  )
}
