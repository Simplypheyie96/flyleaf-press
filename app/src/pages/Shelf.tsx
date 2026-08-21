import { useState } from 'react'
import { RestoreNotice } from '../components/RestoreNotice'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, ShelfView, Review } from '../types'
import { STYLE_GROUNDS } from '../types'
import { fmtRating, monthKey, monthName } from '../format'
import { Select } from '../components/Select'

/* The Shelf — the whole library in the reader's choice of display (rows or a
   wall of covers; the choice persists), searchable and sortable. Date sorts keep the month groupings; rating and title sorts are
   one flat run — a month heading over a rating order would lie about both. */

type SortKey = 'newest' | 'oldest' | 'rating-hi' | 'rating-lo' | 'title'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'rating-hi', label: 'Highest rated' },
  { id: 'rating-lo', label: 'Lowest rated' },
  { id: 'title', label: 'Title A–Z' },
]

function sortRows(rows: Review[], sort: SortKey): Review[] {
  const out = [...rows]
  switch (sort) {
    case 'newest': out.sort((a, b) => b.finished.localeCompare(a.finished)); break
    case 'oldest': out.sort((a, b) => a.finished.localeCompare(b.finished)); break
    case 'rating-hi': out.sort((a, b) => b.rating - a.rating || b.finished.localeCompare(a.finished)); break
    case 'rating-lo': out.sort((a, b) => a.rating - b.rating || b.finished.localeCompare(a.finished)); break
    case 'title': out.sort((a, b) => a.title.localeCompare(b.title)); break
  }
  return out
}

export function Shelf({ settings }: { settings: Settings }) {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [openSugg, setOpenSugg] = useState(false)
  const [activeSugg, setActiveSugg] = useState(-1)
  const navigate = useNavigate()
  if (!reviews) return null

  const view = settings.shelfView
  const setView = (shelfView: ShelfView) => db.settings.put({ ...settings, shelfView })

  /* live suggestions under the search box: matching books first (tap → the
     review), then matching authors (tap → search by that author) */
  const needle = q.trim().toLowerCase()
  type Sugg = { kind: 'book'; r: Review } | { kind: 'author'; name: string }
  const suggs: Sugg[] = []
  if (needle) {
    for (const r of reviews) {
      if (suggs.length >= 5) break
      if (r.title.toLowerCase().includes(needle)) suggs.push({ kind: 'book', r })
    }
    const seen = new Set<string>()
    for (const r of reviews) {
      const a = r.author
      if (seen.size >= 3) break
      if (a.toLowerCase().includes(needle) && a.toLowerCase() !== needle && !seen.has(a)) {
        seen.add(a)
        suggs.push({ kind: 'author', name: a })
      }
    }
  }
  const showSugg = openSugg && suggs.length > 0

  const pickSugg = (s: Sugg) => {
    setOpenSugg(false)
    setActiveSugg(-1)
    if (s.kind === 'book') navigate(`/review/${s.r.id}`)
    else setQ(s.name)
  }

  /* Search reaches the writing too. The point of the app is the long review,
     and half of what anyone remembers about a book is a phrase they wrote about
     it rather than its title — "the one where I went on about the salt". The
     suggestions above stay title-and-author: a fragment from the middle of a
     paragraph is a result, not something to autocomplete to. */
  const found = needle
    ? reviews.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          r.author.toLowerCase().includes(needle) ||
          (r.body || '').toLowerCase().includes(needle)
      )
    : reviews
  const rows = sortRows(found, sort)

  /* month groups only when the order IS chronological */
  const grouped = sort === 'newest' || sort === 'oldest'
  const groups: { key: string | null; rows: Review[] }[] = []
  if (grouped) {
    for (const r of rows) {
      const k = monthKey(r.finished)
      const g = groups[groups.length - 1]
      if (g && g.key === k) g.rows.push(r)
      else groups.push({ key: k, rows: [r] })
    }
  } else {
    groups.push({ key: null, rows })
  }

  const rowsView = (list: Review[]) =>
    view === 'list' ? (
      <div className="lib">
        {list.map((r) => (
          <Link key={r.id} className="lib-row" to={`/review/${r.id}`}>
            {r.cover ? (
              <img className="lib-cover" src={r.cover} alt="" />
            ) : (
              <span className="lib-cover-miss">No cover</span>
            )}
            <span>
              <span className="lib-t">{r.title}</span>
              <span className="lib-a" style={{ display: 'block' }}>{r.author}</span>
            </span>
            <span className="lib-r">
              <span className="r-num">{fmtRating(r.rating)}</span>
              <span className="lib-dot" style={{ background: STYLE_GROUNDS[r.style] }} />
            </span>
          </Link>
        ))}
      </div>
    ) : (
      <div className="shelf-grid">
        {list.map((r) => (
          <Link key={r.id} className="shelf-cell" to={`/review/${r.id}`}>
            {r.cover ? (
              <img src={r.cover} alt="" loading="lazy" />
            ) : (
              <span className="lib-cover-miss">No cover</span>
            )}
            <span className="shelf-cell-t">{r.title}</span>
            <span className="shelf-cell-r" style={{ display: 'block' }}>{fmtRating(r.rating)} / 5</span>
          </Link>
        ))}
      </div>
    )

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Shelf</h1>
          <span>{reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
        </header>

        {reviews.length > 0 && (
          <div className="shelf-tools">
            <div className="shelf-search">
              <input
                type="search"
                value={q}
                placeholder="Search books, authors, reviews"
                aria-label="Search the shelf"
                role="combobox"
                aria-expanded={showSugg}
                aria-autocomplete="list"
                aria-controls="shelf-sugg"
                autoComplete="off"
                onChange={(e) => { setQ(e.target.value); setOpenSugg(true); setActiveSugg(-1) }}
                onFocus={() => setOpenSugg(true)}
                onBlur={() => setOpenSugg(false)}
                onKeyDown={(e) => {
                  if (!showSugg) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSugg((i) => (i + 1) % suggs.length) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSugg((i) => (i <= 0 ? suggs.length - 1 : i - 1)) }
                  else if (e.key === 'Enter' && activeSugg >= 0) { e.preventDefault(); pickSugg(suggs[activeSugg]) }
                  else if (e.key === 'Escape') { setOpenSugg(false); setActiveSugg(-1) }
                }}
              />
              {showSugg && (
                <ul className="shelf-sugg" id="shelf-sugg" role="listbox" aria-label="Suggestions">
                  {suggs.map((s, i) => (
                    <li key={s.kind === 'book' ? `b${s.r.id}` : `a${s.name}`} role="option"
                      aria-selected={i === activeSugg}
                      className={i === activeSugg ? 'is-active' : undefined}
                      /* mousedown, not click — the input's blur would close the list first */
                      onMouseDown={(e) => { e.preventDefault(); pickSugg(s) }}>
                      {s.kind === 'book' ? (
                        <>
                          {s.r.cover
                            ? <img src={s.r.cover} alt="" />
                            : <span className="shelf-sugg-miss" aria-hidden="true" />}
                          <span className="shelf-sugg-t">{s.r.title}</span>
                          <span className="shelf-sugg-a">{s.r.author}</span>
                        </>
                      ) : (
                        <>
                          <span className="shelf-sugg-by">By</span>
                          <span className="shelf-sugg-t">{s.name}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shelf-tools-row">
              <Select value={sort} options={SORTS} onChange={setSort} label="Sort the shelf" />
              <div className="seg" role="group" aria-label="Shelf display">
                <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
                <button aria-pressed={view === 'covers'} onClick={() => setView('covers')}>Covers</button>
              </div>
            </div>
          </div>
        )}

        {reviews.length === 0 && (
          <div className="empty">
            <div className="ui-h">Nothing on the shelf yet</div>
            <p>Finish a book, search it, and write as much as you want.</p>
            <Link className="btn" to="/add">Write the first review</Link>
            {/* an empty shelf might be a new reader or a new device — the app
                cannot tell, so it asks rather than assuming the first */}
            <RestoreNotice />
          </div>
        )}

        {reviews.length > 0 && rows.length === 0 && (
          <div className="empty">
            <div className="ui-h">Nothing matches “{q.trim()}”</div>
            <p>No title or author matches.</p>
          </div>
        )}

        {groups.map((g, i) => (
          <section key={g.key ?? `flat-${i}`}>
            {g.key && (
              <div className="sec-h">
                <span className="ui-lbl">
                  {monthName(g.key)} · {g.rows.length} book{g.rows.length === 1 ? '' : 's'}
                </span>
                <Link className="ui-lbl" to={`/collage/${g.key}`}>Collage →</Link>
              </div>
            )}
            {rowsView(g.rows)}
          </section>
        ))}
      </div>
    </div>
  )
}
