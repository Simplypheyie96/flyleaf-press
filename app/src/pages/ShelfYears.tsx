import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Review } from '../types'
import { monthName } from '../format'

/* PROTOTYPE — three ways for the Shelf to hold more than one year of reviews.
   Only the chronological, unsearched list goes through here; a search or a
   rating/title sort still shows every match across every year. */

export type MonthGroup = { key: string; rows: Review[] }
type Props = { groups: MonthGroup[]; rowsView: (list: Review[]) => ReactNode }

export const SHELF_VARIANTS = [
  { key: 'A', name: 'Folded years' },
  { key: 'B', name: 'Year switch' },
  { key: 'C', name: 'Month calendar' },
]

const years = (groups: MonthGroup[]) => [...new Set(groups.map((g) => g.key.slice(0, 4)))]
const inYear = (groups: MonthGroup[], y: string) => groups.filter((g) => g.key.startsWith(y))
const books = (gs: MonthGroup[]) => gs.reduce((n, g) => n + g.rows.length, 0)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function Month({ g, rowsView, bare }: { g: MonthGroup; rowsView: Props['rowsView']; bare?: boolean }) {
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

const Plain = ({ groups, rowsView }: Props) => <>{groups.map((g) => <Month key={g.key} g={g} rowsView={rowsView} />)}</>

/* A — every year but the newest folds into one line, as on the Collage page */
export function FoldedYears({ groups, rowsView }: Props) {
  const ys = years(groups)
  const newest = [...ys].sort().reverse()[0]
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  if (ys.length < 2) return <Plain groups={groups} rowsView={rowsView} />
  const isOpen = (y: string) => flipped[y] ?? y === newest
  return (
    <>
      {ys.map((y) => {
        const mine = inYear(groups, y)
        const open = isOpen(y)
        return (
          <div className="shelf-year" key={y}>
            <button type="button" className="disclose shelf-year-h" aria-expanded={open}
              onClick={() => setFlipped((f) => ({ ...f, [y]: !open }))}>
              <span className="ui-lbl">{y}</span>
              <span className="disclose-right">
                <span className="disclose-val">{plural(mine.length, 'month')} · {plural(books(mine), 'book')}</span>
                <span className="disclose-chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
              </span>
            </button>
            {open && mine.map((g) => <Month key={g.key} g={g} rowsView={rowsView} bare />)}
          </div>
        )
      })}
    </>
  )
}

/* B — one year at a time, picked from a row of years under the tools */
export function YearSwitch({ groups, rowsView }: Props) {
  const ys = years(groups)
  const [pick, setPick] = useState<string | null>(null)
  if (ys.length < 2) return <Plain groups={groups} rowsView={rowsView} />
  const y = pick && ys.includes(pick) ? pick : [...ys].sort().reverse()[0]
  return (
    <>
      <div className="seg shelf-years" role="tablist" aria-label="Year">
        {ys.map((k) => (
          <button key={k} role="tab" aria-selected={k === y} onClick={() => setPick(k)}>
            {k}<span>{books(inYear(groups, k))}</span>
          </button>
        ))}
      </div>
      {inYear(groups, y).map((g) => <Month key={g.key} g={g} rowsView={rowsView} bare />)}
    </>
  )
}

/* C — the newest year as a list; each older year as twelve month tiles,
   a tile opening that month's reviews under the grid */
export function MonthCalendar({ groups, rowsView }: Props) {
  const ys = years(groups)
  const newest = [...ys].sort().reverse()[0]
  const [open, setOpen] = useState<Record<string, string | null>>({})
  if (ys.length < 2) return <Plain groups={groups} rowsView={rowsView} />
  return (
    <>
      {ys.map((y) => {
        const mine = inYear(groups, y)
        if (y === newest) return (
          <div className="shelf-year" key={y}>
            <div className="sec-h shelf-cal-h"><span className="ui-lbl">{y} · {plural(books(mine), 'book')}</span></div>
            {mine.map((g) => <Month key={g.key} g={g} rowsView={rowsView} bare />)}
          </div>
        )
        const byKey = new Map(mine.map((g) => [g.key, g]))
        const sel = open[y] ? byKey.get(open[y]!) : undefined
        return (
          <div className="shelf-year" key={y}>
            <div className="sec-h shelf-cal-h"><span className="ui-lbl">{y} · {plural(books(mine), 'book')}</span></div>
            <div className="shelf-cal">
              {Array.from({ length: 12 }, (_, m) => {
                const key = `${y}-${String(m + 1).padStart(2, '0')}`
                const g = byKey.get(key)
                return (
                  <button key={key} type="button" className="shelf-cal-m" disabled={!g}
                    aria-pressed={sel?.key === key}
                    onClick={() => setOpen((o) => ({ ...o, [y]: o[y] === key ? null : key }))}>
                    <span className="shelf-cal-n">{monthName(key).slice(0, 3)}</span>
                    <span className="shelf-cal-c">{g ? g.rows.length : '–'}</span>
                  </button>
                )
              })}
            </div>
            {sel && <Month g={sel} rowsView={rowsView} />}
          </div>
        )
      })}
    </>
  )
}
