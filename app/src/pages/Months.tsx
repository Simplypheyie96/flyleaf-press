import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { monthKey, monthName, currentMonthKey, yearKey, currentYearKey, fmtRating } from '../format'

interface Span { key: string; label: string; count: number; avg: number }

/* Group finished reviews by a key derived from their finish date, newest
   first. One function for months and years, because the only difference
   between the two lists is how much of the ISO date the key keeps. */
function group(reviews: { finished: string; rating: number }[], of: (iso: string) => string, label: (k: string) => string): Span[] {
  const out: Span[] = []
  for (const r of reviews) {
    const k = of(r.finished)
    const s = out.find((x) => x.key === k)
    if (s) { s.count++; s.avg += r.rating }
    else out.push({ key: k, label: label(k), count: 1, avg: r.rating })
  }
  return out
}

function SpanRow({ s, open }: { s: Span; open: boolean }) {
  return (
    <Link className="mo-row" to={`/collage/${s.key}`}>
      <span>
        <span className="mo-row-t" style={{ display: 'block' }}>{s.label}</span>
        <span className="mo-row-s">
          {s.count} book{s.count > 1 ? 's' : ''} · avg {fmtRating(Math.round((s.avg / s.count) * 4) / 4)}
        </span>
      </span>
      {open && <span className="mo-open-tag">In progress</span>}
    </Link>
  )
}

/* Every month — and every year — with at least one finished book, newest
   first. The current one is just as viewable as a closed one: a collage isn't
   a month-end reward, it's a running tally you can share any day.

   The year list comes first because it is the shorter one and it is the thing
   a shelf of a hundred books is actually for. It uses the same seven styles
   and the same page as a month; only the statistics differ. */
export function Months() {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  if (!reviews) return null

  const months = group(reviews, monthKey, monthName)
  /* A year is only worth offering once it holds more than the one month
     already listed below it — otherwise January's collage and 2026's collage
     are the same set of books under two names, and the page reads as though it
     is padding itself. */
  const years = group(reviews, yearKey, (k) => k)
    .filter((y) => months.filter((m) => m.key.startsWith(y.key)).length > 1)
  const total = months.length + years.length

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Collage</h1>
          <span>{total} collage{total === 1 ? '' : 's'}</span>
        </header>

        {total === 0 && (
          <div className="empty">
            <div className="ui-h">No months yet</div>
            <p>Finish a book and this month's collage starts.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        )}

        {years.length > 0 && (
          <div className="field">
            <span className="ui-lbl">By year</span>
            <div className="mo-list">
              {years.map((y) => <SpanRow key={y.key} s={y} open={y.key === currentYearKey()} />)}
            </div>
          </div>
        )}

        {months.length > 0 && (
          <div className="field">
            {years.length > 0 && <span className="ui-lbl">By month</span>}
            <div className="mo-list">
              {months.map((m) => <SpanRow key={m.key} s={m} open={m.key === currentMonthKey()} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
