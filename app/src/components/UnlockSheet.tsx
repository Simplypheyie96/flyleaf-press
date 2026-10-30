import { useEffect, useMemo, useRef, useState } from 'react'
import { TIPS, buy, cancelled, giveTip, prices, restore, tipPrices, useUnlocked, type Product, type Tip } from '../unlock'
import { STORE } from '../native'
import { renderReviewCard } from '../cards/review'
import type { Review, StyleId } from '../types'
import { CardHtml } from './CardHtml'

/* Remix lock-line */
export const LockIcon = () => (
  <svg className="lock-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M19 10H20C20.5523 10 21 10.4477 21 11V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V11C3 10.4477 3.44772 10 4 10H5V9C5 5.13401 8.13401 2 12 2C15.866 2 19 5.13401 19 9V10ZM5 12V20H19V12H5ZM11 14H13V18H11V14ZM17 10V9C17 6.23858 14.7614 4 12 4C9.23858 4 7 6.23858 7 9V10H17Z" />
  </svg>
)
/* Remix close-line, palette-line, layout-grid-line, file-pdf-2-line, image-add-line */
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z" /></svg>
)
const PaletteIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 2C17.5222 2 22 5.97778 22 10.8889C22 13.9556 19.5111 16.4444 16.4444 16.4444H14.4778C13.5556 16.4444 12.8111 17.1889 12.8111 18.1111C12.8111 18.5333 12.9778 18.9222 13.2333 19.2111C13.5 19.5111 13.6667 19.9 13.6667 20.3333C13.6667 21.2556 12.9 22 12 22C6.47778 22 2 17.5222 2 12C2 6.47778 6.47778 2 12 2ZM10.8111 18.1111C10.8111 16.0843 12.451 14.4444 14.4778 14.4444H16.4444C18.4065 14.4444 20 12.851 20 10.8889C20 7.1392 16.4677 4 12 4C7.58235 4 4 7.58235 4 12C4 16.19 7.2226 19.6285 11.324 19.9718C10.9948 19.4168 10.8111 18.7761 10.8111 18.1111ZM7.5 12C6.67157 12 6 11.3284 6 10.5C6 9.67157 6.67157 9 7.5 9C8.32843 9 9 9.67157 9 10.5C9 11.3284 8.32843 12 7.5 12ZM16.5 12C15.6716 12 15 11.3284 15 10.5C15 9.67157 15.6716 9 16.5 9C17.3284 9 18 9.67157 18 10.5C18 11.3284 17.3284 12 16.5 12ZM12 9C11.1716 9 10.5 8.32843 10.5 7.5C10.5 6.67157 11.1716 6 12 6C12.8284 6 13.5 6.67157 13.5 7.5C13.5 8.32843 12.8284 9 12 9Z" /></svg>
)
const GridIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M21 3C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H21ZM11 13H4V19H11V13ZM20 13H13V19H20V13ZM11 5H4V11H11V5ZM20 5H13V11H20V5Z" /></svg>
)
const PdfIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M5 4H15V8H19V20H5V4ZM3.9985 2C3.44749 2 3 2.44405 3 2.9918V21.0082C3 21.5447 3.44476 22 3.9934 22H20.0066C20.5551 22 21 21.5489 21 20.9925L20.9997 7L16 2H3.9985ZM10.4999 7.5C10.4999 9.07749 10.0442 10.9373 9.27493 12.6534C8.50287 14.3757 7.46143 15.8502 6.37524 16.7191L7.55464 18.3321C10.4821 16.3804 13.7233 15.0421 16.8585 15.49L17.3162 13.5513C14.6435 12.6604 12.4999 9.98994 12.4999 7.5H10.4999ZM11.0999 13.4716C11.3673 12.8752 11.6042 12.2563 11.8037 11.6285C12.2753 12.3531 12.8553 13.0182 13.5101 13.5953C12.5283 13.7711 11.5665 14.0596 10.6352 14.4276C10.7999 14.1143 10.9551 13.7948 11.0999 13.4716Z" /></svg>
)
const PhotoIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M21 15V18H24V20H21V23H19V20H16V18H19V15H21ZM21.0082 3C21.556 3 22 3.44495 22 3.9934V13H20V5H4V18.999L14 9L17 12V14.829L14 11.8284L6.827 19H14V21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082ZM8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7Z" /></svg>
)

/* The one place the store apps ask for money. Locked, it shows what the unlock
   opens, drawn with the app's own card renderers; unlocked, it takes tips,
   which open nothing and can be given again. The store's own sheet does the
   paying; this page only says what is bought. */
const TIER: Record<Tip, string> = { tip1: 'Small tip', tip2: 'Kind tip', tip3: 'Generous tip' }

const OPENS = [
  { icon: <PaletteIcon />, title: 'All twenty card styles', line: 'Airmail, Passport, Seed Packet, Chintz and sixteen more.' },
  { icon: <GridIcon />, title: 'Month and year collages', line: 'Every book from a month or a year, gathered on one card to share.' },
  { icon: <PdfIcon />, title: 'Print-ready PDF', line: 'Any card as a PDF, sized to print and keep in a binder or a frame.' },
  { icon: <PhotoIcon />, title: 'Your own photos', line: 'Add plates to a card: your copy, your shelf, the spot you read it in.' },
]

/* Three sample reviews (covers ship in public/covers), each in a style the unlock opens. */
const sample = (no: number, isbn: string, title: string, author: string, rating: number, body: string, style: StyleId): Review => ({
  no, isbn, title, author, rating, body, style, finished: '2026-06-14', cover: `/covers/${isbn}.jpg`, formats: ['Physical'], plates: [], createdAt: no,
})
const FAN = [
  { rec: sample(33, '9780804172448', 'Station Eleven', 'Emily St. John Mandel', 4.25, 'Quiet about the end of the world, loud about what is worth keeping.', 'airmail'), x: '26%', y: 40, r: -8, s: 0.56 },
  { rec: sample(35, '9780525620785', 'Mexican Gothic', 'Silvia Moreno-Garcia', 3.75, 'A house that breathes. Read it with the lights on.', 'passport'), x: '74%', y: 40, r: 7, s: 0.56 },
  { rec: sample(34, '9780062060624', 'The Song of Achilles', 'Madeline Miller', 5, 'I knew how it ended and it still undid me.', 'chintz'), x: '50%', y: 22, r: 0, s: 0.62 },
]

export function UnlockSheet({ onClose }: { onClose: () => void }) {
  const unlocked = useUnlocked()
  const [price, setPrice] = useState<Partial<Record<Product, string>>>({})
  const [tips, setTips] = useState<Partial<Record<Tip, string>> | null>(null)
  const [busy, setBusy] = useState<Product | Tip | 'restore' | null>(null)
  const [note, setNote] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  const fan = useMemo(() => FAN.map((f) => renderReviewCard(f.rec, f.rec.style)), [])
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
    <div className="unlock-page" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <header className="unlock-top">
        <button className="unlock-icon" aria-label="Close" disabled={!!busy} onClick={onClose}><CloseIcon /></button>
        {!unlocked && (
          <button className="unlock-link" disabled={!!busy}
            onClick={() => act('restore', restore, `No purchase found on this ${STORE === 'Google Play' ? 'Google' : 'Apple'} account.`, 'Restored. Everything is open.')}>
            {busy === 'restore' ? 'Checking…' : 'Restore'}
          </button>
        )}
      </header>
      <div className="unlock-scroll">
        <div className="unlock-stage" aria-hidden="true">
          {FAN.map((f, i) => (
            <div key={f.rec.isbn} className="unlock-card" style={{ left: f.x, top: f.y, transform: `translateX(-50%) rotate(${f.r}deg) scale(${f.s})` }}>
              <CardHtml html={fan[i]} />
            </div>
          ))}
        </div>
        <h2 className="unlock-title" id="unlock-title">Every book you love, printed twenty ways.</h2>
        <p className="unlock-lede">
          {unlocked
            ? 'Every style, collage, PDF and plate is yours, on this device and your next one.'
            : 'One purchase opens every card style, every collage and every format, for good.'}
        </p>
        <ul className="unlock-opens">
          {OPENS.map((o) => (
            <li key={o.title}>
              <span className="unlock-badge">{o.icon}</span>
              <span><b>{o.title}</b>{o.line}</span>
            </li>
          ))}
        </ul>
        <p className="unlock-free">Free, always: writing, rating and sharing your reviews in Archive and Masthead.</p>
      </div>
      <footer className="unlock-bar">
        {unlocked ? (
          <>
            <p className="unlock-thanks">If Bookprint has earned a thank-you, leave a tip. It opens nothing more.</p>
            <div className="unlock-tips">
              {TIPS.map((t, i) => (
                <button key={t} ref={i === 0 ? first : undefined} className="btn btn--ghost unlock-tip"
                  disabled={!tips?.[t] || !!busy} onClick={() => void tip(t)}>
                  <span>{busy === t ? 'Opening…' : tips?.[t] ?? '…'}</span>
                  <span className="unlock-tip-name">{TIER[t]}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button ref={first} className="btn unlock-buy" disabled={!!busy}
            onClick={() => act('unlock', () => buy('unlock'), 'The purchase is waiting on approval.', 'Unlocked. Thank you.')}>
            {busy === 'unlock' ? `Opening ${STORE}…` : `Unlock everything${price.unlock ? ` · ${price.unlock}` : ''}`}
          </button>
        )}
        {/* Always in the page, so a screen reader hears each change to it. */}
        <p className="unlock-note" role="status" aria-live="polite">
          {noTips && !note ? 'Tips are unavailable right now. Please try again later.' : note}
        </p>
        <p className="unlock-fine">
          {unlocked ? 'Thank you for reading with Bookprint.' : 'Once, for good. No subscription.'}{' '}
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">Terms</a>
          {' · '}
          <a href="https://feyidesigns.com/apps/flyleaf-bookprint/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </footer>
    </div>
  )
}
