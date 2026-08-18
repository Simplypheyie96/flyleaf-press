import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings } from '../types'
import { STYLE_GROUNDS } from '../types'
import { Face } from '../components/Face'
import { fmtRating, monthKey, monthName, currentMonthKey } from '../format'

/* Home is the reader's, not the library's: a greeting with their face on it,
   the month in progress, and only the latest few reviews. The full library
   lives on its own Shelf tab so this page never turns into a scroll. */

function partOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still awake'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home({ settings }: { settings: Settings }) {
  const reviews = useLiveQuery(() => db.reviews.orderBy('finished').reverse().toArray(), [])
  if (!reviews) return null

  const nowKey = currentMonthKey()
  const year = new Date().getFullYear()
  const thisMonth = reviews.filter((r) => monthKey(r.finished) === nowKey)
  const thisYear = reviews.filter((r) => r.finished.startsWith(String(year)))
  const avg = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 4) / 4
    : 0
  const latest = reviews.slice(0, 3)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="home-mast">
          {settings.face && <Face seed={settings.face} size={54} />}
          <div>
            <div className="home-hello">{partOfDay()}{settings.name ? ',' : ''}</div>
            {settings.name && <div className="home-who">{settings.name}</div>}
            <div className="home-tally">Flyleaf Press · {year}</div>
          </div>
        </header>

        {reviews.length > 0 && (
          <div className="home-stats">
            <div className="home-stat">
              <div className="home-stat-n">{thisMonth.length}</div>
              <div className="ui-lbl">This month</div>
            </div>
            <div className="home-stat">
              <div className="home-stat-n">{thisYear.length}</div>
              <div className="ui-lbl">This year</div>
            </div>
            <div className="home-stat">
              <div className="home-stat-n">{fmtRating(avg)}</div>
              <div className="ui-lbl">Avg rating</div>
            </div>
          </div>
        )}

        {thisMonth.length > 0 && (
          <div className="notice">
            <div className="notice-txt">
              <div className="ui-lbl">{monthName(nowKey)} · in progress</div>
              <p>
                {thisMonth.length} book{thisMonth.length > 1 ? 's' : ''} finished so far — the
                collage is ready to view or share any day, not just at month-end.
              </p>
            </div>
            <Link className="btn btn--ghost btn--sm" to={`/collage/${nowKey}`}>
              View collage
            </Link>
          </div>
        )}

        {reviews.length === 0 && (
          <div className="empty">
            <div className="ui-h">Nothing here yet</div>
            <p>Finish a book, search it, and write however much you want. The review ships whole.</p>
            <Link className="btn" to="/add">Write the first review</Link>
          </div>
        )}

        {latest.length > 0 && (
          <>
            <div className="sec-h">
              <span className="ui-lbl">Latest reviews</span>
              <Link className="ui-lbl" to="/shelf">Shelf →</Link>
            </div>
            <div className="lib">
              {latest.map((r) => (
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
          </>
        )}
      </div>
    </div>
  )
}
