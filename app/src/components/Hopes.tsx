import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { CoverModal } from './CoverModal'
import { dropHopeful, moveHopefuls } from '../sync/backup'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Hopeful } from '../types'
import { currentMonthKey, monthName } from '../format'
import { dayOf, useReviewed, writeState } from '../hopefuls'

/* The two things the Shelf tabs and Home both show from the hopefuls table:
   the books in hand, and a month's list as one card. */

export function useHopes() {
  const all = useLiveQuery(() => db.hopefuls.orderBy('createdAt').toArray(), [])
  const reviewed = useReviewed(all)
  if (!all || !reviewed) return null
  const isRead = (h: Hopeful) => reviewed.has(h.id!)
  return {
    all,
    isRead,
    reading: all.filter((h) => h.startedAt && !isRead(h)).sort((a, b) => b.startedAt! - a.startedAt!),
    ofMonth: (m: string) => all.filter((h) => h.month === m),
  }
}
export type Hopes = NonNullable<ReturnType<typeof useHopes>>

/* The month after this one, as a key. A hopefuls list is written BEFORE the
   month it is for, so next month has to be reachable. */
export const shiftMonth = (k: string, by: number) => {
  const [y, m] = k.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7)
}
export const nextMonthKey = () => shiftMonth(currentMonthKey(), 1)

/* this month, next month, and any month a list was started for — newest first */
export function hopeMonths(h: Hopes) {
  return [...new Set([nextMonthKey(), currentMonthKey(), ...h.all.map((b) => b.month)])].sort().reverse()
}

/* A row of covers; a cover, as on a shelf, says what it is and nothing else */
export function CoverTile({ h, sub, onClick }: { h: Hopeful; sub?: string; onClick: () => void }) {
  return (
    <button type="button" className="cover-tile" onClick={onClick}>
      {h.cover ? <img className="lib-cover" src={h.cover} alt="" /> : <span className="lib-cover-miss">No cover</span>}
      <span className="cover-tile-t">{h.title}</span>
      {sub && <span className="cover-tile-s">{sub}</span>}
    </button>
  )
}

export interface DrawerAct { label: string; onClick: () => void; danger?: boolean }

/* A book's options rise from the bottom edge, under the thumb, with the book
   itself at the top so it is clear which one they act on. */
export function BookDrawer({ h, sub, acts, onClose }: { h: Hopeful; sub?: string; acts: DrawerAct[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="share-scrim drawer-scrim" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={h.title}>
      <div className="drawer">
        <div className="drawer-book">
          {h.cover ? <img className="lib-cover" src={h.cover} alt="" /> : <span className="lib-cover-miss">No cover</span>}
          <span>
            <span className="res-t" style={{ display: 'block' }}>{h.title}</span>
            <span className="res-a" style={{ display: 'block' }}>{h.author}</span>
            {sub && <span className="cover-tile-s">{sub}</span>}
          </span>
        </div>
        {/* the first option is the likeliest, so it is the filled one */}
        <div className="drawer-acts">
          {acts.map((a, i) => (
            <button key={a.label} type="button" className={`btn${a.danger ? ' btn--danger' : i ? ' btn--ghost' : ''}`} onClick={() => { a.onClick(); onClose() }}>
              {a.label}
            </button>
          ))}
          <button type="button" className="btn btn--ghost drawer-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* Books in hand are not one more row of covers: the latest sits large on an
   ink panel with its Review button in front of it; any others wait as pills. */
export function ReadingList({ books, onShare }: { books: Hopeful[]; onShare: (h: Hopeful) => void }) {
  const nav = useNavigate()
  const [id, setId] = useState(books[0].id)
  const h = books.find((b) => b.id === id) ?? books[0]
  return (
    <>
      <div className="hero-read">
        {h.cover ? <img className="lib-cover" src={h.cover} alt="" /> : <span className="lib-cover-miss">No cover</span>}
        <div className="hero-read-txt">
          <div className="hero-read-day">Day {dayOf(h.startedAt!)}</div>
          <div className="hero-read-t">{h.title}</div>
          <div className="hero-read-a">{h.author}</div>
          <button type="button" className="hero-read-back" onClick={() => db.hopefuls.update(h.id!, { startedAt: undefined, editedAt: Date.now() })}>
            Put back on {monthName(h.month)}
          </button>
          <div className="hero-read-go">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => nav('/write', { state: writeState(h) })}>Review it</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onShare(h)}>Share</button>
          </div>
        </div>
      </div>
      {books.length > 1 && (
        <div className="hero-pills" role="radiogroup" aria-label="Books in hand">
          {books.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={b.id === h.id} onClick={() => setId(b.id)}>
              {b.cover ? <img src={b.cover} alt="" /> : null}
              <span>{b.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* A month's books still to read; each opens the same options its row has on
   the month's page, less Share, which needs that page's card builder. */
export function HopeRail({ books, month }: { books: Hopeful[]; month: string }) {
  const nav = useNavigate()
  const [openId, setOpenId] = useState<number | null>(null)
  const [coverFor, setCoverFor] = useState<number | null>(null)
  const open = books.find((b) => b.id === openId)
  const editing = useLiveQuery(() => (coverFor == null ? undefined : db.hopefuls.get(coverFor)), [coverFor])
  return (
    <>
      <div className="cover-rail">
        {books.map((h) => <CoverTile key={h.id} h={h} onClick={() => setOpenId(h.id!)} />)}
      </div>
      {open && (
        <BookDrawer
          h={open}
          acts={[
            { label: 'Start reading', onClick: () => db.hopefuls.update(open.id!, { startedAt: Date.now(), editedAt: Date.now() }) },
            { label: 'Review it', onClick: () => nav('/write', { state: writeState(open) }) },
            { label: 'Change cover', onClick: () => setCoverFor(open.id!) },
            { label: `Open ${monthName(month)}`, onClick: () => nav(`/hopefuls/${month}`) },
            { label: 'Remove', danger: true, onClick: () => dropHopeful(open) },
          ]}
          onClose={() => setOpenId(null)}
        />
      )}
      {editing && (
        <CoverModal
          covers={editing.covers ?? []}
          current={editing.cover}
          seed={`${editing.title} ${editing.author}`}
          onCovers={(next) => db.hopefuls.update(editing.id!, { covers: next, editedAt: Date.now() })}
          onPick={(cover) => db.hopefuls.update(editing.id!, { cover, editedAt: Date.now() })}
          onClose={() => setCoverFor(null)}
        />
      )}
    </>
  )
}

export function HopeRow({ k, hopes }: { k: string; hopes: Hopes }) {
  const books = hopes.ofMonth(k)
  const count = books.length
  const covers = books.filter((b) => b.cover).slice(0, 3)
  const tag = k === currentMonthKey() ? 'This month' : k === nextMonthKey() ? 'Next month' : undefined
  return (
    <Link className="mo-row" to={`/hopefuls/${k}`}>
      {covers.length > 0 && (
        <span className="mo-covers" aria-hidden>
          {covers.map((b) => <img key={b.id} src={b.cover} alt="" />)}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="mo-row-t" style={{ display: 'block' }}>{monthName(k)}</span>
        <span className="mo-row-s">
          {count === 0 ? 'Nothing picked yet' : `${count} hopeful${count === 1 ? '' : 's'}`}
        </span>
        {tag && <span className="mo-open-tag mo-open-tag--under">{tag}</span>}
      </span>
    </Link>
  )
}

/* A month that ran out before its books did: carry the unread ones over to
   the month after it in one go. In-hand books travel too; they stay in hand. */
export function CarryOver({ month }: { month: string }) {
  const hopes = useHopes()
  const left = hopes?.ofMonth(month).filter((h) => !hopes.isRead(h)) ?? []
  if (!left.length || month > currentMonthKey()) return null
  const to = shiftMonth(month, 1)
  return (
    <div className="notice">
      <div className="notice-txt"><p>{left.length} book{left.length === 1 ? '' : 's'} from {monthName(month).split(' ')[0]} not read yet.</p></div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => moveHopefuls(left, to)}>
        Move to {monthName(to).split(' ')[0]}
      </button>
    </div>
  )
}
