/* Finding covers for books that arrived without one.

   A Goodreads export carries no artwork whatsoever — not a URL, not a
   thumbnail, nothing. So an import of eighty books lands eighty blank cards,
   and this app's rule is that a cover is real or absent, never generated. That
   leaves going and looking, which means talking to catalogues that rate-limit
   anonymous callers by IP — and eighty searches fired at once is the fastest
   way to be turned away for the next minute.

   Two things make it affordable:

   1. OPEN LIBRARY'S COVER ENDPOINT IS NOT A SEARCH. `covers.openlibrary.org`
      is a static image host addressed by ISBN, and `?default=false` makes it
      answer 404 instead of handing back a blank placeholder that would be
      stored as if it were a cover. It costs no search quota at all, and a
      Goodreads row nearly always has an ISBN13. It is tried first for exactly
      that reason.

   2. THE FALLBACK GOES ONE AT A TIME. `searchBooks` already carries a 60s
      per-source cooldown and a per-query cache, so the sweep's only job is to
      not stampede: one book in flight, a pause between, and a long wait when a
      catalogue says it has had enough.

   Resumability is a property of the query, not of saved progress: the sweep
   only ever looks at rows that have no cover, so stopping it and starting it
   again picks up precisely where it stopped. Nothing needs to be written down,
   and there is no half-finished state to get stale. */

import { db } from '../db'
import { coverToDataUrl, searchBooks } from '../catalog'
import type { Review } from '../types'

/** Between two static cover fetches. Enough to be a queue rather than a burst. */
const CDN_GAP_MS = 120
/** Between two catalogue searches — the expensive path. */
const SEARCH_GAP_MS = 1200
/** After a catalogue turns us away. Its own cooldown is 60s; this outwaits it. */
const LIMITED_WAIT_MS = 65_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Progress {
  done: number
  total: number
  found: number
  /** the book being looked up right now, for the line under the bar */
  current?: string
  /** true while waiting out a rate limit, so the pause can be explained
      rather than looking like a stall */
  waiting?: boolean
}

/** Open Library's static cover host. `default=false` is what makes a miss a
    404 rather than a 1×1 grey placeholder saved as somebody's book. */
function olCover(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`
}

/**
 * Fill in missing covers, one book at a time, in the background.
 *
 * Never touches a row that already has a `cover`: a manual upload and a
 * deliberate pick are both choices, and this is a sweep, not an opinion.
 */
export async function backfillCovers(
  onProgress: (p: Progress) => void,
  signal?: AbortSignal
): Promise<Progress> {
  const all = await db.reviews.toArray()
  const todo = all.filter((r) => !r.cover)
  const p: Progress = { done: 0, total: todo.length, found: 0 }
  onProgress({ ...p })

  for (const r of todo) {
    if (signal?.aborted) break
    p.current = r.title
    onProgress({ ...p })

    const got = await coverFor(r, signal)
    if (got && r.id != null) {
      /* `covers` too, not just `cover` — the edit page's cover grid reads the
         candidate list, and a row with none gets a fresh catalogue search when
         it opens. Storing what we already found saves that. */
      await db.reviews.update(r.id, {
        cover: got.cover,
        covers: got.covers?.length ? got.covers : undefined,
        editedAt: Date.now(),
      })
      p.found++
    }

    p.done++
    p.current = undefined
    onProgress({ ...p })
    if (signal?.aborted) break
    await sleep(got?.viaSearch ? SEARCH_GAP_MS : CDN_GAP_MS)
  }

  p.current = undefined
  onProgress({ ...p })
  return p

  async function coverFor(
    rec: Review,
    sig?: AbortSignal
  ): Promise<{ cover: string; covers?: string[]; viaSearch: boolean } | undefined> {
    /* Cheapest first: the exact edition, by number, off a static host. */
    if (rec.isbn) {
      const url = olCover(rec.isbn)
      const data = await coverToDataUrl(url)
      /* The URL is kept alongside the bytes so the edit page's cover grid has
         a candidate to show without going and searching again. */
      if (data) return { cover: data, covers: [url], viaSearch: false }
    }
    if (sig?.aborted) return undefined

    /* Then the metered path — and only once per book. */
    const q = `${rec.title} ${rec.author}`.trim()
    if (!q) return undefined
    try {
      const res = await searchBooks(q)
      if (res.limited > 0 && !res.candidates.length) {
        p.waiting = true
        onProgress({ ...p })
        await sleep(LIMITED_WAIT_MS)
        p.waiting = false
        onProgress({ ...p })
        /* One retry after the cooldown. A second failure is the catalogue
           genuinely being unavailable, and the sweep can be run again later —
           this row simply stays coverless, which is the honest outcome and not
           recorded as "has no cover". */
        if (sig?.aborted) return undefined
        const again = await searchBooks(q)
        return await fromCandidates(again.candidates)
      }
      return await fromCandidates(res.candidates)
    } catch {
      return undefined
    }
  }

  /* The candidate list is URLs; the card needs bytes. At most three are
     tried: a book whose first three covers are all dead links is not worth a
     fourth request in a sweep of eighty, and it still keeps the whole list on
     the row so the cover stays changeable by hand afterwards. */
  async function fromCandidates(
    cands: { covers: string[] }[]
  ): Promise<{ cover: string; covers: string[]; viaSearch: true } | undefined> {
    const urls = [...new Set(cands.flatMap((c) => c.covers).filter(Boolean))]
    for (const u of urls.slice(0, 3)) {
      const data = await coverToDataUrl(u)
      if (data) return { cover: data, covers: urls, viaSearch: true }
    }
    return undefined
  }
}
