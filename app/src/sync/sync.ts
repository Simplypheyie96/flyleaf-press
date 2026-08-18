/* Sync, in the only shape that keeps the promise this app has made.

   MERGE, NEVER PICK-ONE. The rule this file exists to hold: a sync must not be
   able to lose somebody a review. So it never asks "which side wins" — it
   pulls what is in Drive, merges it into this device, and writes the merged
   whole back up. Both sides end up holding the union. A review written on a
   phone with no signal and one written on a laptop the same afternoon both
   survive, in either order, however long the gap. `backup.ts` supplies the
   identity and the fold; this file is only the transport.

   LOCAL STAYS LOCAL. Nothing here runs for somebody who has not asked for it.
   There is no sign-in wall, no nag, and a user who never connects Drive is not
   merely unsynced — they are unknown to us, with nothing of theirs anywhere
   but their own device. Connecting later changes where the library is COPIED
   to, and does not change that. */

import { db } from '../db'
import { exportBlob, mergeLibrary } from './backup'
import { deviceName } from './device'
import { dropLibraries, findLibrary, readLibrary, writeLibrary } from './drive'
import { SYNC_EVENT, optedIn, signIn, silentToken, tokenHeld } from './google'

const SYNCED_AT_KEY = 'flyleaf-press-synced-at'
/** What this device looked like the last time a sync finished, so an unchanged
    device on an unchanged Drive can skip the whole round trip. */
const MARK_KEY = 'flyleaf-press-sync-mark'
/** Set the moment anything is written while this device is NOT connected, and
    cleared by the first sync that succeeds after it. It is the single input to
    the one question this file ever asks: connecting a device that is carrying
    work Drive has never seen is the one case where two libraries genuinely
    diverged without anybody being able to watch it happen. */
const OFFLINE_KEY = 'flyleaf-press-wrote-offline'

export interface SyncResult {
  /** Reviews that came down from another device. */
  gained: number
  /** Reviews replaced here by a newer copy from the other device. */
  updated: number
  /** Reviews removed here because the other device had deleted them. */
  removed: number
  /** True when nothing had changed on either side and no bytes moved. */
  unchanged: boolean
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Private mode. The sync still ran; it just cannot remember that it did,
       so the next one does the full round trip instead of skipping it. */
  }
}

export function lastSync(): number | null {
  const at = Number(read(SYNCED_AT_KEY))
  return at > 0 ? at : null
}

/** A cheap stand-in for "has anything changed here", and it has to notice an
    EDIT as well as an addition — a rating nudged from 4 to 4.25 moves no count
    at all, and without the stamp below this device would look identical to the
    one that last synced and skip the round trip, so the other device would
    never hear about it. Both reads come off an index rather than a scan: a
    shelf of uploaded covers is megabytes, and computing a string must not pull
    them all out of the database. */
async function signature(): Promise<string> {
  const [reviews, graves, newest] = await Promise.all([
    db.reviews.count(),
    db.graves.count(),
    db.reviews.orderBy('editedAt').last(),
  ])
  const created = await db.reviews.orderBy('createdAt').last()
  return `${reviews}.${graves}.${newest?.editedAt ?? 0}.${created?.createdAt ?? 0}`
}

/** Did anything get written on this device while it was not connected? */
export function wroteWhileOffline(): boolean {
  return read(OFFLINE_KEY) !== ''
}

/** Is this device carrying work Drive has never been shown? Two ways that
    happens: something was written while disconnected, or this device has
    simply never completed a sync — which is the same situation seen from a
    device that predates the flag, and the honest fallback for every library
    already on a phone when this shipped. */
export async function hasUnsharedWork(): Promise<boolean> {
  if ((await db.reviews.count()) === 0) return false
  return wroteWhileOffline() || lastSync() === null
}

/** What is already in this account's Drive, and where it was last written.
    A question about "your Drive" is a question about a place nobody has ever
    been; "your iPhone, three hours ago" is one they can actually answer. */
export async function otherLibrary(): Promise<{ device: string; at: number } | null> {
  const file = await findLibrary(await silentToken())
  if (!file) return null
  return { device: file.device ?? '', at: Date.parse(file.modifiedTime) || 0 }
}

/** One full sync: pull, merge, push. Throws with a sentence fit to show. The
    caller supplies the token so an expired one can be renewed and the whole
    thing retried without this function knowing anything about auth. */
async function run(token: string): Promise<SyncResult> {
  const remote = await findLibrary(token)

  const here = await signature()
  const mark = `${remote?.modifiedTime ?? ''} ${here}`
  if (remote && read(MARK_KEY) === mark) {
    write(SYNCED_AT_KEY, String(Date.now()))
    return { gained: 0, updated: 0, removed: 0, unchanged: true }
  }

  let gained = 0
  let updated = 0
  let removed = 0
  if (remote) {
    /* Through the same door a hand-carried file uses, so a library that
       restores from a downloaded backup and one that arrives from Drive
       cannot drift apart. */
    const folded = await mergeLibrary(await readLibrary(token, remote.id))
    gained = folded.added
    updated = folded.updated
    removed = folded.removed
  }

  /* Exported AFTER the merge, so what goes up is the union rather than this
     device's side of it. This is the line that makes overwriting safe. */
  const saved = await writeLibrary(token, await exportBlob(), deviceName(), remote?.id)

  write(SYNCED_AT_KEY, String(Date.now()))
  write(MARK_KEY, `${saved.modifiedTime} ${await signature()}`)
  /* Whatever was written while disconnected has now been up and merged, so it
     is no longer a reason to stop and ask anybody anything. */
  write(OFFLINE_KEY, '')
  window.dispatchEvent(new Event(SYNC_EVENT))
  return { gained, updated, removed, unchanged: false }
}

let running: Promise<SyncResult> | null = null

/** Sync now. Safe to call from anywhere — overlapping calls share one run,
    because two syncs at once would each merge the other's half-written state. */
export function syncNow(): Promise<SyncResult> {
  if (running) return running

  running = (async () => {
    try {
      return await run(await silentToken())
    } catch (error) {
      /* One retry, and only for the hour being up. Everything else is a real
         failure and says so. */
      if (!(error instanceof Error) || error.message !== 'expired') throw error
      return run(await silentToken())
    }
  })().finally(() => {
    running = null
  })

  return running
}

/** "Bring them together" — the answer to the one question. It is simply what
    every sync does, so saying yes is saying carry on. */
export async function bringTogether(): Promise<SyncResult> {
  write(OFFLINE_KEY, '')
  resumeAutoSync()
  return syncNow()
}

/** Take the library out of Drive, and stop this device putting it back.

    Both halves, or it is theatre: deleting the file while this device is still
    connected means the next write recreates it within seconds, and somebody
    would have pressed a button that did nothing they could see. So syncing
    pauses first, the copy goes, and the caller signs out.

    Nothing on the device is touched. Every review stays where it is — this
    removes the copy, not the writing. */
export async function forgetDrive(interactive = false): Promise<number> {
  pauseAutoSync()
  try {
    if (!tokenHeld() && interactive) await signIn()
    const count = await dropLibraries(await silentToken())
    /* The mark described a file that no longer exists. Left behind, a later
       reconnection could match it and skip the round trip that would have put
       the library back up. */
    write(MARK_KEY, '')
    write(SYNCED_AT_KEY, '')
    /* Everything here is now unshared by definition, so connecting again is a
       first meeting and should ask like one. */
    write(OFFLINE_KEY, '1')
    return count
  } finally {
    resumeAutoSync()
  }
}

/* ── Keeping up, without being asked ────────────────────────────────────────

   NOBODY SHOULD EVER HAVE TO PRESS "SYNC NOW". Connecting once is the only
   thing anybody should have to do. Three triggers, because two devices staying
   level needs both halves:

   PUSH, after a write — a Dexie hook on the reviews table schedules a sync,
   debounced by SETTLE so writing a long review uploads once when the hand
   stops rather than once per keystroke.

   PULL, on a timer, while the app is in front. The other device writing
   something is not an event this device can hear, so it has to go and look.
   Only while visible: a backgrounded tab costs battery and finds nothing.

   AND ON ARRIVAL — at launch and whenever the app comes back to the front,
   which is the moment the other device is most likely to have moved.

   Each is cheap when nothing has changed: `run` compares the Drive copy's
   modifiedTime against a stored mark and returns without moving bytes, so a
   poll on an idle pair is one metadata call. */

/** How long a writing hand must be still before its work is sent up. */
const SETTLE = 4_000
/** How often an app in the foreground goes to look for the other device. */
const BEAT = 90_000
/** A floor under everything, so no combination of triggers can loop. */
const QUIET = 10_000

let paused = false
let lastRun = 0
let settling: ReturnType<typeof setTimeout> | null = null
let held: ReturnType<typeof setTimeout> | null = null
let started = false

/** Hold every automatic sync while a question is on screen. Explicit syncs
    still run — `syncNow` is only ever called by something somebody pressed. */
export function pauseAutoSync() {
  paused = true
}

export function resumeAutoSync() {
  paused = false
}

export function autoSyncPaused(): boolean {
  return paused
}

/* THE FLOOR DELAYS A SYNC; IT MUST NEVER CANCEL ONE. A blocked attempt books
   itself for the moment the floor lifts, rather than being dropped — otherwise
   a review added just after a sync waits for the ninety-second beat, if the
   app is even still in front when it comes round. One timer, not one per
   caller: three triggers inside the same window still produce one sync, which
   is what the floor was for. */
function attempt() {
  if (!optedIn() || paused) return

  const waited = Date.now() - lastRun
  if (waited < QUIET) {
    if (!held) {
      held = setTimeout(() => {
        held = null
        attempt()
      }, QUIET - waited)
    }
    return
  }

  if (held) {
    clearTimeout(held)
    held = null
  }
  lastRun = Date.now()
  void syncNow().catch(() => {
    /* Silence is right here. This one was not asked for: somebody on a train
       with no signal must not be handed an error about it. The Settings row
       still shows how old the last real sync is, which is the honest version
       of the same fact. */
  })
}

/* A write happened. Wait for the hand to stop, then send. `running` is checked
   at the far end rather than here because the writes a sync makes are
   themselves merges arriving from Drive — they would otherwise schedule a sync
   of the thing just synced, forever. */
function touched() {
  if (!optedIn()) {
    /* Nowhere to send this — but it is exactly the work that will need
       reconciling if Drive is connected later, and remembering it now is the
       only way to know it happened. */
    write(OFFLINE_KEY, '1')
    return
  }
  if (settling) clearTimeout(settling)
  settling = setTimeout(() => {
    settling = null
    if (!running) attempt()
  }, SETTLE)
}

export function startAutoSync() {
  if (started) return
  started = true
  /* The listeners go on unconditionally and `attempt` is the thing that
     checks — somebody who connects Drive halfway through a session would
     otherwise get no automatic sync until they next reloaded the app. */
  db.reviews.hook('creating', touched)
  db.reviews.hook('updating', touched)
  db.reviews.hook('deleting', touched)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') attempt()
  }, BEAT)

  attempt()
}
