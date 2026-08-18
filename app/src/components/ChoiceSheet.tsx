import { useEffect } from 'react'

export interface Choice {
  id: string
  label: string
  /** what this format is for, in one line */
  detail: string
  /** present when the option can't be taken — shown in place of the detail */
  unavailable?: string
}

/* A small format chooser — the same paper slip as Confirm, but a list of
   labelled options rather than a yes/no. An option that isn't possible stays
   on the list and says why: silently omitting PDF from Import would look like
   the app had forgotten it. */
export function ChoiceSheet({
  title,
  body,
  choices,
  onPick,
  onCancel,
}: {
  title: string
  body?: string
  choices: Choice[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="share-scrim"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="confirm-sheet">
        <div className="ui-lbl">{title}</div>
        {body && <p>{body}</p>}
        <div className="choice-list">
          {choices.map((c) => (
            <button
              key={c.id}
              className="choice"
              disabled={!!c.unavailable}
              onClick={() => onPick(c.id)}
            >
              <span className="choice-l">{c.label}</span>
              <span className="choice-d">{c.unavailable || c.detail}</span>
            </button>
          ))}
        </div>
        <div className="confirm-actions">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
