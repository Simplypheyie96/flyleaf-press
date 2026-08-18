import { useEffect } from 'react'

/* An in-app confirm — window.confirm() is unreliable inside an installed PWA
   (some webviews swallow it silently), so destructive actions ask here
   instead: a small paper slip over a scrim, Escape backs out. */
export function Confirm({
  title,
  body,
  action,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  /** the confirming button's label, e.g. "Delete" */
  action: string
  /**
   * Whether the thing being confirmed actually destroys something. Nearly all
   * of them do, so that is the default — but not every sheet is a warning: the
   * Drive merge asks a real question and then keeps everything from both
   * sides, and painting THAT button crimson would be a lie about what it does,
   * as well as teaching people that the colour means nothing.
   */
  tone?: 'danger' | 'neutral'
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
          <button
            className={`btn${tone === 'danger' ? ' btn--danger-solid' : ''}`}
            onClick={onConfirm}
            autoFocus
          >
            {action}
          </button>
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
