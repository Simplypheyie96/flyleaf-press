import { useLayoutEffect, useRef, useState } from 'react'

/* Renders a card's HTML string, adding .card-compact when the container is
   narrow — the card CSS carries no viewport media queries, so mobile sizing
   is decided here by the box the card actually sits in. */
export function CardHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCompact(el.clientWidth < 560)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={'card-wrap' + (compact ? ' card-compact' : '')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
