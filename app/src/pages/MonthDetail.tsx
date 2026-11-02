import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, StyleId, ExportShape } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS, liveStyle } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { ExportSheet } from '../components/ExportSheet'
import { StylePicker } from '../components/StylePicker'
import { useUnlocked } from '../unlock'
import { renderCollage, type MonthData } from '../cards/collage'
import {
  shareCollageImage, buildCollagePage, collageBaseName, SPLIT_FROM, type ExportMode,
} from '../share/export'
import {
  monthKey, monthName, currentMonthKey, yearKey, yearName, currentYearKey, isYearKey,
} from '../format'

/* One span's collage — viewable and shareable at any point, open or closed.
   A month and a year offer every collage style.

   ONE PAGE SERVES THE MONTH AND THE YEAR. A year key is four digits and a
   month key is seven, so `/collage/2026` and `/collage/2026-07` are told apart
   by shape on the way in — no second route, no second page, and no chance of
   the two drifting apart as the collage gains features. The only things the
   span decides are which reviews are gathered, what the heading says, and
   which arithmetic the stats strip runs. */
export function MonthDetail({ settings }: { settings: Settings }) {
  const { key } = useParams()
  const isYear = !!key && isYearKey(key)
  /* one function of the key, used for gathering, for the heading, and for the
     "still open" test — so a month and a year cannot disagree about which
     books belong to them */
  const keyOf = isYear ? yearKey : monthKey
  const nameOf = isYear ? yearName : monthName
  const [style, setStyle] = useState<StyleId>(liveStyle(settings.defaultCollage))
  /* A year offers every style a month does — the list styles split into
     columns, and a reader who wants their year as a ledger should get one. */
  /* one way out — the sheet shows the collage, its shape, and both
     destinations */
  const [sharing, setSharing] = useState(false)
  const unlocked = useUnlocked()

  const books = useLiveQuery(
    () => db.reviews.orderBy('finished').toArray((all) => all.filter((r) => keyOf(r.finished) === key)),
    [key, isYear]
  )

  const span = isYear ? ('year' as const) : ('month' as const)
  const month: MonthData | null = books && key ? { name: nameOf(key), books, span } : null

  /* `month` is rebuilt on every render, so the preview keys off what actually
     changes its contents — the books and the chosen style. Depending on the
     object itself would make the sheet re-lay-out the collage on every tick. */
  const build = useCallback(
    (host: HTMLDivElement, shape: ExportShape, parts: number) =>
      books && key ? buildCollagePage({ name: nameOf(key), books, span }, style, host, shape, parts) : [],
    [books, key, style, span]
  )
  /* A year is megabytes of cover art; the card on the page redraws after a
     style tap has painted (and after the share sheet's note), never before. */
  const shown = useDeferredValue(style)
  const html = useMemo(
    () => (books && key ? renderCollage({ name: nameOf(key), books, span }, shown) : ''),
    [books, key, span, shown]
  )

  if (!month) return null
  const open = key === (isYear ? currentYearKey() : currentMonthKey())
  const unit = isYear ? 'year' : 'month'

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
              <div className="ui-lbl">{isYear ? 'Year' : 'Month'} in progress</div>
              <p>
                {month.books.length} book{month.books.length === 1 ? '' : 's'} so far. Each new
                review joins on its own.
              </p>
            </div>
          </div>
        )}

        {month.books.length === 0 ? (
          <div className="empty">
            <div className="ui-h">Nothing finished this {unit}</div>
            <p>Finish a book and it starts here.</p>
            <Link className="btn" to="/add">Add a book</Link>
          </div>
        ) : (
          <>
            <div className="field">
              <StylePicker ids={STYLE_IDS} names={STYLE_NAMES} grounds={STYLE_GROUNDS} value={style} onChange={setStyle} label="Collage style" />
            </div>

            {/* a twenty-book month — let alone a hundred-book year — is taller
                than any phone, so the same clamp the review card uses keeps the
                actions within reach */}
            <CollapsedCard html={html} />

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
          /* The sheet carries the style picker too, exactly as the review's
             does. It used to carry none, on the argument that the page above
             already had one and a second copy would be two controls for one
             setting — but they are not two settings, they are one `style`
             state driving both, so they cannot disagree. What the argument
             actually cost was the whole point of the sheet: this is the moment
             the card is going out, with the card in front of you, and picking
             its clothes meant closing the sheet, changing it on the page, and
             opening the sheet again to look. */
          picker={
            <StylePicker
              ids={STYLE_IDS}
              names={STYLE_NAMES}
              grounds={STYLE_GROUNDS}
              value={style}
              onChange={setStyle}
              label="Collage style"
            />
          }
          build={build}
          splits={month.books.length > SPLIT_FROM}
          shape={settings.exportShape}
          onShape={(s) => db.settings.update(1, { exportShape: s })}
          exportImages={(mode: ExportMode, shape: ExportShape, parts: number) =>
            shareCollageImage(month, style, mode, shape, parts)}
          locked={unlocked ? undefined : 'Collages come with the unlock. Reviews in Archive and Masthead share free.'}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}
