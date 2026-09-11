import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { monthKey, monthName, currentMonthKey, yearKey, currentYearKey, fmtRating } from '../format'

/* The month after this one, as a key. A hopefuls list is written BEFORE the
   month it is for, so next month has to be reachable — otherwise the one list
   you would sit down to make on the 28th is the one the page cannot open. */
function nextMonthKey(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
  return d.toISOString().slice(0, 7)
}

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

function HopeRow({ k, count, tag }: { k: string; count: number; tag?: string }) {
  return (
    <Link className="mo-row" to={`/hopefuls/${k}`}>
      <span>
        <span className="mo-row-t" style={{ display: 'block' }}>{monthName(k)}</span>
        <span className="mo-row-s">
          {count === 0
            ? 'Nothing picked yet'
            : `${count} hopeful${count === 1 ? '' : 's'}`}
        </span>
      </span>
      {tag && <span className="mo-open-tag">{tag}</span>}
    </Link>
  )
}

/* Every month — and every year — with at least one finished book, newest
   first. The current one is just as viewable as a closed one: a collage isn't
   a month-end reward, it's a running tally you can share any day.

   Months and years are two TABS, not two stacked sections. Stacked, the month
   list grows without a ceiling — two years of reading is ~24 rows, five is 60,
   all in one scroll with the year list riding on top of it. A tab shows one
   kind of span at a time, and inside the Months tab the rows sit under year
   headings once there is more than one year, so a long history reads as
   chapters instead of a single column. The Years tab appears only once a year
   qualifies — before that it would be an empty tab — but the control itself is
   always up, because HOPEFULS is always offered: every month has a list of
   books somebody means to read, including the one that has not started yet.

   Hopefuls is a tab here rather than a fifth item in the nav because the nav
   has no room for one: at 360px the bar is 340px wide, and five tabs plus the
   active tab's label overflow it. It belongs on this page anyway — a hopefuls
   list is a collage, made of the same seven printed objects, and the only
   thing that differs is that the books have not been read. */
export function Months() {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  const hopefuls = useLiveQuery(() => db.hopefuls.toArray(), [])
  const [tab, setTab] = useState<'months' | 'years' | 'hopefuls'>('months')
  if (!reviews || !hopefuls) return null

  const months = group(reviews, monthKey, monthName)
  /* A year is only worth offering once it holds more than one month —
     otherwise January's collage and 2026's collage are the same set of books
     under two names, and the page reads as though it is padding itself. */
  const years = group(reviews, yearKey, (k) => k)
    .filter((y) => months.filter((m) => m.key.startsWith(y.key)).length > 1)
  const tabbed = years.length > 0

  /* The hopefuls tab always has somewhere to go: this month, next month, and
     any other month a list has already been started for — deduped, newest
     first. A tab that could open on nothing would be a dead end on a feature
     whose whole job is to be filled in. */
  const hopeCount = new Map<string, number>()
  for (const h of hopefuls) hopeCount.set(h.month, (hopeCount.get(h.month) ?? 0) + 1)
  const here = currentMonthKey()
  const next = nextMonthKey()
  const hopeKeys = [...new Set([next, here, ...hopeCount.keys()])].sort().reverse()

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
            {tab === 'hopefuls'
              ? `${hopefuls.length} hopeful${hopefuls.length === 1 ? '' : 's'}`
              : tab === 'years'
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

        <div className="seg mo-seg" role="group" aria-label="Collage span">
          <button aria-pressed={tab === 'months'} onClick={() => setTab('months')}>Months</button>
          {tabbed && (
            <button aria-pressed={tab === 'years'} onClick={() => setTab('years')}>Years</button>
          )}
          <button aria-pressed={tab === 'hopefuls'} onClick={() => setTab('hopefuls')}>Hopefuls</button>
        </div>

        {tab === 'hopefuls' && (
          <div className="field">
            <div className="mo-list">
              {hopeKeys.map((k) => (
                <HopeRow
                  key={k}
                  k={k}
                  count={hopeCount.get(k) ?? 0}
                  tag={k === here ? 'This month' : k === next ? 'Next month' : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'years' && years.length > 0 && (
          <div className="field">
            <div className="mo-list">
              {years.map((y) => <SpanRow key={y.key} s={y} open={y.key === currentYearKey()} />)}
            </div>
          </div>
        )}

        {tab === 'months' && months.length > 0 && (
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
