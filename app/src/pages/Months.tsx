import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { monthKey, monthName, currentMonthKey, yearKey, currentYearKey, fmtRating } from '../format'

interface Span { key: string; label: string; count: number; avg: number }

/* What each tab actually holds, in one line under the control.

   "Months" could as easily be a filter on the shelf as a card per month, and
   a reader who has never opened one has no way to find out except by pressing
   it. So the line says what
   the tab makes, not what the tab contains — the page is a set of cards you
   hand out, and the count in the header already reports how many there are. */
const TAB_NOTE = {
  months: 'One card for each month, holding every book you finished in it.',
  years: 'A whole year on one card — the books, and the month you read most.',
}

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
   headings once there is more than one year — FOLDED, all but the newest, so a
   long history reads as chapters instead of a single column and a new year
   clears the page behind it. The Years tab appears only once a year
   qualifies — before that it would be an empty tab — and so does the control.
   Hopefuls used to be a third tab here; they live on the Reading home now,
   beside the book in hand, because they are what you read next, not a span. */
export function Months() {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  const [tab, setTab] = useState<'months' | 'years'>('months')
  /* Which year sections have been opened or shut BY HAND. Only the exceptions
     are held, never the whole state — the default is a rule (the newest year
     is open, every earlier one is a single line), and a Set seeded once from
     the data would be a copy of that rule that stops following it the moment
     the newest year changes underneath it. Which is exactly the case this is
     for: the first book finished in January makes a new year the newest one,
     and nothing here has to be told. */
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  if (!reviews) return null

  const months = group(reviews, monthKey, monthName)
  /* A year is only worth offering once it holds more than one month —
     otherwise January's collage and 2026's collage are the same set of books
     under two names, and the page reads as though it is padding itself. */
  const years = group(reviews, yearKey, (k) => k)
    .filter((y) => months.filter((m) => m.key.startsWith(y.key)).length > 1)
  const tabbed = years.length > 0

  /* Year headings inside the Months tab, newest first — and under a heading
     that already says the year, the row says only the month. */
  const monthYears = [...new Set(months.map((m) => m.key.slice(0, 4)))]
  const grouped = monthYears.length > 1
  /* …and every year but the newest is FOLDED SHUT. A month list has no ceiling
     — two years of reading is ~24 rows, five is 60 — and the rows a reader
     wants are almost always this year's, so the tab opens on this year alone
     and the rest of the reading is one line each. The moment a book is
     finished in January, that new year is `monthYears[0]` and the old one
     closes behind it on its own, which is the "start afresh" this is for.
     Nothing is hidden: a shut year says how many months and how many books it
     holds, and opens on one press. */
  const openYear = (y: string) => flipped[y] ?? y === monthYears[0]
  const flip = (y: string) => setFlipped((f) => ({ ...f, [y]: !openYear(y) }))

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Collage</h1>
          <span>
            {tab === 'years'
                ? `${years.length} year${years.length === 1 ? '' : 's'}`
                : `${months.length} month${months.length === 1 ? '' : 's'}`}
          </span>
        </header>

        {tab === 'months' && months.length === 0 && (
          <div className="empty">
            <div className="ui-h">No months yet</div>
            <p>Finish a book and this month's collage starts.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        )}

        {tabbed && (
          <div className="seg mo-seg mo-seg--noted" role="group" aria-label="Collage span">
            <button aria-pressed={tab === 'months'} onClick={() => setTab('months')}>Months</button>
            <button aria-pressed={tab === 'years'} onClick={() => setTab('years')}>Years</button>
          </div>
        )}

        <p className="mo-note">{TAB_NOTE[tab]}</p>

        {tab === 'years' && years.length > 0 && (
          <div className="field">
            <div className="mo-list">
              {years.map((y) => <SpanRow key={y.key} s={y} open={y.key === currentYearKey()} />)}
            </div>
          </div>
        )}

        {tab === 'months' && months.length > 0 && (
          grouped ? (
            monthYears.map((y) => {
              const mine = months.filter((m) => m.key.startsWith(y))
              const books = mine.reduce((n, m) => n + m.count, 0)
              const open = openYear(y)
              return (
                <div className="field" key={y}>
                  <button type="button" className="disclose" aria-expanded={open} onClick={() => flip(y)}>
                    <span className="ui-lbl">{y}</span>
                    <span className="disclose-right">
                      <span className="disclose-val">
                        {mine.length} month{mine.length === 1 ? '' : 's'} · {books} book{books === 1 ? '' : 's'}
                      </span>
                      <span className="disclose-chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="mo-list mo-list-fold">
                      {mine.map((m) => (
                        <SpanRow key={m.key} s={{ ...m, label: m.label.replace(` ${y}`, '') }} open={m.key === currentMonthKey()} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
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
