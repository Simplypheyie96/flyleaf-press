import { useState } from 'react'
import { SYNC_AVAILABLE, optedIn, signIn } from '../sync/google'
import { syncNow } from '../sync/sync'

/* The one thing a brand-new device cannot work out for itself.

   An empty shelf has two completely different causes — a new reader, and a
   reader who has been writing on another device for months and has just
   installed this one — and the app has no way to tell them apart. It cannot
   look: finding out whether there is a backup in somebody's Drive means asking
   Google, which means asking THEM, which is the very thing this notice is for.
   Without it the second reader is shown "Nothing on the shelf yet. Finish a
   book and write the first review", which is not merely unhelpful — it reads
   as though their library is gone.

   It lives inside the empty state and nowhere else. On a shelf with books on
   it, this question has already been answered by the shelf itself, and the
   Settings row is where somebody who wants Drive goes looking. */
export function RestoreNotice() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!SYNC_AVAILABLE || optedIn()) return null

  const connect = async () => {
    setBusy(true)
    setErr('')
    try {
      await signIn()
      /* No merge question here — that one exists for a device carrying work
         Drive has never seen, and this shelf is empty. Everything in the
         backup simply comes down. */
      await syncNow()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong talking to Google.')
    } finally {
      setBusy(false)
    }
  }

  return (
    /* Inside the empty state's own box, under a hairline, as the quiet second
       option — not a notice card of its own. A bordered card nested inside the
       dashed one would be two boxes saying one thing, and it would compete
       with "Write the first review", which is the answer for most people who
       see this screen. */
    <div className="empty-alt">
      <p>Already writing on another device?</p>
      <button className="btn btn--ghost btn--sm" onClick={connect} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect Google Drive'}
      </button>
      {err && <p className="empty-alt-err" role="status">{err}</p>}
    </div>
  )
}
