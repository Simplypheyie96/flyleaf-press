/* Finding the subject tags for books that were written up before tags existed.

   Tags are filled from the catalogues at Add time and cost nothing there — the
   search has already happened, and the words come back in the same payload as
   the cover and the page count. A shelf written before that existed has no such
   free ride: every book is a fresh search, which is the metered path, and the
   catalogues rate-limit anonymous callers by IP.

   So this is the cover sweep's shape exactly, minus the cheap half. There is no
   static host for a subject list the way `covers.openlibrary.org` is one for
   artwork, so every book goes down the SEARCH_GAP_MS path and a rate limit is
   handled the same way the cover sweep handles it: the book is deferred to the
   end of the queue and the sweep moves on, waiting once at the end for whatever
   cooldown is actually left rather than a flat minute in front of a bar that
   looks stalled.

   Resumable for the same reason: the query is "rows with no tags", so stopping
   and starting again picks up exactly where it stopped, with nothing written
   down and no half-finished state to go stale.

   A book the catalogues have nothing to say about keeps no tags — an invented
   category gets printed on the card, which is the same rule the page count
   takes. */

import { db } from '../db'
import { cooldownRemaining, searchBooks } from '../catalog'
import type { Candidate } from '../catalog'
import { canonTags } from '../tags'
import type { TagSource } from '../tags'
import type { Review } from '../types'
import type { Progress } from './covers'

/** Between two catalogue searches. Every book here takes this path. */
const SEARCH_GAP_MS = 1200

/* Abort-aware: the longest sleep is the end-of-queue cooldown, up to a minute,
   and Stop pressed during it must end the wait rather than be discovered after
   it. Same helper as the cover sweep, for the same reason. */
const sleep = (ms: number, sig?: AbortSignal) =>
  new Promise<void>((r) => {
    if (sig?.aborted) return r()
    const t = setTimeout(done, ms)
    function done() {
      sig?.removeEventListener('abort', done)
      clearTimeout(t)
      r()
    }
    sig?.addEventListener('abort', done)
  })

export type { Progress }

/* The sweep is APP state, not a component's, because two different things start
   it: the app itself, quietly, once per open (an older shelf should get its tags
   without anybody going to look for a button), and the Settings row, when the
   reader wants it now. One run at a time, and the Settings row watches whichever
   one is out — otherwise opening Settings mid-sweep shows an idle row above a
   catalogue that is plainly busy, and pressing the button would start a second
   sweep racing the first for the same allowance. */
export type Sweep = { progress: Progress | null; result: string }

let busy: AbortController | null = null
let state: Sweep = { progress: null, result: '' }
const watchers = new Set<(s: Sweep) => void>()

const snap = (): Sweep => ({
  progress: state.progress ? { ...state.progress } : null,
  result: state.result,
})
const emit = () => {
  const s = snap()
  watchers.forEach((f) => f(s))
}

export const tagSweep = snap
export const tagSweepRunning = (): boolean => busy !== null

export function watchTagSweep(fn: (s: Sweep) => void): () => void {
  watchers.add(fn)
  return () => {
    watchers.delete(fn)
  }
}

/** Stop the sweep whoever started it. */
export function stopTagSweep(): void {
  busy?.abort()
}

/** Loose enough to match an edition whose title carries a subtitle or an
    article the row does not, strict enough not to hand one book another's
    subjects. */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function matches(c: Candidate, rec: Review): boolean {
  const t = norm(c.title)
  const want = norm(rec.title)
  if (!t || !want) return false
  const titleOk = t === want || t.startsWith(want + ' ') || want.startsWith(t + ' ')
  if (!titleOk) return false
  /* The author is the guard against a same-titled different book. A catalogue
     that lists no author is not a mismatch — it simply has not said. */
  const a = norm(c.author)
  const mine = norm(rec.author)
  return !a || !mine || a.includes(mine) || mine.includes(a)
}

/**
 * Fill in missing tags, one book at a time, in the background.
 *
 * Never touches a row that already has tags: they may have been edited by hand
 * on the review, and this is a sweep, not an opinion.
 */
export async function backfillTags(): Promise<void> {
  if (busy) return
  const all = await db.reviews.toArray()
  const todo = all.filter((r) => !r.tags?.length)
  /* Nothing to do is not a run: it would flash an empty bar and a result line
     on a shelf where every book is already tagged. */
  if (!todo.length) return
  busy = new AbortController()
  const signal = busy.signal
  const onProgress = (v: Progress) => {
    state = { progress: v, result: '' }
    emit()
  }
  const p: Progress = { done: 0, total: todo.length, found: 0 }
  onProgress({ ...p })

  const deferred: Review[] = []
  await pass(todo, deferred)
  if (deferred.length && !signal?.aborted) {
    const wait = cooldownRemaining()
    if (wait > 0) {
      p.waiting = true
      onProgress({ ...p })
      await sleep(wait, signal)
      p.waiting = false
      onProgress({ ...p })
    }
    /* One retry pass. A book limited again is the catalogue genuinely
       unavailable — it stays untagged, which is honest, and the sweep can be
       run again later. */
    if (!signal?.aborted) await pass(deferred, null)
  }

  p.current = undefined
  onProgress({ ...p })

  /* The run ends in a sentence rather than in silence, and the sentence
     outlives the run: a sweep that finished while Settings was closed still has
     something to say when it is opened. */
  const left = p.total - p.found
  busy = null
  state = {
    progress: null,
    result:
      p.found === 0
        ? 'No tags found this time \u2014 the catalogues may be rate-limiting; try again in a few minutes.'
        : `${p.found} book${p.found === 1 ? '' : 's'} tagged.` +
          (left > 0 ? ` ${left} still without tags \u2014 run it again later to keep looking.` : ''),
  }
  emit()
  return

  async function pass(list: Review[], defer: Review[] | null) {
    for (const r of list) {
      if (signal?.aborted) return
      p.current = r.title
      onProgress({ ...p })

      const got = await tagsFor(r)
      if (got === 'limited' && defer) {
        defer.push(r)
        p.current = undefined
        onProgress({ ...p })
        continue
      }
      if (got && got !== 'limited' && r.id != null) {
        await db.reviews.update(r.id, { tags: got, editedAt: Date.now() })
        p.found++
      }

      p.done++
      p.current = undefined
      onProgress({ ...p })
      if (signal?.aborted) return
      await sleep(SEARCH_GAP_MS, signal)
    }
  }

  async function tagsFor(rec: Review): Promise<string[] | 'limited' | undefined> {
    const q = `${rec.title} ${rec.author}`.trim()
    if (!q) return undefined
    try {
      const res = await searchBooks(q)
      /* A rate-limited silence is not "this book has no subjects" — it is a
         question nobody answered, so the book goes back in the queue. */
      if (res.limited > 0 && !res.candidates.length) return 'limited'
      const hit = res.candidates.find((c) => matches(c, rec)) ?? res.candidates[0]
      if (!hit) return undefined
      /* `searchBooks` has already canonicalised the merged row's subjects, so
         the ranked list is normally right there. The raw fold is the fallback
         for a candidate that came back from a single catalogue. */
      const subs = hit.subjects ?? {}
      const tags = hit.tags?.length
        ? hit.tags
        : canonTags(
            (Object.keys(subs) as TagSource[]).map((source) => ({ source, labels: subs[source] }))
          )
      return tags.length ? tags : undefined
    } catch {
      return undefined
    }
  }
}
