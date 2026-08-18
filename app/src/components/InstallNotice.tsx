import { useState } from 'react'
import { useInstall, promptInstall } from '../pwa'

/* Offered on the home page, once, and only when there is a real prompt behind
   it. Dismissal is a localStorage flag rather than a settings field: it is a
   fact about this browser, not about the reader, so it has no business
   travelling to another device in a Drive backup. */
const DISMISSED = 'flyleaf.install-dismissed'

export function InstallNotice() {
  const { canPrompt, installed } = useInstall()
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISSED) === '1')

  if (installed || !canPrompt || hidden) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED, '1')
    setHidden(true)
  }

  return (
    <div className="notice">
      <div className="notice-txt">
        <div className="ui-lbl">Install Flyleaf Press</div>
        <p>
          Keep it on your home screen and it opens like any other app — full screen, and
          it works with no connection. Your library is already on this device either way.
        </p>
      </div>
      <span className="notice-acts">
        <button className="btn btn--ghost btn--sm" onClick={dismiss}>Not now</button>
        <button className="btn btn--sm" onClick={() => promptInstall().then(dismiss)}>Install</button>
      </span>
    </div>
  )
}
