import { useEffect, useRef, useState } from 'react'
import { buy, cancelled, prices, restore, useUnlocked, type Product } from '../unlock'
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
  // After the unlock the sheet stays open to Supporter, as a tip.
  const unlocked = useUnlocked()
  const [price, setPrice] = useState<Partial<Record<Product, string>>>({})
  const [busy, setBusy] = useState<Product | 'restore' | null>(null)
  const [note, setNote] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  // A store sheet is up while busy: closing now would lose its answer.
  const shut = () => { if (!busy) onClose() }

  useEffect(() => {
    prices().then(setPrice).catch(() => setNote(`Couldn’t reach ${STORE}. Check the connection and try again.`))
  }, [])
  // Focus comes in with the sheet and goes back where it was when it leaves.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    first.current?.focus()
    return () => back?.focus?.()
  }, [])
  // Capture, so Escape closes this slip and not the export sheet under it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      shut()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const act = async (which: Product | 'restore', f: () => Promise<boolean>, miss: string, done: string) => {
    setBusy(which)
    setNote(which === 'restore' ? `Checking with ${STORE}…` : '')
    try {
      if (await f()) {
        setNote(done)
        window.setTimeout(onClose, 1400)
      } else setNote(miss)
    } catch (e) {
      setNote(cancelled(e) ? '' : 'The purchase did not go through. Nothing was charged.')
    } finally {
      setBusy(null)
    }
  }
  const label = (p: Product, name: string) =>
    busy === p ? `Opening ${STORE}…` : `${name}${price[p] ? ` · ${price[p]}` : ''}`

  return (
    <div className="share-scrim" role="dialog" aria-modal="true" aria-labelledby="unlock-title"
      onClick={(e) => e.target === e.currentTarget && shut()}>
      <div className="confirm-sheet unlock-sheet">
        <h2 className="ui-lbl" id="unlock-title">{unlocked ? 'Unlocked' : 'Unlock everything'}</h2>
        <p>
          {unlocked
            ? 'Every style, collage, PDF and plate is yours. Supporter is a tip on top, and opens nothing more.'
            : 'All twenty card styles, monthly and yearly collages, PDF, and image plates. Pay once and keep it, on this device and your next one.'}
        </p>
        <div className="unlock-buys">
          {!unlocked && <button ref={first} className="btn" disabled={!!busy}
            onClick={() => act('unlock', () => buy('unlock'), 'The purchase is waiting on approval.', 'Unlocked. Thank you.')}>
            {label('unlock', 'Unlock')}
          </button>}
          <button ref={unlocked ? first : undefined} className={unlocked ? 'btn' : 'btn btn--ghost'} disabled={!!busy}
            onClick={() => act('supporter', () => buy('supporter'), 'The purchase is waiting on approval.', 'Unlocked. Thank you for the extra.')}>
            {label('supporter', 'Supporter')}
          </button>
        </div>
        {!unlocked && <p className="share-note">Both unlock the same things. Supporter pays a little more toward the app.</p>}
        <div className="confirm-actions unlock-minor">
          {!unlocked && <button className="btn btn--ghost" disabled={!!busy}
            onClick={() => act('restore', restore, `No purchase found on this ${STORE === 'Google Play' ? 'Google' : 'Apple'} account.`, 'Restored. Everything is open.')}>
            {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
          </button>}
          <button className="btn btn--ghost" disabled={!!busy} onClick={onClose}>{unlocked ? 'Done' : 'Not now'}</button>
        </div>
        {/* Always in the page, so a screen reader hears each change to it. */}
        <p className="share-note" role="status" aria-live="polite">{note}</p>
        <p className="share-note">
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">Terms of Use</a>
          {' · '}
          <a href="https://feyidesigns.com/apps/flyleaf-bookprint/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </div>
    </div>
  )
}
