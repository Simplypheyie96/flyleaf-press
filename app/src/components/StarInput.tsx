import { useRef, useState } from 'react'
import { starSvg } from '../cards/assets'
import { fmtRating } from '../format'

const STARS = 5
const STEP = 0.25
/* THE STARS ARE THE COARSE CONTROL, and half a star is what people actually
   aim for. Quarters are still there — typed, and one arrow press at a time —
   but they are not something a finger should have to hit: a quarter of a 30px
   star is 7.5px of target, and missing it wrote a rating nobody meant. Halves
   double that to 15px, which is a target rather than a knack. */
const POINTER_STEP = 0.5

/** Snap to the 0.25 grid the cards print on, inside 0–5. */
function snap(n: number): number {
  return Math.min(5, Math.max(0, Math.round(n / STEP) * STEP))
}

/* Interactive 0.25-step rating: type the number, or use the arrow keys, or
   drag or click across the five stars — which set halves, the resolution a
   finger can hold. The stars themselves are the same geometric-fill SVG the
   cards print with, so what you set is exactly what ships. */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  /* What is being typed, which is not always a number yet — "3." and "" are both
     legitimate halfway states, and reformatting them mid-keystroke fights the
     hand that is typing. null means "not being edited: show the value". */
  const [typed, setTyped] = useState<string | null>(null)

  /* EVERY OTHER WAY IN HANDS THE FIELD BACK. Half-typed text outranks the value
     while it is being typed, which is right — but only while the field is the
     thing being used. Touch the stars mid-edit and, without this, the field goes
     on showing the abandoned keystrokes and then commits them over the rating on
     the way out, so the tap you just made is the one thing that does not stick. */
  const set = (v: number) => {
    setTyped(null)
    onChange(v)
  }

  /* THE STAR A FINGER IS OVER DECIDES THE VALUE — this used to be one linear
     map of quarter-cells across the whole row, which spends cells on the 4px
     gaps as well as on the stars. The arithmetic put every whole number in the
     GUTTER: at 30px stars, 3.0 lived in an 8.3px window straddling the gap
     after the third star, so aiming at the third star returned 2.5 and aiming
     just right of it returned 2.75. Reading the star's own box instead means
     the step is a step OF THAT STAR, the whole number is its trailing half
     plus the gap after it, and the fill always ends under the finger. */
  const fromClientX = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const boxes = (Array.from(el.children) as HTMLElement[]).map((c) => c.getBoundingClientRect())
    if (boxes.length !== STARS) return
    const cells = 1 / POINTER_STEP
    if (clientX < boxes[0].left) return set(POINTER_STEP)
    for (let i = STARS - 1; i >= 0; i--) {
      const b = boxes[i]
      if (clientX >= b.left) {
        /* Past this star's right edge means the gap after it, which reads as
           this star full rather than as a fraction of the next one. */
        const within = Math.min(1, (clientX - b.left) / b.width)
        return set(i + Math.max(1, Math.ceil(within * cells)) / cells)
      }
    }
  }

  /* Theme tokens, not the ink literal these were hardcoded to. --star and
     --star-line only exist inside a .card, and a card is a printed object that
     stays paper-light in both themes — but this control is chrome, and in dark
     mode a #1B1917 star on a #151515 ground is a star you cannot see. */
  const stars = Array.from({ length: STARS }, (_, i) =>
    starSvg(Math.min(1, Math.max(0, value - i)), 30, 'var(--ink)', 'var(--ink-soft)')
  ).join('')

  const commit = () => {
    if (typed === null) return
    const t = typed.trim()
    setTyped(null)
    /* Cleared puts it back to "Not yet rated", which is a state the app already
       models — not zero stars. */
    if (t === '') return onChange(0)
    const n = Number(t)
    /* Unparseable simply falls back to what the value already was; there is
       nothing to tell the reader that the field cannot show them itself. */
    if (Number.isFinite(n)) onChange(snap(n))
  }

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
           same value from the same x and sets the same value. */
        onClick={(e) => fromClientX(e.clientX)}
        /* The arrows keep the full 0.25 grid, where the pointer does not: a key
           press cannot miss, so there is nothing to protect it from, and this is
           the only route to a quarter that does not go through the text field. */
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            set(Math.min(5, value + STEP))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            set(Math.max(STEP, value - STEP))
          }
        }}
        dangerouslySetInnerHTML={{ __html: stars }}
      />
      {/* Typed is the precise way in, and it is the numeral that was already
          here rather than a second control below it: a quarter of a 30px star is
          7.5px of target, so a rating you can say out loud should not have to be
          aimed at. 0 means untouched, not zero stars — a review saves with the
          rating you gave it, never with one the form picked on your behalf. */}
      <span className="rate-input-write">
        <input
          className="rate-input-num"
          type="text"
          aria-label="Rating out of 5"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={typed ?? (value ? fmtRating(value) : '')}
          onChange={(e) => setTyped(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setTyped(null)
            }
          }}
        />
        <span className="rate-input-of">{value ? '/ 5' : 'Not yet rated'}</span>
      </span>
    </div>
  )
}
