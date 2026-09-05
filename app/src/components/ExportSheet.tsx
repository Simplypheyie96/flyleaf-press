import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EXPORT_SHAPES, EXPORT_SHAPE_NAMES, SHAPE_W, type ExportShape } from '../types'
import {
  canShareFiles, fileName, pixelSize, savesViaSystemSheet,
  type ExportMode, type ExportResult,
} from '../share/export'

/* One sheet for both ways out. Share and Save used to be two buttons on the
   page with a preview behind only one of them, so sharing — the thing the app
   exists for — was the path that never showed you what you were about to hand
   over, and never let you choose its size. They are the same act up to the
   last step now: look at the card, pick the size, then either hand it to
   another app or write it to the device.
   The style picker rides along, because the preview is right here and the
   moment of sending is the moment you care what it looks like. Both pages pass
   one; each drives the same state its own page picker drives, so the two
   copies can never disagree. */
export function ExportSheet({
  heading,
  baseName,
  picker,
  shape,
  onShape,
  build,
  exportImages,
  printPdf,
  onClose,
}: {
  heading: string
  /** filename without the extension or page number */
  baseName: string
  /** the card's own style control, when it has one */
  picker?: ReactNode
  shape: ExportShape
  onShape: (s: ExportShape) => void
  /** lays the paper pages out into the host, in the given shape */
  build: (host: HTMLDivElement, shape: ExportShape) => HTMLElement[]
  exportImages: (mode: ExportMode, shape: ExportShape) => Promise<ExportResult>
  /** present only when the Settings PDF toggle is on */
  printPdf?: () => void
  onClose: () => void
}) {
  /* desktop browsers mostly can't hand files to another app — Share stays
     visible there and says why, rather than vanishing */
  const [shareable] = useState(canShareFiles)
  /* iOS reaches the camera roll only through the system sheet, so what Save
     does there is worth saying before it is pressed */
  const viaSheet = savesViaSystemSheet()
  const [pages, setPages] = useState(1)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  /* both shapes, not just the selected one — two figures side by side are what
     make this a like-for-like choice rather than a leap of faith */
  const [px, setPx] = useState<Partial<Record<ExportShape, { w: number; h: number; n: number }>>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  /* A split review saves several leaves and they are not the same height, so a
     lone "900 × 1936" would describe one of three files as if it were all of
     them. Where that happens the figure drops to the part that is true of every
     image — its width — and the count carries the rest. */
  const figure = (m?: { w: number; h: number; n: number }) =>
    !m ? '…' : m.n > 1 ? `${m.w} px wide · ${m.n} images` : `${m.w} × ${m.h} px`

  /* The preview is the real export pipeline at a smaller scale — same
     composition width, same pagination, same card — so what is measured here
     is what gets sent. The two options are two COLUMN widths, so the
     unselected figure has to come off its own layout: build it first, measure
     it, then build the chosen one last so the preview shows the layout that
     will actually go out. */
  useEffect(() => {
    const wrap = wrapRef.current
    const host = hostRef.current
    if (!wrap || !host) return
    const rebuild = () => {
      const measured: Partial<Record<ExportShape, { w: number; h: number; n: number }>> = {}
      for (const s of EXPORT_SHAPES.filter((s) => s !== shape)) {
        measured[s] = pixelSize(build(host, s))
      }
      const built = build(host, shape)
      measured[shape] = pixelSize(built)
      setPages(built.length)
      setPx(measured)
      const k = Math.min(1, wrap.clientWidth / SHAPE_W[shape])
      host.style.transform = `scale(${k})`
      let h = 0
      for (const p of built) h += p.offsetHeight + 20
      wrap.style.height = `${Math.ceil(h * k)}px`
    }
    rebuild()
    /* web fonts landing late change page heights — rebuild once they're in */
    document.fonts.ready.then(() => {
      if (hostRef.current) rebuild()
    })
    const ro = new ResizeObserver(rebuild)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [build, shape])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (mode: ExportMode) => {
    setBusy(true)
    setDone('')
    try {
      const res = await exportImages(mode, shape)
      if (res.ok) {
        const n = `${res.pages} image${res.pages > 1 ? 's' : ''}`
        setDone(
          res.method === 'share'
            ? 'Shared.'
            : res.method === 'save'
              /* the system sheet did the saving, and where it put them is
                 whatever the user chose in it — so don't name a place */
              ? `Sent ${n} to the share sheet.`
              : `Saved ${n} — check your downloads.`
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-scrim" role="dialog" aria-modal="true" aria-label={`Share ${heading}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-sheet">
        <div className="share-sheet-top">
          <div className="ui-lbl">Share · {heading}</div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>

        {picker}

        <div className="share-preview-wrap" ref={wrapRef}>
          <div className="card-wrap share-preview-scale" ref={hostRef} />
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <span className="ui-lbl">Size</span>
          {/* The name says which layout of the card is going out; the figure
              under it says how big the file is. */}
          <div className="size-pick">
            {EXPORT_SHAPES.map((s) => (
              <button key={s} type="button" aria-pressed={shape === s} onClick={() => onShape(s)}>
                <span className="size-pick-n">{EXPORT_SHAPE_NAMES[s]}</span>
                <span className="size-pick-px">{figure(px[s])}</span>
              </button>
            ))}
          </div>
        </div>

        {/* On iOS a saved file goes through the system sheet, which is the only
            route to the camera roll — and it renames what it takes, so a
            filename here would be a promise this device does not keep. */}
        {!viaSheet && (
          <p className="share-note dl-name">
            Saves as <code>{fileName(baseName, 0, pages)}</code>
            {pages > 1 ? ` and ${pages - 1} more` : ''}
          </p>
        )}

        <div className="share-acts">
          <button className="btn" onClick={() => run('share')} disabled={busy || !shareable}
            title={shareable ? undefined : 'This browser can’t pass files to other apps'}>
            Share
          </button>
          <button className="btn btn--ghost" onClick={() => run('download')} disabled={busy}>
            {pages > 1 ? `Save ${pages} images` : 'Save image'}
          </button>
          {printPdf && (
            <button className="btn btn--ghost" onClick={printPdf} disabled={busy}>
              Save as PDF
            </button>
          )}
        </div>
        {!shareable && (
          <p className="share-note">
            This browser can’t pass files to other apps. Save writes
            {pages > 1 ? ` the ${pages} images` : ' the image'} to this device instead.
          </p>
        )}
        {viaSheet && (
          <p className="share-note">
            Saving opens the iOS sheet — choose <b>Save {pages > 1 ? 'Images' : 'Image'}</b> in it.
          </p>
        )}
        {done && <p className="share-note" role="status">{done}</p>}
      </div>

      {busy && <div className="busy">Preparing images…</div>}
    </div>
  )
}
