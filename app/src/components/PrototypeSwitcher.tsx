import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/* PROTOTYPE — flips ?variant= on the current route. Dev builds only. */
export function PrototypeSwitcher({ variants }: { variants: { key: string; name: string }[] }) {
  const [params, setParams] = useSearchParams()
  const i = Math.max(0, variants.findIndex((v) => v.key === params.get('variant')))
  const go = (d: number) => {
    const next = new URLSearchParams(params)
    next.set('variant', variants[(i + d + variants.length) % variants.length].key)
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!import.meta.env.DEV) return null
  const v = variants[i]
  return (
    <div className="proto-switch" role="group" aria-label="Prototype variant">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">‹</button>
      <span>{v.key} · {v.name}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">›</button>
    </div>
  )
}
