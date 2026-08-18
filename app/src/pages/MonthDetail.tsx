import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, CollageId, ExportShape } from '../types'
import { COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { DownloadSheet } from '../components/DownloadSheet'
import { StylePicker } from '../components/StylePicker'
import { renderCollage, type MonthData } from '../cards/collage'
import {
  shareCollageImage, canShareFiles, buildCollagePage, collageBaseName, type ExportMode,
} from '../share/export'
import { monthKey, monthName, currentMonthKey } from '../format'

/* One month's collage — viewable and shareable on any day of the month,
   open or closed. All five collage styles are live here and again at share. */
export function MonthDetail({ settings }: { settings: Settings }) {
  const { key } = useParams()
  const [style, setStyle] = useState<CollageId>(settings.defaultCollage)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [shareable] = useState(canShareFiles)
  /* Download shows what it's about to write; Share hands it straight to
     another app, which shows it for us */
  const [downloading, setDownloading] = useState(false)

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

  const run = async (mode: ExportMode) => {
    setBusy(true)
    setMsg('Preparing the image…')
    try {
      const res = await shareCollageImage(month, style, mode, settings.exportShape)
      if (res.ok) setMsg(res.method === 'share' ? 'Shared.' : 'Saved — check your downloads.')
    } finally {
      setBusy(false)
    }
  }

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

            {/* a twenty-book month is taller than any phone — same clamp the
                review card uses, so the actions stay within reach */}
            <CollapsedCard html={renderCollage(month, style)} />

            {/* the style picker and the card are already on this page, so a
                sheet would only repeat them — Share and Download act straight
                from here on the style shown above */}
            <div className="detail-acts">
              <button className="btn" onClick={() => run('share')} disabled={busy || !shareable}
                title={shareable ? undefined : 'This browser can’t pass files to other apps'}>
                Share
              </button>
              <button className="btn" onClick={() => setDownloading(true)} disabled={busy}>
                Download
              </button>
            </div>
            {!shareable && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                Sharing to another app isn’t available in this browser — Download saves the image
                to your device instead.
              </p>
            )}
            {msg && <p className="field-hint" role="status" style={{ marginTop: 10 }}>{msg}</p>}
          </>
        )}
      </div>

      {downloading && (
        <DownloadSheet
          heading={month.name}
          baseName={collageBaseName(month)}
          build={build}
          shape={settings.exportShape}
          onShape={(s) => db.settings.update(1, { exportShape: s })}
          onDownload={async (s) => {
            const res = await shareCollageImage(month, style, 'download', s)
            if (res.ok) setMsg('Saved — check your downloads.')
          }}
          onClose={() => setDownloading(false)}
        />
      )}
    </div>
  )
}
