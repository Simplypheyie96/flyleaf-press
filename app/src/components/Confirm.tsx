import { useEffect } from 'react'

/* An in-app confirm — window.confirm() is unreliable inside an installed PWA
   (some webviews swallow it silently), so destructive actions ask here
   instead: a small paper slip over a scrim, Escape backs out. */
export function Confirm({
  title,
  body,
  action,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  /** the destructive button's label, e.g. "Delete" */
  action: string
  onConfirm: () => void
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
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="confirm-sheet">
        <div className="ui-lbl">{title}</div>
        <p>{body}</p>
        <div className="confirm-actions">
          <button className="btn" onClick={onConfirm} autoFocus>{action}</button>
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
