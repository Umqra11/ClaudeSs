import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

// Yeni sürümün service worker'ı devralınca sayfayı BİR KEZ yenile:
// bayat sekme eski chunk setiyle çalışmaya devam etmesin. YALNIZCA sekme
// GÖRÜNÜRKEN yenile — arka planda beklenmedik reload, koşan bir seansın
// sekmesini kesmesin. Sekme o an gizliyse, tekrar görünür olunca yenilenir.
// İlk kurulumda (controller yokken) yenileme yapılmaz.
if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller)
  let updatePending = false
  const reloadIfVisible = () => {
    if (document.visibilityState === 'visible') window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      updatePending = true
      reloadIfVisible()
    }
    hadController = true
  })
  document.addEventListener('visibilitychange', () => {
    if (updatePending) reloadIfVisible()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
