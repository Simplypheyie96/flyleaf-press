import { useState } from 'react'

/* Twelve styles per picker. As a flat row of pills it was the tallest thing on
   the review page and on the share sheet, where vertical space is scarcest, so
   it folds, exactly as the face picker in Settings does: closed it is one row
   carrying the current swatch and name, open it is a two-to-four column grid.

   Picking does NOT close it. It used to, on the theory that choosing a style is
   a one-shot act and the point is to look at the card underneath. That was the
   wrong model of how the control is actually used: with seven or twelve styles
   nobody picks blind, they flip — and closing on every pick meant reopening the
   fold between each one, so comparing two styles cost four presses instead of
   two. The fold is a disclosure, so it closes the way it opened, from its own
   toggle. The card under it stays live either way, which is what made flipping
   worth doing in the first place. */
export function StylePicker<T extends string>({
  ids,
  names,
  grounds,
  value,
  onChange,
  label = 'Style',
}: {
  ids: readonly T[]
  names: Record<T, string>
  grounds: Record<T, string>
  value: T
  onChange: (id: T) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="style-fold">
      <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ui-lbl">{label}</span>
        <span className="disclose-right">
          {!open && (
            <>
              <span className="style-dot" style={{ background: grounds[value] }} />
              <span className="disclose-val">{names[value]}</span>
            </>
          )}
          <span className="disclose-chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="style-pick" role="group" aria-label={label}>
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === value}
              onClick={() => onChange(id)}
            >
              <span className="style-dot" style={{ background: grounds[id] }} />
              <span className="style-pick-name">{names[id]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
