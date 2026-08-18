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

  const stars = Array.from({ length: 5 }, (_, i) =>
    starSvg(Math.min(1, Math.max(0, value - i)), 30, '#1B1917', '#1B1917')
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
        aria-valuetext={`${fmtRating(value)} of 5`}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromClientX(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && fromClientX(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
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
      <span className="rate-input-num">
        {fmtRating(value)}<span className="rate-input-of"> / 5</span>
      </span>
    </div>
  )
}
