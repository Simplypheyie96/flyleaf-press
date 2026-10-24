/* Sync, in the only shape that keeps the promise this app has made.

   MERGE, NEVER PICK-ONE. The rule this file exists to hold: a sync must not be
   able to lose somebody a review. So it never asks "which side wins" — it
   pulls what is in the account, merges it into this device, and writes the
   merged whole back up. Both sides end up holding the union. A review written
   on a phone with no signal and one written on a laptop the same afternoon
   both survive, in either order, however long the gap. `backup.ts` supplies
   the identity and the fold; this file is only the transport.

   LOCAL STAYS LOCAL. Nothing here runs for somebody who has not signed in.
   There is no sign-in wall, no nag, and a reader who never signs in is not
   merely unsynced — they are unknown to us, with nothing of theirs anywhere
   but their own device. Signing in later changes where the library is COPIED
   to, and does not change that.

   The account is the Flyleaf one Journal uses (cloud.ts). Google Drive, which
   this file used to run on, is now only a place to bring an old copy in from,
   or remove it from: fromDrive and forgetDrive. */

import { db } from '../db'
import { SYNCED, exportForCloud, mergeLibrary } from './backup'
import { deleteAccount, drop, fetchMedia, optedIn, peek, pull, push, sendMedia, SYNC_EVENT } from './cloud'
import { deviceName } from './device'
import { dropLibraries, findLibrary, readLibrary } from './drive'
import { optedIn as usedDriveFlag, signIn as driveSignIn, signOut as driveSignOut, silentToken } from './google'

/** New keys rather than Drive's old ones, so every device's first sync to the
    account counts as a first meeting and sends its whole library up. */
const SYNCED_AT_KEY = 'flyleaf-press-cloud-synced-at'
/** `<rev>:<at> <signature>`: the account revision this device last finished on,
    and what the device looked like then, so an unchanged device on an
    unchanged account skips the whole round trip. The `at` is there because a
    revision number alone repeats: remove the account copy and the next one
    starts again at 1, which a device that last saw an older 1 would otherwise
    take for the copy it already holds. */
const MARK_KEY = 'flyleaf-press-cloud-mark'
/** Set the moment anything is written while this device is NOT signed in, and
    cleared by the first sync that succeeds after it. It is the single input to
    the one question this file ever asks: signing in on a device carrying work
    the account has never seen is the one case where two libraries genuinely
    diverged without anybody being able to watch it happen. */
const OFFLINE_KEY = 'flyleaf-press-wrote-offline'
/** Set once the old Google Drive copy has been brought in, so the offer to
    bring it in does not stay on screen after it has done its job. */
const DRIVE_IN_KEY = 'flyleaf-press-drive-in'

export interface SyncResult {
  /** Reviews and hopefuls that came down from another device. */
  gained: number
  /** Rows replaced here by a newer copy from the other device. */
  updated: number
  /** Rows removed here because the other device had deleted them. */
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
  const parts = await Promise.all(
    SYNCED.map(async (name) => {
      const table = db.table(name)
      const [count, edited, created] = await Promise.all([
        table.count(),
        table.orderBy('editedAt').last(),
        table.orderBy('createdAt').last(),
      ])
      return `${count}.${edited?.editedAt ?? 0}.${created?.createdAt ?? 0}`
    }),
  )
  return `${await db.graves.count()}.${parts.join('.')}`
}

async function rows(): Promise<number> {
  const counts = await Promise.all(SYNCED.map((name) => db.table(name).count()))
  return counts.reduce((a, b) => a + b, 0)
}

/** Is there anything here the account should hold? Headstones count: after
    "Delete everything" the library is empty and the headstones are the whole
    message, the only way the other devices hear that it went. */
async function hasAnythingToSend(): Promise<boolean> {
  return (await rows()) + (await db.graves.count()) > 0
}

/** Did anything get written on this device while it was not signed in? */
export function wroteWhileOffline(): boolean {
  return read(OFFLINE_KEY) !== ''
}

/** Is this device carrying work the account has never been shown? Two ways
    that happens: something was written while signed out, or this device has
    simply never completed a sync to the account — which covers every library
    that was already on a phone, or in Drive, before the account existed. */
export async function hasUnsharedWork(): Promise<boolean> {
  if ((await rows()) === 0) return false
  return wroteWhileOffline() || lastSync() === null
}

/** What is already in the account, and where it was last written. A question
    about "your account" is a question about a place nobody has ever been;
    "your iPhone, three hours ago" is one they can actually answer. */
export async function otherLibrary(): Promise<{ device: string; at: number } | null> {
  const doc = await peek()
  return doc && { device: doc.device, at: doc.at }
}

/** One full sync: pull, merge, push. Throws with a sentence fit to show, or
    with SIGNED_OUT when the account itself has gone. */
async function run(): Promise<SyncResult> {
  const [seen = '', seenSig = ''] = read(MARK_KEY).split(' ')
  const [seenRev, seenAt] = seen.split(':').map(Number)
  /* Has this device written anything since it last finished a sync? Measured
     BEFORE the pull, because what the pull brings in changes the signature
     too, and that is the other device's news, not this one's. */
  const mine = (await signature()) !== seenSig
  let remote = await pull(seenRev || 0)
  /* Same number, different moment: the copy was removed and started over, so
     the revision this device remembers is not the one the account holds. */
  if (remote && remote.text === undefined && seenAt && remote.at !== seenAt) remote = await pull(0)
  const result: SyncResult = { gained: 0, updated: 0, removed: 0, unchanged: false }

  for (let tries = 0; tries < 3; tries++) {
    if (remote?.text !== undefined) {
      /* Through the same door a hand-carried file uses, so a library that
         restores from a downloaded backup and one that arrives from another
         device cannot drift apart. Covers come by reference, and only for rows
         this device is about to write. */
      const folded = await mergeLibrary(remote.text, { media: fetchMedia })
      result.gained += folded.added
      result.updated += folded.updated
      result.removed += folded.removed
    }

    /* Nothing new here, so the account already holds everything this device
       has: every newer revision was written on top of the one it last saw, and
       a merge only adds. Writing back would only bounce the other device's
       work to it again, and the two would trade the same file forever. */
    if (remote && !mine) return settle(remote, { ...result, unchanged: remote.text === undefined })
    if (!remote && !(await hasAnythingToSend())) return settle(null, { ...result, unchanged: true })

    /* Exported AFTER the merge, so what goes up is the union rather than this
       device's side of it. This is the line that makes overwriting safe.
       Covers travel once each, by their hash, ahead of the library that
       points at them. */
    const { blob, media } = await exportForCloud()
    await sendMedia(media)
    const written = await push(blob, remote?.rev ?? 0, deviceName())
    if (written) return settle(written, result)

    /* Another device wrote in between. Take its whole revision, merge it, and
       try again on top of it: nothing is overwritten, ever. */
    remote = await pull(0)
  }
  throw new Error('Another device kept writing at the same moment. Flyleaf will try again by itself.')
}

async function settle(remote: { rev: number; at: number } | null, result: SyncResult): Promise<SyncResult> {
  write(MARK_KEY, `${remote?.rev ?? 0}:${remote?.at ?? 0} ${await signature()}`)
  write(SYNCED_AT_KEY, String(Date.now()))
  /* Whatever was written while signed out has now been up and merged, so it
     is no longer a reason to stop and ask anybody anything. */
  write(OFFLINE_KEY, '')
  window.dispatchEvent(new Event(SYNC_EVENT))
  return result
}

let running: Promise<SyncResult> | null = null

/** Sync now. Safe to call from anywhere — overlapping calls share one run,
    because two syncs at once would each merge the other's half-written state. */
export function syncNow(): Promise<SyncResult> {
  if (running) return running
  running = run().finally(() => {
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

/** Take the library and its covers out of the account, and stop this device
    putting them back. Syncing pauses first and the caller signs out, or the
    next write would recreate it within seconds.

    Nothing on the device is touched. Every review stays where it is — this
    removes the copy, not the writing. */
export function forgetCopy(): Promise<void> {
  return forget(drop)
}

/** The same for the whole account, which also signs this device out. */
export function forgetAccount(): Promise<void> {
  return forget(deleteAccount)
}

async function forget(remove: () => Promise<void>): Promise<void> {
  pauseAutoSync()
  try {
    await running?.catch(() => {})
    await remove()
    write(MARK_KEY, '')
    write(SYNCED_AT_KEY, '')
    /* Everything here is now unshared by definition, so signing in again is a
       first meeting and should ask like one. */
    write(OFFLINE_KEY, '1')
  } finally {
    resumeAutoSync()
  }
}

/** The account half of "Delete everything", run after the device has been
    emptied. The account copy and its covers go, and then the headstones go up
    on their own, so every other signed-in device deletes too instead of
    sending the library straight back. This device stays signed in. */
export async function clearAccount(): Promise<void> {
  if (!optedIn()) return
  pauseAutoSync()
  try {
    await running?.catch(() => {})
    await drop()
    write(MARK_KEY, '')
  } finally {
    resumeAutoSync()
  }
  await syncNow()
}

/* ── The copy an older Flyleaf Press kept in Google Drive ───────────────── */

/** Did this device ever sync through Google Drive, with the copy not yet
    removed? */
export function usedDrive(): boolean {
  return usedDriveFlag()
}

/** Has that copy already been brought in here? */
export function broughtInDrive(): boolean {
  return read(DRIVE_IN_KEY) !== ''
}

/** Bring in the library an older Flyleaf Press kept in Google Drive.

    Once, by hand, and read-only: Google's window asks for Drive, the file is
    merged in, and the merged whole goes up to the account on the sync that
    follows. The Drive copy itself is left alone; removing it is forgetDrive.
    Null when that Drive held no library. */
export async function fromDrive(): Promise<{ added: number; updated: number } | null> {
  await driveSignIn()
  const file = await findLibrary(await silentToken())
  if (!file) return null
  const folded = await mergeLibrary(await readLibrary(await silentToken(), file.id))
  write(DRIVE_IN_KEY, '1')
  window.dispatchEvent(new Event(SYNC_EVENT))
  if (optedIn()) void syncNow().catch(() => {})
  return folded
}

/** Delete the copy an older Flyleaf Press kept in Google Drive. Its hidden
    folder has no row in Drive's own list, so this is the only way to remove
    it. Returns how many files went. */
export async function forgetDrive(): Promise<number> {
  await driveSignIn()
  try {
    return await dropLibraries(await silentToken())
  } finally {
    await driveSignOut()
    window.dispatchEvent(new Event(SYNC_EVENT))
  }
}

/* ── Keeping up, without being asked ────────────────────────────────────────

   NOBODY SHOULD EVER HAVE TO PRESS "SYNC NOW". Signing in once is the only
   thing anybody should have to do. Three triggers, because two devices staying
   level needs both halves:

   PUSH, after a write — a Dexie hook on each synced table schedules a sync,
   debounced by SETTLE so writing a long review uploads once when the hand
   stops rather than once per keystroke.

   PULL, on a timer, while the app is in front. The other device writing
   something is not an event this device can hear, so it has to go and look.
   Only while visible: a backgrounded tab costs battery and finds nothing.

   AND ON ARRIVAL — at launch, on focus, on coming back online, and whenever
   the app comes back to the front, which is the moment the other device is
   most likely to have moved.

   Each is cheap when nothing has changed: `run` sends the revision it last
   finished on, the server answers 204 with no body when that is still the
   newest, and a poll on an idle pair moves a few hundred bytes. */

/** How long a writing hand must be still before its work is sent up. */
const SETTLE = 4_000
/** How often an app in the foreground goes to look for the other device. */
const BEAT = 30_000
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
   a review added just after a sync waits for the beat, if the app is even
   still in front when it comes round. One timer, not one per caller: three
   triggers inside the same window still produce one sync, which is what the
   floor was for. */
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
       with no signal must not be handed an error about it. */
  })
}

/* A write happened. Wait for the hand to stop, then send. `running` is checked
   at the far end rather than here because the writes a sync makes are
   themselves merges arriving from the account — they would otherwise schedule
   a sync of the thing just synced, forever. */
function touched() {
  if (!optedIn()) {
    /* Nowhere to send this — but it is exactly the work that will need
       reconciling if this device signs in later, and remembering it now is the
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

/* A phone puts the app away without warning. Work still settling goes up now,
   while the page is alive to send it, not four seconds after it isn't. */
function flush() {
  if (!settling) return
  clearTimeout(settling)
  settling = null
  if (optedIn() && !paused) void syncNow().catch(() => {})
}

export function startAutoSync() {
  if (started) return
  started = true
  /* The listeners go on unconditionally and `attempt` is the thing that
     checks — somebody who signs in halfway through a session would otherwise
     get no automatic sync until they next reloaded the app. */
  for (const name of SYNCED) {
    const table = db.table(name)
    table.hook('creating', touched)
    table.hook('updating', touched)
    table.hook('deleting', touched)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt()
    else flush()
  })
  window.addEventListener('pagehide', flush)
  window.addEventListener('focus', attempt)
  window.addEventListener('online', attempt)
  setInterval(() => {
    if (document.visibilityState === 'visible') attempt()
  }, BEAT)

  attempt()
}
