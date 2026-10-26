import { useEffect, useState } from 'react'
import { buy, cancelled, prices, restore, type Product } from '../unlock'
import { STORE } from '../native'

/* Remix lock-line */
export const LockIcon = () => (
  <svg className="lock-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M19 10H20C20.5523 10 21 10.4477 21 11V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V11C3 10.4477 3.44772 10 4 10H5V9C5 5.13401 8.13401 2 12 2C15.866 2 19 5.13401 19 9V10ZM5 12V20H19V12H5ZM11 14H13V18H11V14ZM17 10V9C17 6.23858 14.7614 4 12 4C9.23858 4 7 6.23858 7 9V10H17Z" />
  </svg>
)

/* The one place the store apps ask for money. Two prices for the same
   unlock: Supporter is there for people who want to pay more, and says so,
   so nobody buys it thinking it opens something the other doesn't. The
   store's own sheet does the paying; this slip only says what is bought. */
export function UnlockSheet({ onClose }: { onClose: () => void }) {
  const [price, setPrice] = useState<Partial<Record<Product, string>>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    prices().then(setPrice).catch(() => setNote(`Couldn’t reach ${STORE}. Check the connection and try again.`))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const act = async (f: () => Promise<boolean>, miss: string) => {
    setBusy(true)
    setNote('')
    try {
      if (await f()) onClose()
      else setNote(miss)
    } catch (e) {
      if (!cancelled(e)) setNote(`${STORE} didn’t finish that. Nothing was charged.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-scrim" role="dialog" aria-modal="true" aria-label="Unlock everything"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-sheet unlock-sheet">
        <div className="ui-lbl">Unlock everything</div>
        <p>
          All twenty card styles, monthly and yearly collages, PDF, and image
          plates. Pay once and keep it, on this device and your next one.
        </p>
        <div className="unlock-buys">
          <button className="btn" disabled={busy} onClick={() => act(() => buy('unlock'), 'The purchase is waiting on approval.')}>
            Unlock{price.unlock ? ` · ${price.unlock}` : ''}
          </button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => buy('supporter'), 'The purchase is waiting on approval.')}>
            Supporter{price.supporter ? ` · ${price.supporter}` : ''}
          </button>
        </div>
        <p className="share-note">Both unlock the same things. Supporter pays a little more toward the app.</p>
        <div className="confirm-actions unlock-minor">
          <button className="btn btn--ghost" disabled={busy}
            onClick={() => act(restore, `No purchase found on this ${STORE === 'Google Play' ? 'Google' : 'Apple'} account.`)}>
            Restore purchases
          </button>
          <button className="btn btn--ghost" onClick={onClose}>Not now</button>
        </div>
        {note && <p className="share-note" role="status">{note}</p>}
        <p className="share-note">
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">Terms of Use</a>
          {' · '}
          <a href="https://feyidesigns.com/apps/flyleaf-bookprint/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </div>
    </div>
  )
}
