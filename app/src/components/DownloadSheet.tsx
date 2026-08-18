import { useEffect, useRef, useState } from 'react'
import { EXPORT_SHAPES, EXPORT_SHAPE_NAMES, SHAPE_W, type ExportShape } from '../types'
import { fileName, makeHost, pixelSize } from '../share/export'

/* Download, with the thing itself in front of you. Saving an image is the one
   action here that produces a file you can't take back out of a camera roll,
   so it shows exactly what is about to be written: the card laid out in the
   chosen shape, its real pixel size, and the filename.
   The style choice is NOT here — it lives on the card's own page, and
   repeating it would make this a second place to change your mind. */
export function DownloadSheet({
  heading,
  baseName,
  build,
  shape,
  onShape,
  onDownload,
  onClose,
}: {
  heading: string
  /** filename without the extension or page number */
  baseName: string
  /** lays the paper pages out into the host, in the given shape */
  build: (host: HTMLDivElement, shape: ExportShape) => HTMLElement[]
  shape: ExportShape
  onShape: (s: ExportShape) => void
  onDownload: (s: ExportShape) => Promise<void>
  onClose: () => void
}) {
  const [pages, setPages] = useState(1)
  /* both shapes, not just the selected one — two figures side by side are what
     make this a like-for-like choice rather than a leap of faith */
  const [px, setPx] = useState<Partial<Record<ExportShape, { w: number; h: number; n: number }>>>({})

  /* A split review saves several leaves and they are not the same height, so a
     lone "900 × 1936" would be describing one of three files as if it were all
     of them. Where that happens the figure drops to the part that is true of
     every image — its width — and the count carries the rest. */
  const figure = (m?: { w: number; h: number; n: number }) =>
    !m ? '…' : m.n > 1 ? `${m.w} px wide · ${m.n} images` : `${m.w} × ${m.h} px`
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  /* The preview is the real export pipeline at a smaller scale — the same
     composition width, the same pagination, the same card — so what is measured
     here is what gets saved. It rebuilds on every shape change because the
     shape IS the layout: the card composes differently at 390 than at 720. */
  useEffect(() => {
    const wrap = wrapRef.current
    const host = hostRef.current
    if (!wrap || !host) return
    const rebuild = () => {
      const built = build(host, shape)
      setPages(built.length)
      /* the unselected shape is measured in a throwaway host, so filling the
         picker never disturbs what is on screen */
      setPx(
        Object.fromEntries(
          EXPORT_SHAPES.map((s) => {
            if (s === shape) return [s, pixelSize(built)]
            const tmp = makeHost()
            try {
              return [s, pixelSize(build(tmp, s))]
            } finally {
              tmp.remove()
            }
          })
        )
      )
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

  const go = async () => {
    setBusy(true)
    try {
      await onDownload(shape)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-scrim" role="dialog" aria-modal="true" aria-label={`Download ${heading}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-sheet">
        <div className="share-sheet-top">
          <div className="ui-lbl">Download · {heading}</div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>

        <div className="share-preview-wrap" ref={wrapRef}>
          <div className="card-wrap share-preview-scale" ref={hostRef} />
        </div>
        <p className="share-note">
          {pages === 1
            ? 'One image — the card, on a paper mat.'
            : `${pages} images — split at a paragraph boundary, so the review saves whole.`}
        </p>

        <div className="field" style={{ marginTop: 18 }}>
          <span className="ui-lbl">Shape</span>
          {/* The name says which layout of the card is being saved; the figure
              under it says how big the file is. No "for X" line — either file
              prints fine and either sits in a camera roll fine, so a use-case
              caption here would be telling the user something untrue. */}
          <div className="size-pick">
            {EXPORT_SHAPES.map((s) => (
              <button key={s} type="button" aria-pressed={shape === s} onClick={() => onShape(s)}>
                <span className="size-pick-n">{EXPORT_SHAPE_NAMES[s]}</span>
                <span className="size-pick-px">{figure(px[s])}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="share-note dl-name">
          Saves as <code>{fileName(baseName, 0, pages)}</code>
          {pages > 1 ? ` and ${pages - 1} more` : ''}
        </p>

        <div className="share-acts">
          <button className="btn" onClick={go} disabled={busy}>
            {busy ? 'Saving…' : pages > 1 ? `Download ${pages} images` : 'Download'}
          </button>
        </div>
      </div>

      {busy && <div className="busy">Preparing images…</div>}
    </div>
  )
}
