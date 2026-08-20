import { useCallback, useEffect, useState } from 'react'
import { Confirm } from './Confirm'
import {
  SYNC_AVAILABLE,
  SYNC_EVENT,
  account,
  needsSignIn,
  optedIn,
  signIn,
  signOut,
  warmUp,
} from '../sync/google'
import {
  bringTogether,
  forgetDrive,
  hasUnsharedWork,
  lastSync,
  otherLibrary,
  pauseAutoSync,
  resumeAutoSync,
  syncNow,
} from '../sync/sync'

/* The Drive backup, as one settings panel.

   IT IS OFF UNTIL SOMEBODY TURNS IT ON, and the whole panel hides itself when
   the app was built without a Google client ID — a button that opens onto an
   error is worse than no button. Storage stays local either way; this only
   decides whether a copy also lives in the user's own Drive.

   ONE QUESTION, ONCE. Connecting a device that is already carrying reviews
   Drive has never seen is the one moment two libraries genuinely meet, and it
   asks before merging — a shelf that silently grows by nine books is a thing
   that happened TO somebody. Every sync after that is silent, because a merge
   is a union and cannot take anything away. */

/** What `silentToken` throws when Google will not renew access unasked. The
    panel shows that state as a row with a button in it, so the same words
    arriving as an error are a duplicate rather than news. */
const STALE = 'Sign in to Google again to keep backing up.'

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 90) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}

export function SyncPanel() {
  const [on, setOn] = useState(optedIn())
  const [who, setWho] = useState(account())
  const [at, setAt] = useState(lastSync())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  /* Held in state, not read at render. `refresh` is what the sync event
     calls, and setting three states to the values they already hold makes
     React bail out of the render entirely — so a background sync that shut
     the quiet path announced it to a panel that never redrew, and somebody
     sitting on this page watched a backup stop with the screen still saying
     it was running. */
  const [stale, setStale] = useState(needsSignIn())
  const [asking, setAsking] = useState<{ device: string; at: number } | null>(null)
  const [dropping, setDropping] = useState(false)

  const refresh = useCallback(() => {
    setOn(optedIn())
    setWho(account())
    setAt(lastSync())
    setStale(needsSignIn())
  }, [])

  useEffect(() => {
    if (!SYNC_AVAILABLE) return
    /* Google's script is fetched now rather than inside the press that needs
       it: Safari only lets a popup open from within the gesture that asked,
       and a network round trip mid-gesture spends that permission. */
    warmUp()
    window.addEventListener(SYNC_EVENT, refresh)
    return () => window.removeEventListener(SYNC_EVENT, refresh)
  }, [refresh])

  if (!SYNC_AVAILABLE) return null

  const say = (text: string) => {
    setMsg(text)
    setErr('')
  }
  const fail = (e: unknown) => {
    setErr(e instanceof Error ? e.message : 'Something went wrong talking to Google.')
    setMsg('')
  }

  const connect = async () => {
    setBusy('connect')
    setErr('')
    setMsg('')
    try {
      /* Held until the question below is answered, so nothing merges
         underneath it. */
      pauseAutoSync()
      await signIn()
      refresh()
      if (await hasUnsharedWork()) {
        const other = await otherLibrary()
        if (other) {
          setAsking(other)
          return
        }
      }
      resumeAutoSync()
      const r = await syncNow()
      refresh()
      say(r.unchanged ? 'Connected. Everything was already up to date.' : `Connected. ${r.gained} came down, and your shelf is now in your Drive.`)
    } catch (e) {
      resumeAutoSync()
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const merge = async () => {
    setAsking(null)
    setBusy('sync')
    try {
      const r = await bringTogether()
      refresh()
      say(`Brought together — ${r.gained} came down, ${r.updated} updated.`)
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const now = async () => {
    setBusy('sync')
    try {
      const r = await syncNow()
      refresh()
      say(r.unchanged ? 'Already up to date.' : `Synced — ${r.gained} came down, ${r.updated} updated.`)
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  /* THE WAY BACK. Without this the panel is a dead end: `silentToken` shuts
     the quiet path for six hours after Google refuses to renew access without
     being asked, and Sync now goes through that same path — so it throws
     before a window can open, and the only escape was to disconnect and
     connect again. This is the same press as Connect, minus the merge
     question, which was answered when this device first joined. */
  const resume = async () => {
    setBusy('signin')
    setErr('')
    setMsg('')
    try {
      await signIn()
      const r = await syncNow()
      refresh()
      say(r.unchanged ? 'Signed in. Everything was already up to date.' : `Signed in and synced — ${r.gained} came down, ${r.updated} updated.`)
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const disconnect = async () => {
    setBusy('off')
    try {
      await signOut()
      refresh()
      say('Disconnected. The copy in your Drive was left alone.')
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const drop = async () => {
    setDropping(false)
    setBusy('drop')
    try {
      /* Interactive, because this has to work for somebody who disconnected
         first and then thought better of leaving the copy behind. */
      const n = await forgetDrive(true)
      await signOut()
      refresh()
      say(n ? 'The backup was removed from your Drive. Your library here is untouched.' : 'There was nothing in your Drive to remove.')
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="panel">
      {/* THE STATUS ROW CARRIES NO BUTTON. It used to hold Disconnect, which
          put the way OUT beside the sentence saying how things stand — so the
          row that answers "am I backed up?" was also the row offering to stop,
          and it competed with Sync now for the same question. State first,
          then one action for the state you are in, then the ways out. Each
          state opens with a single word, so the answer is the first thing
          read: Off / On / Paused. */}
      <div className="set-row set-row--stack">
        <div className="set-row-txt">
          <div className="ui-lbl">Google Drive backup</div>
          <p>
            {!on ? (
              <>
                Off. Your library lives on this device only. Turn this on and a copy is kept in a
                hidden folder of your own Google Drive — one this app can see and no other app can,
                so the same shelf appears on your other devices. Nothing is ever sent to us.
              </>
            ) : stale ? (
              <>
                {/* "Backing up to…" stops being true the moment it is paused. */}
                Paused. Signed in as {who || 'your Google account'}
                {at ? `, last synced ${ago(at)}` : ', not synced yet'}. Google won’t renew this
                device’s access without being asked, so nothing has synced since. Nothing is lost —
                your library is here, and the copy in your Drive is where you left it.
              </>
            ) : (
              <>
                On, backing up to {who || 'your Google account'}
                {' · '}
                {at ? `last synced ${ago(at)}` : 'not synced yet'}.
              </>
            )}
          </p>
        </div>
        {!on && (
          <button className="btn btn--sm" onClick={connect} disabled={!!busy}>
            {busy === 'connect' ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>

      {on && (
        <>
          {/* ONE ACTION FOR THE STATE. Sync now is precisely the button that
              CANNOT work while the quiet path is shut — it takes the same
              silent route and throws before anything opens — so while that is
              the case this row is the press that does work, and it is primary
              rather than ghost, because it is the only thing standing between
              the reader and a backup that has quietly stopped. */}
          {/* BOTH STACKED, and it is the same row slot in either state — so an
              inline one here would move its button from the middle of the row
              to its left edge on a state change the reader did not ask for,
              and would be the only un-stacked row among the four. Beside is
              also wrong on its own terms at 360px: this column is 274px, a
              button takes 100–155 of it, and both sentences then wrap three or
              four times in what is left, level with none of it. */}
          {stale ? (
            <div className="set-row set-row--stack">
              <div className="set-row-txt">
                <div className="ui-lbl">Sign in again</div>
                <p>Starts backing up again. Nothing else changes.</p>
              </div>
              <button className="btn btn--sm" onClick={resume} disabled={!!busy}>
                {busy === 'signin' ? 'Signing in…' : 'Sign in to Google'}
              </button>
            </div>
          ) : (
            <div className="set-row set-row--stack">
              <div className="set-row-txt">
                <div className="ui-lbl">Sync now</div>
                <p>Syncing happens by itself. This is only for when you don't want to wait.</p>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={now} disabled={!!busy}>
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          )}
          {/* The two ways out, adjacent, because the only thing that
              distinguishes them is whether the copy in Drive survives. Apart,
              Disconnect sat up beside the status and read as the answer to it. */}
          <div className="set-row set-row--stack">
            <div className="set-row-txt">
              <div className="ui-lbl">Stop backing up</div>
              <p>Ends the backup on this device. The copy already in your Drive is left where it is, so connecting again picks it back up.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={disconnect} disabled={!!busy}>
              {busy === 'off' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
          <div className="set-row set-row--stack">
            <div className="set-row-txt">
              <div className="ui-lbl">Remove the backup</div>
              {/* worth saying where it can be done: the hidden folder has no row
                  in Drive's own screens, so this button is the only way out */}
              <p>Deletes the copy from your Drive — the only place this can be done — and disconnects. Your library here is untouched.</p>
            </div>
            <button className="btn btn--danger btn--sm" onClick={() => setDropping(true)} disabled={!!busy}>
              {busy === 'drop' ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </>
      )}

      {/* The paused sentence is the status row's whole subject, and a failed
          background sync hands back that same sentence — printed here as well
          it appeared twice in one card. */}
      {(msg || err) && !(stale && err === STALE) && (
        <p className="field-hint" role="status" style={{ marginTop: 14 }}>
          {err || msg}
        </p>
      )}

      {asking && (
        <Confirm
          title="Bring the two libraries together?"
          body={`There is already a library in this Google account, last changed on ${
            asking.device || 'another device'
          }${asking.at ? ` ${ago(asking.at)}` : ''}. Joining them keeps everything from both sides — nothing on this device is replaced or removed.`}
          action="Bring them together"
          tone="neutral"
          onConfirm={merge}
          onCancel={() => {
            setAsking(null)
            resumeAutoSync()
            say('Left as it was. Nothing has been merged — press Sync now when you want to join them.')
          }}
        />
      )}
      {dropping && (
        <Confirm
          title="Remove the backup from Drive?"
          body="The copy in your Google Drive is deleted and this device disconnects. Your library here is untouched — but any other device that was syncing will stop finding it."
          action="Remove the backup"
          onConfirm={drop}
          onCancel={() => setDropping(false)}
        />
      )}
    </div>
  )
}
