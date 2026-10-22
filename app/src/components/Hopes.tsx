import { Link, useNavigate } from 'react-router-dom'
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
export function nextMonthKey(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
  return d.toISOString().slice(0, 7)
}

/* this month, next month, and any month a list was started for — newest first */
export function hopeMonths(h: Hopes) {
  return [...new Set([nextMonthKey(), currentMonthKey(), ...h.all.map((b) => b.month)])].sort().reverse()
}

const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function ReadingList({ books }: { books: Hopeful[] }) {
  const nav = useNavigate()
  return (
    <div className="lib">
      {books.map((h, i) => (
        <div key={h.id} className="lib-row read-row" style={{ '--i': i } as React.CSSProperties}>
          <span className="read-cover">
            {h.cover ? <img className="lib-cover" src={h.cover} alt="" /> : <span className="lib-cover-miss">No cover</span>}
            <span className="read-page" aria-hidden />
          </span>
          <span>
            <span className="lib-t">{h.title}</span>
            <span className="lib-a" style={{ display: 'block' }}>{h.author}</span>
            <span className="read-day">Day {dayOf(h.startedAt!)} · since {fmtDay(h.startedAt!)}</span>
          </span>
          <span className="read-acts">
            <button className="btn btn--sm" onClick={() => nav('/write', { state: writeState(h) })}>Review</button>
            <button className="btn btn--ghost btn--sm" onClick={() => db.hopefuls.update(h.id!, { startedAt: undefined, editedAt: Date.now() })}>Put back</button>
          </span>
        </div>
      ))}
    </div>
  )
}

export function HopeRow({ k, hopes }: { k: string; hopes: Hopes }) {
  const count = hopes.ofMonth(k).length
  const tag = k === currentMonthKey() ? 'This month' : k === nextMonthKey() ? 'Next month' : undefined
  return (
    <Link className="mo-row" to={`/hopefuls/${k}`}>
      <span>
        <span className="mo-row-t" style={{ display: 'block' }}>{monthName(k)}</span>
        <span className="mo-row-s">
          {count === 0 ? 'Nothing picked yet' : `${count} hopeful${count === 1 ? '' : 's'}`}
        </span>
      </span>
      {tag && <span className="mo-open-tag">{tag}</span>}
    </Link>
  )
}
