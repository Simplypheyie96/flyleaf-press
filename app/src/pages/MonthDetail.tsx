import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, StyleId, ExportShape } from '../types'
import { STYLE_IDS, YEAR_COLLAGE_IDS, STYLE_NAMES, STYLE_GROUNDS, liveStyle } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { ExportSheet } from '../components/ExportSheet'
import { StylePicker } from '../components/StylePicker'
import { renderCollage, type MonthData } from '../cards/collage'
import {
  shareCollageImage, buildCollagePage, collageBaseName, type ExportMode,
} from '../share/export'
import {
  monthKey, monthName, currentMonthKey, yearKey, yearName, currentYearKey, isYearKey,
} from '../format'

/* One span's collage — viewable and shareable at any point, open or closed.
   A month offers all seven collage styles; a year offers the four that pack.

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
  /* A year offers only the styles that PACK — the row-per-book ones run to a
     strip at a hundred books. Derived rather than clamped in state, so walking
     month → year → month in one mounted page never loses the picked style. */
  const ids = isYear ? YEAR_COLLAGE_IDS : STYLE_IDS
  const shown = ids.includes(style) ? style : ids[0]
  /* one way out — the sheet shows the collage, its shape, and both
     destinations */
  const [sharing, setSharing] = useState(false)

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
    (host: HTMLDivElement, shape: ExportShape) =>
      books && key ? buildCollagePage({ name: nameOf(key), books, span }, shown, host, shape) : [],
    [books, key, shown, span]
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
              <StylePicker ids={ids} names={STYLE_NAMES} grounds={STYLE_GROUNDS} value={shown} onChange={setStyle} label="Collage style" />
            </div>

            {/* a twenty-book month — let alone a hundred-book year — is taller
                than any phone, so the same clamp the review card uses keeps the
                actions within reach */}
            <CollapsedCard html={renderCollage(month, shown)} />

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
              ids={ids}
              names={STYLE_NAMES}
              grounds={STYLE_GROUNDS}
              value={shown}
              onChange={setStyle}
              label="Collage style"
            />
          }
          build={build}
          shape={settings.exportShape}
          onShape={(s) => db.settings.update(1, { exportShape: s })}
          exportImages={(mode: ExportMode, shape: ExportShape) =>
            shareCollageImage(month, shown, mode, shape)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}
