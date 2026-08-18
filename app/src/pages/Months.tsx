import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { monthKey, monthName, currentMonthKey, fmtRating } from '../format'

/* Every month with at least one finished book, newest first. The current
   month is just as viewable as a closed one — a collage isn't a month-end
   reward, it's a running tally you can share any day. */
export function Months() {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  if (!reviews) return null

  const nowKey = currentMonthKey()
  const months: { key: string; count: number; avg: number }[] = []
  for (const r of reviews) {
    const k = monthKey(r.finished)
    const m = months.find((x) => x.key === k)
    if (m) { m.count++; m.avg += r.rating }
    else months.push({ key: k, count: 1, avg: r.rating })
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Collage</h1>
          <span>{months.length} collage{months.length === 1 ? '' : 's'}</span>
        </header>

        {months.length === 0 && (
          <div className="empty">
            <div className="ui-h">No months yet</div>
            <p>The first finished book starts this month's collage.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        )}

        <div className="mo-list">
          {months.map((m) => (
            <Link key={m.key} className="mo-row" to={`/collage/${m.key}`}>
              <span>
                <span className="mo-row-t" style={{ display: 'block' }}>{monthName(m.key)}</span>
                <span className="mo-row-s">
                  {m.count} book{m.count > 1 ? 's' : ''} · avg {fmtRating(Math.round((m.avg / m.count) * 4) / 4)}
                </span>
              </span>
              {m.key === nowKey && <span className="mo-open-tag">In progress</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
