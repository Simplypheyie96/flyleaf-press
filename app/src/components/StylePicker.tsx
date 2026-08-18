/* Style chooser used in Write, Share, and Settings — every one of the styles
   is always on offer; the pastel dot is the ground color of each card. */
export function StylePicker<T extends string>({
  ids,
  names,
  grounds,
  value,
  onChange,
}: {
  ids: readonly T[]
  names: Record<T, string>
  grounds: Record<T, string>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="style-pick" role="group" aria-label="Style">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          <span className="style-dot" style={{ background: grounds[id] }} />
          {names[id]}
        </button>
      ))}
    </div>
  )
}
