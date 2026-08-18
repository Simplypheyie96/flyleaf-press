import { useLayoutEffect, useRef, useState } from 'react'
import { CardHtml } from './CardHtml'

/* A card shown at hand size, with the rest a tap away. Long reviews and long
   months both run past the height of a phone; clamping keeps the page a page
   and the actions reachable without a scroll to the bottom of a paper leaf.
   The threshold is measured, not assumed — a card that already fits gets no
   button at all, and the 40px of slack keeps a card that only just runs over
   from sprouting a button that reveals almost nothing. */
export function CollapsedCard({ html, clamp = 420 }: { html: string; clamp?: number }) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > clamp + 40)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [html, clamp])

  const clamped = overflows && !open
  return (
    <>
      <div
        ref={ref}
        className={clamped ? 'card-clamp' : undefined}
        style={{ ['--clamp' as string]: `${clamp}px` }}
      >
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
