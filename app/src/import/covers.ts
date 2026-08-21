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
import { amazonCover, coverToDataUrl, isbn10Of, otherIsbn, searchBooks } from '../catalog'
import type { Review } from '../types'

/** Between two static cover fetches. Enough to be a queue rather than a burst. */
const CDN_GAP_MS = 120
/** Between two catalogue searches — the expensive path. */
const SEARCH_GAP_MS = 1200
/** After a catalogue turns us away. Its own cooldown is 60s; this outwaits it. */
const LIMITED_WAIT_MS = 65_000

/* Abort-aware, because the longest sleep here is 65 seconds: a Stop pressed
   during the rate-limit wait must end the wait, not be discovered after it. */
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
    await sleep(got?.viaSearch ? SEARCH_GAP_MS : CDN_GAP_MS, signal)
  }

  p.current = undefined
  onProgress({ ...p })
  return p

  async function coverFor(
    rec: Review,
    sig?: AbortSignal
  ): Promise<{ cover: string; covers?: string[]; viaSearch: boolean } | undefined> {
    /* Cheapest first: the exact edition, by number, off a static host —
       under BOTH forms of the number, because Open Library indexes a cover
       by whichever ISBN the edition was catalogued with. */
    if (rec.isbn) {
      const twin = otherIsbn(rec.isbn)
      const ten = isbn10Of(rec.isbn)
      const urls = [
        ...(twin ? [rec.isbn, twin] : [rec.isbn]).map(olCover),
        /* Amazon last: OL's art is usually cleaner, but for an
           Amazon-imprint book it is the only host that answers at all. */
        ...(ten ? [amazonCover(ten)] : []),
      ]
      for (const url of urls) {
        if (sig?.aborted) return undefined
        const data = await coverToDataUrl(url)
        /* The URL is kept alongside the bytes so the edit page's cover grid
           has a candidate to show without going and searching again. */
        if (data) return { cover: data, covers: [url], viaSearch: false }
        await sleep(CDN_GAP_MS, sig)
      }
    }
    if (sig?.aborted) return undefined

    /* Then the metered path — and only once per book (plus one retry with
       the subtitle cut: a colon subtitle is the commonest reason a search
       misses a book the catalogues actually hold). */
    const q = `${rec.title} ${rec.author}`.trim()
    if (!q) return undefined
    try {
      const res = await searchBooks(q)
      if (res.limited > 0 && !res.candidates.length) {
        p.waiting = true
        onProgress({ ...p })
        await sleep(LIMITED_WAIT_MS, sig)
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
      const got = await fromCandidates(res.candidates)
      if (got) return got
      /* Nothing usable under the full title. If it carries a subtitle, try
         once more without it — same author, so the risk of the wrong book is
         small, and a wrong cover would still only be a CANDIDATE fetch that
         has to match this title's search. */
      const short = rec.title.split(':')[0].trim()
      if (sig?.aborted || !short || short === rec.title.trim()) return undefined
      await sleep(SEARCH_GAP_MS, sig)
      if (sig?.aborted) return undefined
      const retry = await searchBooks(`${short} ${rec.author}`.trim())
      return await fromCandidates(retry.candidates)
    } catch {
      return undefined
    }
  }

  /* The candidate list is URLs; the card needs bytes. Google's cover host
     (`books.google.com/books/content`) sends no CORS headers, so a fetch of
     it can NEVER become a data URL — measured, not assumed — which is why it
     sorts to the back: a book whose first candidates are all Google's would
     otherwise spend every attempt on requests that cannot succeed. Six
     attempts, not unlimited: a book whose first six reachable covers are all
     dead is not worth a seventh request in a sweep of eighty. The whole list
     still lands on the row so the cover stays changeable by hand afterwards. */
  async function fromCandidates(
    cands: { covers: string[] }[]
  ): Promise<{ cover: string; covers: string[]; viaSearch: true } | undefined> {
    const urls = [...new Set(cands.flatMap((c) => c.covers).filter(Boolean))]
    const corsBlocked = (u: string) => u.includes('books.google.')
    const tryable = [...urls.filter((u) => !corsBlocked(u)), ...urls.filter(corsBlocked)]
    for (const u of tryable.slice(0, 6)) {
      const data = await coverToDataUrl(u)
      if (data) return { cover: data, covers: urls, viaSearch: true }
    }
    return undefined
  }
}
