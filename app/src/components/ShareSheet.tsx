import { useEffect, useRef, useState } from 'react'
import { StylePicker } from './StylePicker'
import { canShareFiles, type ExportMode, type ExportResult } from '../share/export'

/* The share sheet — where the style choice happens, at share time. Every
   style is on offer, a live scaled preview shows exactly what exports
   (including the page-two split), and the output is always images.
   Share and Download are separate actions: Share hands the images to
   other apps, Download saves them as files. */
export function ShareSheet<T extends string>({
  heading,
  ids,
  names,
  grounds,
  initial,
  build,
  onStyle,
  exportImages,
  printPdf,
  onClose,
}: {
  heading: string
  ids: readonly T[]
  names: Record<T, string>
  grounds: Record<T, string>
  initial: T
  /** builds the paper pages into the host; returns them for counting */
  build: (style: T, host: HTMLDivElement) => HTMLElement[]
  /** called on every pick — lets the choice persist as the record's style */
  onStyle?: (style: T) => void
  exportImages: (style: T, mode: ExportMode) => Promise<ExportResult>
  /** present only when the Settings PDF toggle is on */
  printPdf?: (style: T) => void
  onClose: () => void
}) {
  const [style, setStyle] = useState<T>(initial)
  const [pages, setPages] = useState(1)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  /* desktop browsers mostly can't hand files to other apps — hide Share there */
  const [shareable] = useState(canShareFiles)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  /* rebuild the preview whenever the style changes, and rescale to fit */
  useEffect(() => {
    const wrap = wrapRef.current
    const host = hostRef.current
    if (!wrap || !host) return
    const rebuild = () => {
      const built = build(style, host)
      setPages(built.length)
      const s = Math.min(1, wrap.clientWidth / 720)
      host.style.transform = `scale(${s})`
      host.style.width = '720px'
      let h = 0
      for (const p of built) h += p.offsetHeight + 20
      wrap.style.height = `${Math.ceil(h * s)}px`
    }
    rebuild()
    /* web fonts landing late change page heights — rebuild once they're in */
    document.fonts.ready.then(() => {
      if (hostRef.current) rebuild()
    })
    const ro = new ResizeObserver(rebuild)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [style, build])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (mode: ExportMode) => {
    setBusy(true)
    setDone('')
    try {
      const res = await exportImages(style, mode)
      if (res.ok) {
        setDone(
          res.method === 'share'
            ? 'Shared.'
            : `Saved ${res.pages} image${res.pages > 1 ? 's' : ''} — check your downloads.`
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="share-scrim"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${heading}`}
    >
      <div className="share-sheet">
        <div className="share-sheet-top">
          <div>
            <div className="ui-lbl">Share · {heading}</div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <StylePicker ids={ids} names={names} grounds={grounds} value={style}
          onChange={(s: T) => { setStyle(s); onStyle?.(s) }} />

        <div className="share-preview-wrap" ref={wrapRef}>
          <div className="card-wrap share-preview-scale" ref={hostRef} />
        </div>
        <p className="share-note">
          {pages === 1
            ? 'Fits one page — shared as a single image.'
            : `${pages} pages — split at a paragraph boundary, shared whole as ${pages} images.`}
        </p>

        {/* Two different actions, always both on show. Share hands the images to
            another app; Download writes them to the photo library or downloads
            folder. Where the browser can't pass files to other apps, Share stays
            visible but disabled and says why — silently swapping it for Download
            made one button look like it had turned into the other. */}
        <div className="share-acts">
          <button
            className="btn"
            onClick={() => run('share')}
            disabled={busy || !shareable}
            title={shareable ? undefined : 'This browser can’t pass files to other apps'}
          >
            Share
          </button>
          <button className="btn btn--ghost" onClick={() => run('download')} disabled={busy}>
            {/* just "Download" — the line above already says how many images
                there are, and the longer label was what forced the pair onto
                two rows at 360px */}
            Download
          </button>
          {printPdf && (
            <button className="btn btn--ghost" onClick={() => printPdf(style)} disabled={busy}>
              Save as PDF
            </button>
          )}
        </div>
        {!shareable && (
          <p className="share-note">
            Sharing to another app isn’t available in this browser — Download saves the
            {pages > 1 ? ` ${pages} images` : ' image'} to your device instead.
          </p>
        )}
        {done && <p className="share-note">{done}</p>}
      </div>

      {busy && <div className="busy">Preparing images…</div>}
    </div>
  )
}
