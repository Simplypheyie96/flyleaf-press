import { useState } from 'react'
import { SYNC_AVAILABLE, optedIn, signIn } from '../sync/google'
import { syncNow } from '../sync/sync'

/* The one thing a brand-new device cannot work out for itself.

   A device with nothing on it has two completely different causes — a new
   reader, and a reader who has been writing on another device for months and
   has just installed this one — and the app has no way to tell them apart. It
   cannot look, either: finding out whether there is a backup in somebody's
   Drive means asking Google, which means asking THEM, which is the very thing
   this offer is for. Without it the second reader is told "Nothing on the
   shelf yet, write the first review", which is not merely unhelpful — it reads
   as though their library is gone.

   It appears in the two places a device can be empty: the first-run screen,
   which is the FIRST thing that reader sees and so the first place the
   question can honestly be asked, and the empty shelf underneath it. Anywhere
   else the shelf has already answered it, and Settings is where somebody who
   wants Drive later goes looking. */
export function RestoreNotice({
  prompt = 'Already writing on another device?',
  onRestored,
}: {
  prompt?: string
  /** Called once a restore has actually brought reviews down, so the first-run
      screen can step out of the way rather than asking for a name and a face
      that arrived in the backup a moment ago. Not called for an empty Drive:
      nothing came down, so there is nothing to have taken them from. */
  onRestored?: (gained: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  /* `optedIn()` flips true INSIDE connect(), so the bare early-return used to
     unmount this component on the very rerender that would have shown the
     "connected, nothing found" note — the outcome this notice exists to speak
     was structurally unspeakable. Once there is something to say, stay up and
     say it; the ask itself (prompt and button) still hides once connected,
     except beside an error, where the button is the retry. */
  const connected = optedIn()
  if (!SYNC_AVAILABLE || (connected && !note && !err)) return null

  const connect = async () => {
    setBusy(true)
    setErr('')
    setNote('')
    try {
      await signIn()
      /* No merge question here — that one exists for a device carrying work
         Drive has never seen, and this device is empty. Everything in the
         backup simply comes down. */
      const { gained } = await syncNow()
      if (gained > 0) onRestored?.(gained)
      /* Connecting and finding nothing is a real outcome, not a failure, and
         silence would read as one. It also has a genuine next step: the backup
         now exists, and starts with whatever gets written here. */
      else setNote('Connected. There’s no library in this Drive account yet — what you write here will be backed up to it.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong talking to Google.')
    } finally {
      setBusy(false)
    }
  }

  return (
    /* Under a hairline, in the ghost button, as the quiet second option — not
       a notice card of its own. A bordered card nested inside the dashed
       empty state would be two boxes saying one thing, and on either screen
       this must not compete with the primary answer, which is right for most
       people who see it. */
    <div className="empty-alt">
      {(!connected || err) && (
        <>
          <p>{prompt}</p>
          <button className="btn btn--ghost btn--sm" onClick={connect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </>
      )}
      {note && <p className="empty-alt-note" role="status">{note}</p>}
      {err && <p className="empty-alt-err" role="status">{err}</p>}
    </div>
  )
}
