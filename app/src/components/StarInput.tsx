import { useRef } from 'react'
import { starSvg } from '../cards/assets'
import { fmtRating } from '../format'

/* Interactive 0.25-step rating: drag or click across the five stars, or use
   arrow keys. The stars themselves are the same geometric-fill SVG the cards
   print with, so what you set is exactly what ships. */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const fromClientX = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onChange(Math.max(0.25, Math.round(frac * 5 * 4) / 4))
  }

  /* Theme tokens, not the ink literal these were hardcoded to. --star and
     --star-line only exist inside a .card, and a card is a printed object that
     stays paper-light in both themes — but this control is chrome, and in dark
     mode a #1B1917 star on a #151515 ground is a star you cannot see. */
  const stars = Array.from({ length: 5 }, (_, i) =>
    starSvg(Math.min(1, Math.max(0, value - i)), 30, 'var(--ink)', 'var(--ink-soft)')
  ).join('')

  return (
    <div className="rate-input-row">
      <div
        ref={ref}
        className="stars-input"
        role="slider"
        aria-label="Rating"
        aria-valuemin={0.25}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={value ? `${fmtRating(value)} of 5` : 'Not yet rated'}
        tabIndex={0}
        onPointerDown={(e) => {
          /* THE RATING IS SET FIRST, and the capture is attempted after it.
             It used to be the other way round, which made a tap on a phone do
             nothing at all: setPointerCapture throws for a touch pointer the
             browser has already claimed for its own gesture, and a throw here
             aborts the rest of the handler — including the line that actually
             reads the rating. Dragging is a nicety; landing the tap is the
             whole control. */
          fromClientX(e.clientX)
          dragging.current = true
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* no capture: the drag simply ends when the finger leaves the row */
          }
        }}
        onPointerMove={(e) => dragging.current && fromClientX(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        /* Without this, a pointer the browser cancels mid-gesture leaves
           `dragging` true for good, and the next mouse that merely passes over
           the stars rewrites the rating. */
        onPointerCancel={() => (dragging.current = false)}
        /* The fallback for an engine that gives us a click but no usable
           pointerdown. Harmless where pointerdown worked: it recomputes the
           same fraction from the same x and sets the same value. */
        onClick={(e) => fromClientX(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(5, value + 0.25))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(0.25, value - 0.25))
          }
        }}
        dangerouslySetInnerHTML={{ __html: stars }}
      />
      {/* 0 means untouched, not zero stars — a review saves with the rating you
          gave it, never with one the form picked on your behalf */}
      <span className="rate-input-num">
        {value
          ? <>{fmtRating(value)}<span className="rate-input-of"> / 5</span></>
          : <span className="rate-input-of">Not yet rated</span>}
      </span>
    </div>
  )
}
