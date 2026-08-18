import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, CollageId } from '../types'
import { COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { CardHtml } from '../components/CardHtml'
import { StylePicker } from '../components/StylePicker'
import { ShareSheet } from '../components/ShareSheet'
import { renderCollage, type MonthData } from '../cards/collage'
import { buildCollagePage, shareCollageImage } from '../share/export'
import { monthKey, monthName, currentMonthKey } from '../format'

/* One month's collage — viewable and shareable on any day of the month,
   open or closed. All five collage styles are live here and again at share. */
export function MonthDetail({ settings }: { settings: Settings }) {
  const { key } = useParams()
  const [style, setStyle] = useState<CollageId>(settings.defaultCollage)
  const [sharing, setSharing] = useState(false)

  const books = useLiveQuery(
    () => db.reviews.orderBy('finished').toArray((all) => all.filter((r) => monthKey(r.finished) === key)),
    [key]
  )

  const month: MonthData | null = books && key ? { name: monthName(key), books } : null

  const build = useCallback(
    (s: CollageId, host: HTMLDivElement) => (month ? buildCollagePage(month, s, host) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [books, key]
  )

  if (!month) return null
  const open = key === currentMonthKey()

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>{month.name}</h1>
          <span>
            <Link to="/collage" style={{ color: 'inherit', textDecoration: 'none' }}>← Collage</Link>
          </span>
        </header>

        {open && (
          <div className="notice">
            <div className="notice-txt">
              <div className="ui-lbl">Month in progress</div>
              <p>
                {month.books.length} book{month.books.length === 1 ? '' : 's'} so far. Each new finished
                review joins this collage on its own — share it now or at month-end, it's always current.
              </p>
            </div>
          </div>
        )}

        {month.books.length === 0 ? (
          <div className="empty">
            <div className="ui-h">Nothing finished this month</div>
            <p>The collage assembles itself from finished dates — the first book starts it.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        ) : (
          <>
            <div className="field">
              <span className="ui-lbl">Collage style</span>
              <StylePicker ids={COLLAGE_IDS} names={COLLAGE_NAMES} grounds={COLLAGE_GROUNDS} value={style} onChange={setStyle} />
            </div>

            <CardHtml html={renderCollage(month, style)} />

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
              <button className="btn" onClick={() => setSharing(true)}>Share</button>
            </div>
          </>
        )}
      </div>

      {sharing && (
        <ShareSheet
          heading={month.name}
          ids={COLLAGE_IDS}
          names={COLLAGE_NAMES}
          grounds={COLLAGE_GROUNDS}
          initial={style}
          build={build}
          exportImages={(s, mode) => shareCollageImage(month, s, mode)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}
