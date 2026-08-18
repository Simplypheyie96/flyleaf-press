import { Component, type ReactNode } from 'react'

/* Last-resort catch: a render crash must never leave a blank page on a
   phone with no console. The library itself is safe in IndexedDB — say so,
   and offer the one recovery that can't lose anything: reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page">
        <div className="page-inner" style={{ paddingTop: 60, textAlign: 'center' }}>
          <div className="ui-h" style={{ marginBottom: 12 }}>Something tore</div>
          <p className="field-hint" style={{ maxWidth: 340, margin: '0 auto 24px' }}>
            The app hit an error it couldn't recover from. Your reviews are safe —
            they live on this device, not in the page. Reloading usually mends it.
          </p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
