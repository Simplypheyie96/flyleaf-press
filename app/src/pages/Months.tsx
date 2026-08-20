import { useState } from 'react'
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
  )}

/* Every month — and every year — with at least one finished book, newest
   first. The current one is just as viewable as a closed one: a collage isn't
   a month-end reward, it's a running tally you can share any day.

   Months and years are two TABS, not two stacked sections. Stacked, the month
   list grows without a ceiling — two years of reading is ~24 rows, five is 60,
   all in one scroll with the year list riding on top of it. A tab shows one
   kind of span at a time, and inside the Months tab the rows sit under year
   headings once there is more than one year, so a long history reads as
   chapters instead of a single column. The tabs only exist once a year
   qualifies: before that they would be one live tab and one empty one, and the
   page shows the plain month list it always did. */
export function Months() {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  const [tab, setTab] = useState<'months' | 'years'>('months')
  if (!reviews) return null

  const months = group(reviews, monthKey, monthName)
  /* A year is only worth offering once it holds more than one month —
     otherwise January's collage and 2026's collage are the same set of books
     under two names, and the page reads as though it is padding itself. */
  const years = group(reviews, yearKey, (k) => k)
    .filter((y) => months.filter((m) => m.key.startsWith(y.key)).length > 1)
  const tabbed = years.length > 0
  const showing = tabbed && tab === 'years' ? years : months

  /* Year headings inside the Months tab, newest first — and under a heading
     that already says the year, the row says only the month. */
  const monthYears = [...new Set(months.map((m) => m.key.slice(0, 4)))]
  const grouped = monthYears.length > 1

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Collage</h1>
          <span>
            {tabbed
              ? tab === 'years'
                ? `${years.length} year${years.length === 1 ? '' : 's'}`
                : `${months.length} month${months.length === 1 ? '' : 's'}`
              : `${months.length} collage${months.length === 1 ? '' : 's'}`}
          </span>
        </header>

        {months.length === 0 && (
          <div className="empty">
            <div className="ui-h">No months yet</div>
            <p>Finish a book and this month's collage starts.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        )}

        {tabbed && (
          <div className="seg mo-seg" role="group" aria-label="Collage span">
            <button aria-pressed={tab === 'months'} onClick={() => setTab('months')}>Months</button>
            <button aria-pressed={tab === 'years'} onClick={() => setTab('years')}>Years</button>
          </div>
        )}

        {showing === years && years.length > 0 && (
          <div className="field">
            <div className="mo-list">
              {years.map((y) => <SpanRow key={y.key} s={y} open={y.key === currentYearKey()} />)}
            </div>
          </div>
        )}

        {showing === months && months.length > 0 && (
          grouped ? (
            monthYears.map((y) => (
              <div className="field" key={y}>
                <span className="ui-lbl">{y}</span>
                <div className="mo-list">
                  {months.filter((m) => m.key.startsWith(y)).map((m) => (
                    <SpanRow key={m.key} s={{ ...m, label: m.label.replace(` ${y}`, '') }} open={m.key === currentMonthKey()} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="field">
              <div className="mo-list">
                {months.map((m) => <SpanRow key={m.key} s={m} open={m.key === currentMonthKey()} />)}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
