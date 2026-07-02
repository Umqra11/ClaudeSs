import { useState } from 'react'
import TabBar, { type Page } from './components/TabBar'
import Timer from './pages/Timer'
import Rooms from './pages/Rooms'

export default function App() {
  const [page, setPage] = useState<Page>('timer')

  return (
    <div className="app">
      {page === 'timer' ? <Timer /> : <Rooms />}
      <TabBar active={page} onChange={setPage} />
    </div>
  )
}
