import { useState, type CSSProperties } from 'react'
import { LockIcon } from './UnlockSheet'

/* Twenty styles per picker. Folded inline it opened ten rows deep and pushed
   the card it was choosing for off the screen, so the closed row stays where
   it was and the grid opens in a panel docked to the bottom, three to a row.
   There is no scrim: the card above stays in view and live while you flip.

   Picking does NOT close it. With twenty styles nobody picks blind, they
   flip, and closing on every pick meant reopening between each one. It closes
   from Done or from the row that opened it.

   The review's hand uses the same sheet: no ground dots, and each name is
   drawn in the face it names (`nameStyle`), so the choice can be seen.

   In the store apps before the unlock, `free` marks the styles that cost
   nothing; the rest carry a lock but stay pickable, so the card can be seen
   in them before anyone pays. The export is what waits. */
export function StylePicker<T extends string>({
  ids,
  names,
  grounds,
  value,
  onChange,
  label = 'Style',
  nameStyle,
  free,
}: {
  ids: readonly T[]
  names: Record<T, string>
  grounds?: Record<T, string>
  value: T
  onChange: (id: T) => void
  label?: string
  nameStyle?: (id: T) => CSSProperties
  free?: (id: T) => boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="style-fold">
      <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ui-lbl">{label}</span>
        <span className="disclose-right">
          {grounds && <span className="style-dot" style={{ background: grounds[value] }} />}
          <span className={nameStyle ? 'disclose-val disclose-val--face' : 'disclose-val'} style={nameStyle?.(value)}>{names[value]}</span>
          <span className="disclose-chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="style-sheet" role="dialog" aria-label={label}>
          <div className="style-sheet-top">
            <span className="ui-lbl">{label}</span>
            <button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>Done</button>
          </div>
          <div className={nameStyle ? 'style-pick style-pick--faces' : 'style-pick'} role="group" aria-label={label}>
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === value}
              onClick={() => onChange(id)}
            >
              {grounds && <span className="style-dot" style={{ background: grounds[id] }} />}
              <span className="style-pick-name" style={nameStyle?.(id)}>{names[id]}</span>
              {free && !free(id) && <LockIcon />}
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
