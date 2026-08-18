import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, StyleId, ExportShape } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { Confirm } from '../components/Confirm'
import { ExportSheet } from '../components/ExportSheet'
import { StylePicker } from '../components/StylePicker'
import { renderReviewCard } from '../cards/review'
import { bury } from '../sync/backup'
import {
  paginateReview, shareReviewImages, printReviewPdf, reviewBaseName,
  type ExportMode,
} from '../share/export'

/* One review. The card shows COLLAPSED to hand size — a long review would
   otherwise run the whole phone — and opens on request. Sharing is one button
   opening one sheet: the card as it will go out, the style, the shape, and then
   either hand it to an app or save it. */

export function ReviewDetail({ settings }: { settings: Settings }) {
  const { id } = useParams()
  const nav = useNavigate()
  /* null for "looked and it isn't there", undefined for "still looking" — a
     get() that resolves to undefined is otherwise indistinguishable from the
     first render, and a stale link would sit on a blank page forever */
  const rec = useLiveQuery(() => db.reviews.get(Number(id)).then((r) => r ?? null), [id])
  const [sharing, setSharing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  /* The preview builds in the review's own saved style — the picker inside the
     sheet writes the pick straight to the record, so there is only ever one
     answer to "which style is this card". */
  const build = useCallback(
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
            <p>It was deleted, or the link came from another device.</p>
            <Link className="btn" to="/shelf">Back to the shelf</Link>
          </div>
        </div>
      </div>
    )

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

        {/* One way out. Sharing and saving are the same act until the last
            step, and the step they both needed — seeing the card and choosing
            its shape — used to sit behind only one of them. */}
        <div className="detail-acts detail-acts--one">
          <button className="btn" onClick={() => setSharing(true)}>Share</button>
        </div>

        <div className="detail-acts detail-acts--minor">
          <Link className="btn btn--ghost" to={`/review/${rec.id}/edit`}>Edit</Link>
          <button className="btn btn--danger" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      </div>

      {sharing && (
        <ExportSheet
          heading={rec.title}
          baseName={reviewBaseName(rec)}
          picker={
            <StylePicker
              ids={STYLE_IDS}
              names={STYLE_NAMES}
              grounds={STYLE_GROUNDS}
              value={rec.style}
              onChange={(style: StyleId) => db.reviews.update(rec.id!, { style })}
            />
          }
          shape={settings.exportShape}
          onShape={setShape}
          build={build}
          exportImages={(mode: ExportMode, shape: ExportShape) =>
            shareReviewImages(rec, rec.style, mode, shape)}
          printPdf={settings.pdfEnabled ? () => printReviewPdf(rec, rec.style) : undefined}
          onClose={() => setSharing(false)}
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
