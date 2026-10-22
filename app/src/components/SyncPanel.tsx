import { useCallback, useEffect, useState } from 'react'
import { Confirm } from './Confirm'
import { GoogleButton } from './GoogleButton'
import { SYNC_AVAILABLE, SYNC_EVENT, account, optedIn, signOut } from '../sync/cloud'
import {
  bringTogether,
  broughtInDrive,
  forgetCopy,
  forgetDrive,
  fromDrive,
  hasUnsharedWork,
  otherLibrary,
  pauseAutoSync,
  resumeAutoSync,
  syncNow,
  usedDrive,
} from '../sync/sync'

/* Sync across devices, as one settings panel.

   SIGNED IN ONCE, AND THEN LEFT ALONE. There is no Sync now and no Paused:
   the Flyleaf account keeps a device signed in for as long as it is used, and
   syncing happens by itself (sync.ts). The whole panel hides itself when the
   app was built without a Google client ID — a button that opens onto an
   error is worse than no button.

   ONE QUESTION, ONCE. Signing in on a device that is already carrying reviews
   the account has never seen is the one moment two libraries genuinely meet,
   and it asks before merging — a shelf that silently grows by nine books is a
   thing that happened TO somebody. Every sync after that is silent, because a
   merge is a union and cannot take anything away. */

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 90) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}

function came(n: number): string {
  return n === 1 ? 'One book' : `${n} books`
}

export function SyncPanel() {
  const [on, setOn] = useState(optedIn())
  const [who, setWho] = useState(account())
  const [drive, setDrive] = useState(usedDrive())
  const [driveIn, setDriveIn] = useState(broughtInDrive())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [asking, setAsking] = useState<{ device: string; at: number } | null>(null)
  const [sure, setSure] = useState<'copy' | 'drive' | null>(null)

  const refresh = useCallback(() => {
    setOn(optedIn())
    setWho(account())
    setDrive(usedDrive())
    setDriveIn(broughtInDrive())
  }, [])

  useEffect(() => {
    window.addEventListener(SYNC_EVENT, refresh)
    return () => window.removeEventListener(SYNC_EVENT, refresh)
  }, [refresh])

  if (!SYNC_AVAILABLE) return null

  const say = (text: string) => {
    setMsg(text)
    setErr('')
  }
  const fail = (e: unknown, fallback: string) => {
    setErr(e instanceof Error ? e.message : fallback)
    setMsg('')
  }

  /* Google's button has signed this device in by the time this runs. The
     pause is held until the question is answered, or the write hooks would
     merge underneath it. */
  const connected = async () => {
    refresh()
    setBusy('in')
    setErr('')
    setMsg('')
    try {
      pauseAutoSync()
      const other = await otherLibrary()
      if (other && (await hasUnsharedWork())) {
        setAsking(other)
        return
      }
      resumeAutoSync()
      const { gained } = await syncNow()
      say(gained ? `Signed in. ${came(gained)} came back from your other device.` : 'Signed in. Your library now syncs by itself.')
    } catch (e) {
      resumeAutoSync()
      refresh()
      fail(e, 'That did not connect.')
    } finally {
      setBusy('')
    }
  }

  /* Yes. There is no version of this that loses anything: what goes up is the
     union of both sides, and both devices end up holding it. */
  const merge = async () => {
    setAsking(null)
    setBusy('in')
    try {
      const { gained } = await bringTogether()
      say(gained ? `Brought together. ${came(gained)} came over from your other device.` : 'Brought together.')
    } catch (e) {
      fail(e, 'That did not sync.')
    } finally {
      setBusy('')
    }
  }

  /* No. Signing back out is the honest undo: signed in but never syncing would
     be a switch that says On and does nothing. */
  const apart = async () => {
    setAsking(null)
    setBusy('out')
    await signOut()
    resumeAutoSync()
    say('Left as they are. This device is not syncing, and the library in your account is untouched.')
    setBusy('')
  }

  const leave = async () => {
    setBusy('out')
    await signOut()
    say('Signed out of this device. Your library stays here and in your account.')
    setBusy('')
  }

  /* Signed out as part of the same press: still signed in, this device would
     write the library straight back up within seconds. */
  const dropCopy = async () => {
    setSure(null)
    setBusy('drop')
    try {
      await forgetCopy()
      await signOut()
      say('Removed from Flyleaf. This device is signed out, and everything written on it remains here.')
    } catch (e) {
      fail(e, 'That could not be removed.')
    } finally {
      setBusy('')
    }
  }

  const bringDrive = async () => {
    setBusy('drive-in')
    try {
      const back = await fromDrive()
      say(
        back === null
          ? 'That Google Drive holds no Flyleaf Press library.'
          : back.added
            ? `${came(back.added)} came in from Google Drive.`
            : 'Brought in. Nothing there was new to this device.',
      )
    } catch (e) {
      fail(e, 'That did not connect.')
    } finally {
      setBusy('')
    }
  }

  const dropDrive = async () => {
    setSure(null)
    setBusy('drive-out')
    try {
      const n = await forgetDrive()
      say(n > 0 ? 'Removed the old copy from Google Drive.' : 'Google Drive held no Flyleaf Press library.')
    } catch (e) {
      fail(e, 'That could not be removed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="panel">
      <div className="set-row set-row--stack">
        <div className="set-row-txt">
          <div className="ui-lbl">Sync across devices</div>
          <p>
            {on ? (
              <>
                Signed in as {who || 'your Google account'}. This device syncs on its own and stays
                signed in. There is nothing to press.
              </>
            ) : (
              <>
                Sign in once and this library appears on your other devices and keeps up with them by
                itself. It is kept on Flyleaf’s servers, private to your account, and you can remove
                it from here at any time.
              </>
            )}
          </p>
        </div>
        {!on &&
          (busy === 'in' ? (
            <p className="field-hint" role="status" style={{ marginTop: 12 }}>Signing in…</p>
          ) : (
            <GoogleButton onDone={() => void connected()} onError={(text) => fail(new Error(text), text)} />
          ))}
      </div>

      {on && (
        <>
          <div className="set-row set-row--stack">
            <div className="set-row-txt">
              <div className="ui-lbl">Sign out</div>
              <p>Stops syncing on this device. Your library stays here and in your account.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={leave} disabled={!!busy}>
              {busy === 'out' ? 'Signing out…' : 'Sign out of this device'}
            </button>
          </div>
          <div className="set-row set-row--stack">
            <div className="set-row-txt">
              <div className="ui-lbl">Remove from Flyleaf</div>
              <p>Deletes the copy in your account, covers included, and signs this device out. Your library here is untouched.</p>
            </div>
            <button className="btn btn--danger btn--sm" onClick={() => setSure('copy')} disabled={!!busy}>
              {busy === 'drop' ? 'Removing…' : 'Remove my library from Flyleaf'}
            </button>
          </div>
        </>
      )}

      {/* Only on a device that synced through Google Drive before the account
          existed, and only until that copy is removed. */}
      {drive && (
        <div className="set-row set-row--stack">
          <div className="set-row-txt">
            <div className="ui-lbl">The old Google Drive copy</div>
            <p>
              An older Flyleaf Press kept a copy of this library in your Google Drive.
              {driveIn ? ' It has been brought in here.' : ' Nothing moves until you bring it in.'}
            </p>
          </div>
          <div className="set-row-acts">
            {!driveIn && (
              <button className="btn btn--sm" onClick={bringDrive} disabled={!!busy}>
                {busy === 'drive-in' ? 'Bringing it in…' : 'Bring in my Google Drive copy'}
              </button>
            )}
            <button className="btn btn--danger btn--sm" onClick={() => setSure('drive')} disabled={!!busy}>
              {busy === 'drive-out' ? 'Removing…' : 'Remove the Google Drive copy'}
            </button>
          </div>
        </div>
      )}

      {(msg || err) && (
        <p className="field-hint" role="status" style={{ marginTop: 14 }}>
          {err || msg}
        </p>
      )}

      {asking && (
        <Confirm
          title="Bring the two libraries together?"
          body={`This account already holds a library, last changed on ${
            asking.device ? `your ${asking.device}` : 'another device'
          }${asking.at ? `, ${ago(asking.at)}` : ''}. Bringing them together adds anything only there to this device, and anything only here to that one. Nothing is replaced and nothing is removed.`}
          action="Bring them together"
          cancel="Leave them as they are"
          tone="neutral"
          onConfirm={merge}
          onCancel={apart}
        />
      )}
      {sure === 'copy' && (
        <Confirm
          title="Remove your library from Flyleaf?"
          body="This deletes your library and covers from Flyleaf and signs this device out. Everything stays on this device, but your other devices will have nothing to sync with."
          action="Yes, remove it"
          onConfirm={dropCopy}
          onCancel={() => setSure(null)}
        />
      )}
      {sure === 'drive' && (
        <Confirm
          title="Remove the Google Drive copy?"
          body="This opens Google to confirm the account, then deletes the old copy in your Google Drive. Nothing here or in your Flyleaf account is touched."
          action="Yes, remove it from Drive"
          onConfirm={dropDrive}
          onCancel={() => setSure(null)}
        />
      )}
    </div>
  )
}
