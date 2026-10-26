import { useEffect, useRef, useState } from 'react'
import { TIPS, buy, cancelled, giveTip, prices, restore, tipPrices, useUnlocked, type Product, type Tip } from '../unlock'
import { STORE } from '../native'

/* Remix lock-line */
export const LockIcon = () => (
  <svg className="lock-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M19 10H20C20.5523 10 21 10.4477 21 11V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V11C3 10.4477 3.44772 10 4 10H5V9C5 5.13401 8.13401 2 12 2C15.866 2 19 5.13401 19 9V10ZM5 12V20H19V12H5ZM11 14H13V18H11V14ZM17 10V9C17 6.23858 14.7614 4 12 4C9.23858 4 7 6.23858 7 9V10H17Z" />
  </svg>
)

/* The one place the store apps ask for money. Locked, it sells the unlock;
   unlocked, it takes tips, which open nothing and can be given again. The
   store's own sheet does the paying; this slip only says what is bought. */
const TIER: Record<Tip, string> = { tip1: 'Small tip', tip2: 'Kind tip', tip3: 'Generous tip' }

export function UnlockSheet({ onClose }: { onClose: () => void }) {
  const unlocked = useUnlocked()
  const [price, setPrice] = useState<Partial<Record<Product, string>>>({})
  const [tips, setTips] = useState<Partial<Record<Tip, string>> | null>(null)
  const [busy, setBusy] = useState<Product | Tip | 'restore' | null>(null)
  const [note, setNote] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  // A store sheet is up while busy: closing now would lose its answer.
  const shut = () => { if (!busy) onClose() }

  useEffect(() => {
    const away = () => setNote(`Couldn’t reach ${STORE}. Check the connection and try again.`)
    if (unlocked) tipPrices().then(setTips, () => { setTips({}); away() })
    else prices().then(setPrice).catch(away)
  }, [unlocked])
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
  const tip = async (t: Tip) => {
    setBusy(t)
    setNote('')
    try {
      if (await giveTip(t)) setNote('Thank you for the tip. It means a lot.')
    } catch {
      setNote('The tip did not go through. Nothing was charged.')
    } finally {
      setBusy(null)
    }
  }
  const noTips = tips !== null && TIPS.every((t) => !tips[t])

  return (
    <div className="share-scrim" role="dialog" aria-modal="true" aria-labelledby="unlock-title"
      onClick={(e) => e.target === e.currentTarget && shut()}>
      <div className="confirm-sheet unlock-sheet">
        <h2 className="ui-lbl" id="unlock-title">{unlocked ? 'Unlocked' : 'Unlock everything'}</h2>
        <p>
          {unlocked
            ? 'Every style, collage, PDF and plate is yours. If Bookprint has earned a thank-you, you can leave a tip. It opens nothing more.'
            : 'All twenty card styles, monthly and yearly collages, PDF, and image plates. Pay once and keep it, on this device and your next one.'}
        </p>
        {unlocked ? (
          <div className="unlock-buys unlock-tips">
            {TIPS.map((t, i) => (
              <button key={t} ref={i === 0 ? first : undefined} className="btn btn--ghost unlock-tip"
                disabled={!tips?.[t] || !!busy} onClick={() => void tip(t)}>
                <span>{busy === t ? 'Opening…' : tips?.[t] ?? '…'}</span>
                <span className="unlock-tip-name">{TIER[t]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="unlock-buys">
            <button ref={first} className="btn" disabled={!!busy}
              onClick={() => act('unlock', () => buy('unlock'), 'The purchase is waiting on approval.', 'Unlocked. Thank you.')}>
              {busy === 'unlock' ? `Opening ${STORE}…` : `Unlock${price.unlock ? ` · ${price.unlock}` : ''}`}
            </button>
          </div>
        )}
        <div className="confirm-actions unlock-minor">
          {!unlocked && <button className="btn btn--ghost" disabled={!!busy}
            onClick={() => act('restore', restore, `No purchase found on this ${STORE === 'Google Play' ? 'Google' : 'Apple'} account.`, 'Restored. Everything is open.')}>
            {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
          </button>}
          <button className="btn btn--ghost" disabled={!!busy} onClick={onClose}>{unlocked ? 'Done' : 'Not now'}</button>
        </div>
        {/* Always in the page, so a screen reader hears each change to it. */}
        <p className="share-note" role="status" aria-live="polite">
          {noTips && !note ? 'Tips are unavailable right now. Please try again later.' : note}
        </p>
        <p className="share-note">
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">Terms of Use</a>
          {' · '}
          <a href="https://feyidesigns.com/apps/flyleaf-bookprint/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </div>
    </div>
  )
}
