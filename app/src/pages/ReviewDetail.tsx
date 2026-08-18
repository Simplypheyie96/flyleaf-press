import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, StyleId } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS } from '../types'
import { CardHtml } from '../components/CardHtml'
import { Confirm } from '../components/Confirm'
import { ShareSheet } from '../components/ShareSheet'
import { renderReviewCard } from '../cards/review'
import { paginateReview, shareReviewImages, printReviewPdf } from '../share/export'

/* One review. The card shows COLLAPSED to hand size — a long review would
   otherwise run the whole phone — and opens on request. Style choice lives on
   the share sheet only; the pick made there persists as the review's style. */

function CollapsedCard({ html }: { html: string }) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > 460)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [html])

  const clamped = overflows && !open
  return (
    <>
      <div ref={ref} className={clamped ? 'card-clamp' : undefined}>
        <CardHtml html={html} />
      </div>
      {overflows && (
        <div className="card-clamp-btn">
          <button className="btn btn--ghost btn--sm" onClick={() => setOpen(!open)}>
            {open ? 'Collapse card' : 'Show the full card'}
          </button>
        </div>
      )}
    </>
  )
}

export function ReviewDetail({ settings }: { settings: Settings }) {
  const { id } = useParams()
  const nav = useNavigate()
  const rec = useLiveQuery(() => db.reviews.get(Number(id)), [id])
  const [sharing, setSharing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const build = useCallback(
    (style: StyleId, host: HTMLDivElement) => (rec ? paginateReview(rec, style, host) : []),
    [rec]
  )

  if (!rec) return null

  /* in-app confirm, never window.confirm() — that silently no-ops in some
     installed-PWA webviews, which read as "the delete button does nothing" */
  const del = async () => {
    await db.reviews.delete(rec.id!)
    nav('/shelf', { replace: true })
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Nº {rec.no}</h1>
          <span>
            <Link to="/shelf" style={{ color: 'inherit', textDecoration: 'none' }}>← Shelf</Link>
          </span>
        </header>

        <CollapsedCard html={renderReviewCard(rec)} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
          <button className="btn" onClick={() => setSharing(true)}>Share</button>
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
          exportImages={(style, mode) => shareReviewImages(rec, style, mode)}
          printPdf={settings.pdfEnabled ? (style) => printReviewPdf(rec, style) : undefined}
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
