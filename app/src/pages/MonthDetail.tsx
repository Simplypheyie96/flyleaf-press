import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, CollageId, ExportShape } from '../types'
import { COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { ExportSheet } from '../components/ExportSheet'
import { StylePicker } from '../components/StylePicker'
import { renderCollage, type MonthData } from '../cards/collage'
import {
  shareCollageImage, buildCollagePage, collageBaseName, type ExportMode,
} from '../share/export'
import { monthKey, monthName, currentMonthKey } from '../format'

/* One month's collage — viewable and shareable on any day of the month,
   open or closed. All seven collage styles are live here and again at share. */
export function MonthDetail({ settings }: { settings: Settings }) {
  const { key } = useParams()
  const [style, setStyle] = useState<CollageId>(settings.defaultCollage)
  /* one way out — the sheet shows the collage, its shape, and both
     destinations */
  const [sharing, setSharing] = useState(false)

  const books = useLiveQuery(
    () => db.reviews.orderBy('finished').toArray((all) => all.filter((r) => monthKey(r.finished) === key)),
    [key]
  )

  const month: MonthData | null = books && key ? { name: monthName(key), books } : null

  /* `month` is rebuilt on every render, so the preview keys off what actually
     changes its contents — the books and the chosen style. Depending on the
     object itself would make the sheet re-lay-out the collage on every tick. */
  const build = useCallback(
    (host: HTMLDivElement, shape: ExportShape) =>
      books && key ? buildCollagePage({ name: monthName(key), books }, style, host, shape) : [],
    [books, key, style]
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
                {month.books.length} book{month.books.length === 1 ? '' : 's'} so far. Each new
                review joins on its own.
              </p>
            </div>
          </div>
        )}

        {month.books.length === 0 ? (
          <div className="empty">
            <div className="ui-h">Nothing finished this month</div>
            <p>Finish a book and it starts here.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        ) : (
          <>
            <div className="field">
              <span className="ui-lbl">Collage style</span>
              <StylePicker ids={COLLAGE_IDS} names={COLLAGE_NAMES} grounds={COLLAGE_GROUNDS} value={style} onChange={setStyle} />
            </div>

            {/* a twenty-book month is taller than any phone — same clamp the
                review card uses, so the actions stay within reach */}
            <CollapsedCard html={renderCollage(month, style)} />

            {/* the style picker and the card are already on this page, so the
                sheet carries no picker of its own — it opens on the shape and
                the two destinations */}
            <div className="detail-acts detail-acts--one">
              <button className="btn" onClick={() => setSharing(true)}>Share</button>
            </div>
          </>
        )}
      </div>

      {sharing && (
        <ExportSheet
          heading={month.name}
          baseName={collageBaseName(month)}
          build={build}
          shape={settings.exportShape}
          onShape={(s) => db.settings.update(1, { exportShape: s })}
          exportImages={(mode: ExportMode, shape: ExportShape) =>
            shareCollageImage(month, style, mode, shape)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}
