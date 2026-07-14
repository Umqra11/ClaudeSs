import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

// Yeni sürümün service worker'ı devralınca sayfayı BİR KEZ yenile:
// bayat sekme eski chunk setiyle çalışmaya devam etmesin (kronometre
// zaman damgası tabanlı olduğundan yenileme süre kaybettirmez).
// İlk kurulumda (controller yokken) yenileme yapılmaz.
if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      window.location.reload()
    }
    hadController = true
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
