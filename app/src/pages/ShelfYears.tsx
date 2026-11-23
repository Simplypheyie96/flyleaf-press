import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Review } from '../types'
import { monthName } from '../format'

/* A library that outlives its first year: the newest year reads as the list
   it always was, and every year before it folds to one line, as on the
   Collage page. Open a past year and it becomes twelve month tiles — a year
   of reviews is a scroll nobody makes; a month is the thing remembered.
   A search or a rating/title sort never comes through here: it crosses every
   year. */

export type MonthGroup = { key: string; rows: Review[] }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/* One line per year, the newest open. With a single year there is nothing to
   fold, so the year's content shows bare. */
export function YearFold({ years, summary, children }: {
  /** in the list's own order; the first is open */
  years: string[]
  summary: (y: string) => string
  children: (y: string, newest: boolean) => ReactNode
}) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  if (years.length < 2) return <>{years[0] && children(years[0], true)}</>
  return (
    <>
      {years.map((y, i) => {
        const open = flipped[y] ?? i === 0
        return (
          <div className="shelf-year" key={y}>
            <button type="button" className="disclose shelf-year-h" aria-expanded={open}
              onClick={() => setFlipped((f) => ({ ...f, [y]: !open }))}>
              <span className="ui-lbl">{y}</span>
              <span className="disclose-right">
                <span className="disclose-val">{summary(y)}</span>
                <span className="disclose-chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
              </span>
            </button>
            {open && children(y, i === 0)}
          </div>
        )
      })}
    </>
  )
}

function Month({ g, rowsView, bare }: { g: MonthGroup; rowsView: (list: Review[]) => ReactNode; bare?: boolean }) {
  const name = monthName(g.key)
  return (
    <section>
      <div className="sec-h">
        <span className="ui-lbl">{bare ? name.split(' ')[0] : name} · {plural(g.rows.length, 'book')}</span>
        <Link className="ui-lbl" to={`/collage/${g.key}`}>Collage →</Link>
      </div>
      {rowsView(g.rows)}
    </section>
  )
}

function MonthTiles({ y, mine, rowsView }: { y: string; mine: MonthGroup[]; rowsView: (list: Review[]) => ReactNode }) {
  const [pick, setPick] = useState<string | null>(null)
  const byKey = new Map(mine.map((g) => [g.key, g]))
  const sel = pick ? byKey.get(pick) : undefined
  return (
    <>
      <div className="shelf-cal">
        {Array.from({ length: 12 }, (_, m) => {
          const key = `${y}-${String(m + 1).padStart(2, '0')}`
          const g = byKey.get(key)
          return (
            <button key={key} type="button" className="shelf-cal-m" disabled={!g}
              aria-pressed={sel?.key === key} aria-label={`${monthName(key)}, ${plural(g?.rows.length ?? 0, 'book')}`}
              onClick={() => setPick((p) => (p === key ? null : key))}>
              <span className="shelf-cal-n">{monthName(key).slice(0, 3)}</span>
              <span className="shelf-cal-c">{g ? g.rows.length : '–'}</span>
            </button>
          )
        })}
      </div>
      {sel && <Month g={sel} rowsView={rowsView} />}
    </>
  )
}

export function ShelfYears({ groups, rowsView }: { groups: MonthGroup[]; rowsView: (list: Review[]) => ReactNode }) {
  const years = [...new Set(groups.map((g) => g.key.slice(0, 4)))]
  const inYear = (y: string) => groups.filter((g) => g.key.startsWith(y))
  return (
    <YearFold years={years}
      summary={(y) => plural(inYear(y).reduce((n, g) => n + g.rows.length, 0), 'book')}>
      {(y, newest) => newest
        ? inYear(y).map((g) => <Month key={g.key} g={g} rowsView={rowsView} bare={years.length > 1} />)
        : <MonthTiles key={y} y={y} mine={inYear(y)} rowsView={rowsView} />}
    </YearFold>
  )
}
