import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Uygulama genel hata sınırı: herhangi bir render hatasında beyaz ekran
 * yerine yenileme öneren bir mesaj gösterir. Kronometre zaman damgası
 * tabanlı olduğundan yenileme süre kaybettirmez.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page">
          <div className="empty-state">
            <h1 className="page-title">Bir şeyler ters gitti</h1>
            <p>
              Beklenmedik bir hata oluştu. Sayfayı yenilemek genellikle
              sorunu çözer — süren kaybolmaz.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-wide"
              onClick={() => window.location.reload()}
            >
              Yenile
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
