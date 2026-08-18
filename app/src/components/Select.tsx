import { useEffect, useRef, useState } from 'react'

/* An app-drawn select — the native control's chevron crowds the box edge and
   its menu ignores the paper chrome entirely. This one opens the same slip
   the shelf search suggestions use. Arrow keys walk it, Enter picks,
   Escape and outside-clicks close. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const current = options.find((o) => o.id === value)
  const openAt = () => {
    setActive(options.findIndex((o) => o.id === value))
    setOpen(true)
  }
  const pick = (o: { id: T }) => {
    onChange(o.id)
    setOpen(false)
  }

  return (
    <div className="dd" ref={rootRef}>
      <button
        type="button"
        className="dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openAt()
          } else if (open && e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % options.length)
          } else if (open && e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
          } else if (open && e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(options[active])
          } else if (open && e.key === 'Escape') {
            setOpen(false)
          }
        }}
      >
        <span>{current?.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="dd-list" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              className={i === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span>{o.label}</span>
              {o.id === value && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
                  <path d="M1 4.5l3 3L10 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
