import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, StyleId, ExportShape } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { Confirm } from '../components/Confirm'
import { ShareSheet } from '../components/ShareSheet'
import { DownloadSheet } from '../components/DownloadSheet'
import { renderReviewCard } from '../cards/review'
import { bury } from '../sync/backup'
import {
  paginateReview, shareReviewImages, printReviewPdf, canShareFiles,
  reviewBaseName, type ExportMode,
} from '../share/export'

/* One review. The card shows COLLAPSED to hand size — a long review would
   otherwise run the whole phone — and opens on request. Style choice lives on
   the share sheet only; the pick made there persists as the review's style. */

export function ReviewDetail({ settings }: { settings: Settings }) {
  const { id } = useParams()
  const nav = useNavigate()
  /* null for "looked and it isn't there", undefined for "still looking" — a
     get() that resolves to undefined is otherwise indistinguishable from the
     first render, and a stale link would sit on a blank page forever */
  const rec = useLiveQuery(() => db.reviews.get(Number(id)).then((r) => r ?? null), [id])
  const [sharing, setSharing] = useState(false)
  /* Download opens a sheet; Share does not. Sharing hands the image straight
     to another app, which shows it to you itself — a preview step there would
     be a picture of a picture. Downloading writes a file to the device, so it
     gets to show what it is writing and how large first. */
  const [downloading, setDownloading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  /* desktop browsers mostly can't hand files to another app — the button stays
     visible and says why rather than vanishing */
  const [shareable] = useState(canShareFiles)

  /* the style sheet's own preview is always the wide layout — it is there to
     compare grounds, and a narrow card would compare them at a disadvantage */
  const build = useCallback(
    (style: StyleId, host: HTMLDivElement) => (rec ? paginateReview(rec, style, host, 'wide') : []),
    [rec]
  )
  /* the download preview always uses the review's own saved style — the style
     choice belongs to the card, not to the act of saving it */
  const buildSaved = useCallback(
    (host: HTMLDivElement, shape: ExportShape) =>
      rec ? paginateReview(rec, rec.style, host, shape) : [],
    [rec]
  )
  const setShape = (s: ExportShape) => db.settings.update(1, { exportShape: s })

  if (rec === undefined) return null
  if (rec === null)
    return (
      <div className="page">
        <div className="page-inner">
          <header className="app-head">
            <h1>Not here</h1>
            <span>
              <Link to="/shelf" style={{ color: 'inherit', textDecoration: 'none' }}>← Shelf</Link>
            </span>
          </header>
          <div className="empty">
            <div className="ui-h">This review isn’t on the shelf</div>
            <p>It was deleted, or the link came from another device — the library lives on each device on its own.</p>
            <Link className="btn" to="/shelf">Back to the shelf</Link>
          </div>
        </div>
      </div>
    )

  /* the review's own style is what ships — the sheet is where that is changed,
     but changing it is not a step you have to walk through to share */
  const run = async (mode: ExportMode) => {
    setBusy(true)
    setMsg('Preparing images…')
    try {
      const res = await shareReviewImages(rec, rec.style, mode, settings.exportShape)
      if (res.ok)
        setMsg(
          res.method === 'share'
            ? 'Shared.'
            : `Saved ${res.pages} image${res.pages > 1 ? 's' : ''} — check your downloads.`
        )
    } finally {
      setBusy(false)
    }
  }

  /* in-app confirm, never window.confirm() — that silently no-ops in some
     installed-PWA webviews, which read as "the delete button does nothing" */
  const del = async () => {
    /* the headstone first, so the deletion can travel to the other device
       instead of being undone by it on the next merge */
    await bury(rec)
    await db.reviews.delete(rec.id!)
    nav('/shelf', { replace: true })
  }

  return (
    <div className="page">
      <div className="page-inner">
        {/* The book, not the serial. "Nº 24" as the page's largest text told
            nobody anything — it's this review's place in the shelf's running
            order, which is worth printing on the colophon and worth a caption
            here, but never worth being the headline. */}
        <header className="app-head">
          <div className="head-id">
            <h1>{rec.title}</h1>
            <span className="ui-lbl">{rec.author} · Review Nº {rec.no}</span>
          </div>
          <span>
            <Link to="/shelf" style={{ color: 'inherit', textDecoration: 'none' }}>← Shelf</Link>
          </span>
        </header>

        <CollapsedCard html={renderReviewCard(rec)} />

        {/* Share and Download are the two things anyone came here to do, so they
            are the two buttons on the page — not a sheet you open to find them.
            The sheet is now only for changing the style, which is a choice, not
            a step on the way out. */}
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

        <div className="detail-acts detail-acts--minor">
          <button className="btn btn--ghost" onClick={() => setSharing(true)}>Change style</button>
          <Link className="btn btn--ghost" to={`/review/${rec.id}/edit`}>Edit</Link>
          <button className="btn btn--danger" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      </div>

      {sharing && (
        <ShareSheet
          heading={rec.title}
          ids={STYLE_IDS}
          names={STYLE_NAMES}
          grounds={STYLE_GROUNDS}
          initial={rec.style}
          build={build}
          onStyle={(style) => db.reviews.update(rec.id!, { style })}
          exportImages={(style, mode) => shareReviewImages(rec, style, mode, settings.exportShape)}
          printPdf={settings.pdfEnabled ? (style) => printReviewPdf(rec, style) : undefined}
          onClose={() => setSharing(false)}
        />
      )}

      {downloading && (
        <DownloadSheet
          heading={rec.title}
          baseName={reviewBaseName(rec)}
          build={buildSaved}
          shape={settings.exportShape}
          onShape={setShape}
          onDownload={async (s) => {
            const res = await shareReviewImages(rec, rec.style, 'download', s)
            if (res.ok) setMsg(`Saved ${res.pages} image${res.pages > 1 ? 's' : ''} — check your downloads.`)
          }}
          onClose={() => setDownloading(false)}
        />
      )}

      {confirming && (
        <Confirm
          title="Delete this review?"
          body={`“${rec.title}” comes off the shelf and out of its month's collage. This can't be undone.`}
          action="Delete"
          onConfirm={del}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
